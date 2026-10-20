import { describe, expect, it } from 'vitest';
import type { Move } from '../engine/types.ts';
import { finishFx, initDisplay, isIdle, pushDisplay, resetDisplay } from './displayQueue.ts';
import { loadPromoFx, loadPromoFxChoice, nextPromoFx, parsePromoFx, PROMO_FX_KEY, resolvePlayback, savePromoFx } from './settings.ts';
import { CALM_TIMELINE, createPlayhead, FULL_TIMELINE, hapticPattern, phaseAt, SHORT_TIMELINE, timelineFor } from './timeline.ts';

const move = (from: number | null, to: number, promote = false): Move => ({
  from,
  to,
  piece: 'silver',
  promote,
  capture: null,
  capturedPromoted: false,
  alreadyPromoted: false,
});

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    data,
  };
}

describe('promotion effect setting', () => {
  it('defaults to full and ignores junk', () => {
    expect(loadPromoFx(memoryStorage())).toBe('full');
    expect(loadPromoFx(memoryStorage({ [PROMO_FX_KEY]: 'loud' }))).toBe('full');
    expect(parsePromoFx(undefined)).toBe('full');
    expect(loadPromoFx(null)).toBe('full');
  });

  it('round-trips through storage and cycles', () => {
    const storage = memoryStorage();
    savePromoFx('short', storage);
    expect(storage.data.get(PROMO_FX_KEY)).toBe('short');
    expect(loadPromoFx(storage)).toBe('short');
    expect(nextPromoFx('full')).toBe('short');
    expect(nextPromoFx('short')).toBe('off');
    expect(nextPromoFx('off')).toBe('full');
  });

  it('resolves playback length and the calm reduced-motion version', () => {
    expect(resolvePlayback('full', false)).toEqual({ kind: 'cinematic', duration: 9.6, calm: false });
    expect(resolvePlayback(null, false)).toEqual({ kind: 'cinematic', duration: 9.6, calm: false });
    expect(resolvePlayback('short', false)).toEqual({ kind: 'cinematic', duration: 3.2, calm: false });
    expect(resolvePlayback('off', false)).toEqual({ kind: 'flip' });
    // 自分で選んでいないときだけ OS の「動きを減らす」で控えめ版になる
    expect(resolvePlayback(null, true)).toEqual({ kind: 'cinematic', duration: 2.6, calm: true });
    expect(resolvePlayback('full', true)).toEqual({ kind: 'cinematic', duration: 9.6, calm: false });
    expect(resolvePlayback('short', true)).toEqual({ kind: 'cinematic', duration: 3.2, calm: false });
    expect(resolvePlayback('off', true)).toEqual({ kind: 'flip' });
  });

  it('tells an explicit choice apart from the default', () => {
    expect(loadPromoFxChoice(memoryStorage())).toBeNull();
    expect(loadPromoFxChoice(memoryStorage({ [PROMO_FX_KEY]: 'junk' }))).toBeNull();
    expect(loadPromoFxChoice(memoryStorage({ [PROMO_FX_KEY]: 'full' }))).toBe('full');
    expect(loadPromoFxChoice(null)).toBeNull();
  });
});

