import { describe, expect, it } from 'vitest';
import type { Move } from '../engine/types.ts';
import { finishFx, initDisplay, isIdle, pushDisplay, resetDisplay } from './displayQueue.ts';
import { loadPromoFx, nextPromoFx, parsePromoFx, PROMO_FX_KEY, resolvePlayback, savePromoFx } from './settings.ts';
import { FULL_TIMELINE, hapticPattern, phaseAt, timelineFor } from './timeline.ts';

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
    expect(resolvePlayback('full', false)).toEqual({ kind: 'cinematic', duration: 10, calm: false });
    expect(resolvePlayback('short', false)).toEqual({ kind: 'cinematic', duration: 2.2, calm: false });
    expect(resolvePlayback('off', false)).toEqual({ kind: 'flip' });
    const calm = resolvePlayback('full', true);
    expect(calm.kind === 'cinematic' && calm.calm && calm.duration <= 2).toBe(true);
    expect(resolvePlayback('off', true)).toEqual({ kind: 'flip' });
  });
});

describe('timeline', () => {
  it('walks through every phase in order for full and short', () => {
    for (const tl of [timelineFor(10, false), timelineFor(2.2, false), timelineFor(1.6, true)]) {
      const seen: string[] = [];
      for (let t = 0; t <= tl.end + 0.01; t += 0.005) {
        const phase = phaseAt(tl, t);
        if (seen[seen.length - 1] !== phase) seen.push(phase);
      }
      expect(seen.filter((phase) => phase !== 'impact')).toEqual(['charge', 'burst', 'climax', 'settle', 'done']);
      const values = Object.values(tl);
      expect(Math.max(...values)).toBe(tl.end);
    }
    expect(timelineFor(10, false)).toEqual(FULL_TIMELINE);
    expect(timelineFor(2.2, false).end).toBeCloseTo(2.2);
    expect(timelineFor(1.6, true).end).toBeCloseTo(1.6);
  });

  it('builds a vibration pattern that fits inside the effect', () => {
    const pattern = hapticPattern(FULL_TIMELINE, false);
    expect(pattern.every((ms) => Number.isFinite(ms) && ms >= 0)).toBe(true);
    expect(pattern.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(FULL_TIMELINE.end * 1000);
    expect(hapticPattern(FULL_TIMELINE, true)).toEqual([]);
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
