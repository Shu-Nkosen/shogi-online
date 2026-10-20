import { describe, expect, it } from 'vitest';
import { RON_FULL, RON_SHORT, ronHapticPattern, ronPhaseAt, easeOutBackStrong, easeOutExpo, easeInExpo, type RonTimeline } from './ronTimeline.ts';
import { createPlayhead } from './timeline.ts';
import { FULL_SECONDS, SHORT_SECONDS, resolvePlayback } from './settings.ts';

const beats = (tl: RonTimeline) => {
  const { eyes: _eyes, ...times } = tl;
  return times;
};

describe('和了風タイムライン', () => {
  it('runs every beat in a sensible order', () => {
    for (const tl of [RON_FULL, RON_SHORT]) {
      const order: (keyof ReturnType<typeof beats>)[] = [
        'freeze', 'slash', 'girlIn', 'fanHit', 'girlOut', 'girlGone', 'impact', 'flash', 'slam', 'climaxEnd', 'snap', 'land', 'end',
      ];
      for (let i = 1; i < order.length; i++) expect(tl[order[i]]).toBeGreaterThanOrEqual(tl[order[i - 1]]);
      expect(Math.max(...Object.values(beats(tl)))).toBe(tl.end);
      expect(tl.kanji).toBeLessThan(tl.slam);
      expect(tl.sub).toBeGreaterThanOrEqual(tl.slam);
    }
    expect(RON_FULL.eyes).toBe(true);
    expect(RON_SHORT.eyes).toBe(false);
    expect(RON_FULL.eyesIn).toBeLessThan(RON_FULL.eyesSettle);
    expect(RON_FULL.eyesGlint).toBeLessThan(RON_FULL.eyesOut);
  });

  it('has strong 緩急: a slow freeze and hold, then very fast cuts', () => {
    // ゆっくり：止まった世界とカットインの見せ場
    expect(RON_FULL.slash - RON_FULL.freeze).toBeGreaterThanOrEqual(0.7);
    expect(RON_FULL.girlOut - RON_FULL.fanHit).toBeGreaterThanOrEqual(1);
    // 速い：目の滑り込み・キャラの飛び込み・戻り
    expect(RON_FULL.eyesSettle - RON_FULL.eyesIn).toBeLessThan(0.35);
    expect(RON_FULL.fanHit - RON_FULL.girlIn).toBeLessThan(0.45);
    expect(RON_FULL.land - RON_FULL.snap).toBeLessThan(0.4);
    expect(RON_SHORT.land - RON_SHORT.snap).toBeLessThan(0.3);
  });

  it('walks phases in order, skipping the eye close-up in the short version', () => {
    const walk = (tl: RonTimeline) => {
      const seen: string[] = [];
      for (let t = 0; t <= tl.end + 0.01; t += 0.004) {
        const p = ronPhaseAt(tl, t);
        if (seen[seen.length - 1] !== p) seen.push(p);
      }
      return seen;
    };
    expect(walk(RON_FULL)).toEqual(['freeze', 'slash', 'eyes', 'cutin', 'impact', 'burst', 'climax', 'snap', 'settle', 'done']);
    expect(walk(RON_SHORT)).not.toContain('eyes');
    expect(walk(RON_SHORT).slice(-4)).toEqual(['climax', 'snap', 'settle', 'done']);
  });

  it('matches the setting lengths (フル≈9.6秒 / ショート≈3.2秒)', () => {
    expect(FULL_SECONDS).toBe(RON_FULL.end);
    expect(SHORT_SECONDS).toBe(RON_SHORT.end);
    expect(resolvePlayback('short', false)).toEqual({ kind: 'cinematic', duration: RON_SHORT.end, calm: false });
  });

  it('plays in real time at any refresh rate', () => {
    for (const hz of [30, 60, 120, 144]) {
      const head = createPlayhead(500, RON_FULL);
      let now = 500;
      let frames = 0;
      while (!head.done(now)) {
        now += 1000 / hz;
        frames++;
      }
      expect((now - 500) / 1000).toBeCloseTo(RON_FULL.end, 1);
      expect(frames).toBeGreaterThanOrEqual(Math.floor(RON_FULL.end * hz));
    }
  });

  it('uses snappy easing curves', () => {
    expect(easeOutExpo(0)).toBeCloseTo(0);
    expect(easeOutExpo(1)).toBe(1);
    expect(easeOutExpo(0.2)).toBeGreaterThan(0.7); // ほとんど一瞬で到達
    expect(easeInExpo(0.5)).toBeLessThan(0.05); // 溜めてから一気に
    expect(easeInExpo(1)).toBeCloseTo(1);
    const peak = Math.max(...Array.from({ length: 101 }, (_, i) => easeOutBackStrong(i / 100)));
    expect(peak).toBeGreaterThan(1.1); // 大きめのオーバーシュート
    expect(easeOutBackStrong(1)).toBeCloseTo(1);
  });

  it('builds a valid vibration pattern', () => {
    for (const tl of [RON_FULL, RON_SHORT]) {
      const pat = ronHapticPattern(tl);
      expect(pat.length % 2).toBe(0);
      expect(pat.every((v) => Number.isFinite(v) && v >= 0)).toBe(true);
      const total = pat.reduce((a, b) => a + b, 0);
      expect(total).toBeLessThanOrEqual(tl.end * 1000 + 1);
    }
  });
});