describe('timeline', () => {
  it('walks through every phase in order for full and short', () => {
    for (const tl of [timelineFor(10, false), timelineFor(3.8, false), timelineFor(2.6, true)]) {
      const seen: string[] = [];
      for (let t = 0; t <= tl.end + 0.01; t += 0.005) {
        const phase = phaseAt(tl, t);
        if (seen[seen.length - 1] !== phase) seen.push(phase);
      }
      expect(seen.filter((phase) => phase !== 'impact')).toEqual(['charge', 'burst', 'climax', 'settle', 'done']);
      const { pace: _pace, ...times } = tl;
      expect(Math.max(...Object.values(times))).toBe(tl.end);
    }
    expect(timelineFor(10, false)).toEqual(FULL_TIMELINE);
    expect(timelineFor(3.8, false)).toBe(SHORT_TIMELINE);
    expect(timelineFor(2.6, true)).toBe(CALM_TIMELINE);
  });

  it('short version keeps the burst and slam at full speed instead of fast-forwarding', () => {
    const gap = (tl: typeof FULL_TIMELINE, a: keyof typeof FULL_TIMELINE, b: keyof typeof FULL_TIMELINE) => tl[b] - tl[a];
    for (const [a, b] of [['impact', 'flash'], ['flash', 'flipEnd'], ['kanji', 'slam']] as const) {
      expect(gap(SHORT_TIMELINE, a, b)).toBeCloseTo(gap(FULL_TIMELINE, a, b), 2);
    }
    expect(SHORT_TIMELINE.pace).toBe(1);
    expect(CALM_TIMELINE.end).toBeGreaterThanOrEqual(2.5);
  });

  it('builds a vibration pattern that fits inside the effect', () => {
    const pattern = hapticPattern(FULL_TIMELINE, false);
    expect(pattern.every((ms) => Number.isFinite(ms) && ms >= 0)).toBe(true);
    expect(pattern.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(FULL_TIMELINE.end * 1000);
    expect(hapticPattern(FULL_TIMELINE, true)).toEqual([]);
  });
});

/** 指定の fps で rAF を回したとして、各フェーズに入った時刻（実時間・秒）を集める */
function simulate(fps: number, tl = FULL_TIMELINE, drops: (frame: number) => number = () => 0) {
  const startMs = 1234.5;
  const head = createPlayhead(startMs, tl);
  const entered = new Map<string, number>();
  let now = startMs;
  let frames = 0;
  while (!head.done(now)) {
    const t = head.at(now);
    const phase = phaseAt(tl, t);
    if (!entered.has(phase)) entered.set(phase, (now - startMs) / 1000);
    frames += 1;
    now += (1000 / fps) * (1 + drops(frames));
  }
  return { entered, total: (now - startMs) / 1000, frames };
}

describe('real-time playhead', () => {
  it('lasts ~10 s with phases on time at 30/60/120/144 fps', () => {
    const results = [30, 60, 120, 144].map((fps) => ({ fps, ...simulate(fps) }));
    for (const { fps, entered, total } of results) {
      const frame = 1 / fps;
      expect(total).toBeGreaterThanOrEqual(10);
      expect(total).toBeLessThan(10 + frame + 1e-9);
      expect(entered.get('charge')).toBe(0);
      expect(entered.get('burst')! - FULL_TIMELINE.flash).toBeGreaterThanOrEqual(0);
      expect(entered.get('burst')! - FULL_TIMELINE.flash).toBeLessThan(frame + 1e-9);
      expect(entered.get('climax')! - FULL_TIMELINE.kanji).toBeLessThan(frame + 1e-9);
      expect(entered.get('settle')! - FULL_TIMELINE.settle).toBeLessThan(frame + 1e-9);
    }
    // 画面が速くても遅くても、フレーム数が変わるだけで長さは同じ
    expect(results[3]!.frames).toBeGreaterThan(results[0]!.frames * 4);
  });

  it('frame drops skip ahead instead of slowing down or speeding up', () => {
    const jank = simulate(60, FULL_TIMELINE, (frame) => (frame % 13 === 0 ? 9 : 0));
    expect(jank.total).toBeGreaterThanOrEqual(10);
    expect(jank.total).toBeLessThan(10.2);
    expect(Math.abs(jank.entered.get('climax')! - FULL_TIMELINE.kanji)).toBeLessThan(0.17);
  });

  it('clamps before the start and after the end', () => {
    const head = createPlayhead(1000, FULL_TIMELINE);
    expect(head.at(900)).toBe(0);
    expect(head.at(1000 + 4640)).toBeCloseTo(4.64);
    expect(head.at(1000 + 60_000)).toBe(10);
    expect(head.done(1000 + 9999)).toBe(false);
    expect(head.done(1000 + 10_000)).toBe(true);
  });
});

describe('display queue', () => {
  it('shows a move at once when idle', () => {
    const d = pushDisplay(initDisplay('g0'), 'g1', move(10, 1, true));
    expect(d.shown).toBe('g1');
    expect(d.fx?.move.promote).toBe(true);
    expect(isIdle(d)).toBe(false);
  });

  it('queues moves that arrive during an effect and plays them in order', () => {
    let d = pushDisplay(initDisplay('g0'), 'g1', move(10, 1, true));
    d = pushDisplay(d, 'g2', move(70, 61));
    d = pushDisplay(d, 'g3', move(20, 11));
    expect(d.shown).toBe('g1');
    expect(d.queue).toHaveLength(2);
    d = finishFx(d);
    expect(d.shown).toBe('g2');
    expect(d.fx?.move.from).toBe(70);
    d = finishFx(d);
    expect(d.shown).toBe('g3');
    d = finishFx(d);
    expect(isIdle(d)).toBe(true);
    expect(d.shown).toBe('g3');
  });

  it('collapses state-only updates and applies drops without animation', () => {
    let d = pushDisplay(initDisplay('g0'), 'g1', move(10, 1, true));
    d = pushDisplay(d, 'echo-a', null);
    d = pushDisplay(d, 'echo-b', null);
    expect(d.queue).toHaveLength(1);
    d = pushDisplay(d, 'g2', move(null, 40));
    d = finishFx(d);
    expect(d.shown).toBe('g2');
    expect(d.fx).toBeNull();
    expect(isIdle(d)).toBe(true);
    const idle = pushDisplay(initDisplay('a'), 'b', move(null, 3));
    expect(idle.shown).toBe('b');
    expect(idle.fx).toBeNull();
  });

  it('reset drops everything pending', () => {
    let d = pushDisplay(initDisplay('g0'), 'g1', move(10, 1, true));
    d = pushDisplay(d, 'g2', move(70, 61));
    d = resetDisplay(d, 'fresh');
    expect(d).toMatchObject({ shown: 'fresh', fx: null, queue: [] });
  });
});
