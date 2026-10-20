/** 成り演出のタイムライン（秒）。フル版を基準に、ショート版は全体を縮める。 */
export interface Timeline {
  lift: number;
  chargeEnd: number;
  impact: number;
  flash: number;
  flipEnd: number;
  punchEnd: number;
  kanji: number;
  slam: number;
  sub: number;
  confettiEnd: number;
  climaxEnd: number;
  settle: number;
  land: number;
  end: number;
}

export const FULL_TIMELINE: Timeline = {
  lift: 1.1,
  chargeEnd: 3.1,
  impact: 3.1,
  flash: 3.28,
  flipEnd: 3.8,
  punchEnd: 4.4,
  kanji: 4.5,
  slam: 4.64,
  sub: 6.5,
  confettiEnd: 7.4,
  climaxEnd: 7.9,
  settle: 8.0,
  land: 9.55,
  end: 10,
};

const CALM_TIMELINE: Timeline = {
  lift: 0.35,
  chargeEnd: 0.35,
  impact: 0.35,
  flash: 0.36,
  flipEnd: 0.8,
  punchEnd: 0.8,
  kanji: 0.55,
  slam: 0.75,
  sub: 0.8,
  confettiEnd: 0.8,
  climaxEnd: 1.1,
  settle: 1.12,
  land: 1.55,
  end: 1.6,
};

export function timelineFor(duration: number, calm: boolean): Timeline {
  if (calm) return CALM_TIMELINE;
  const scale = duration / FULL_TIMELINE.end;
  const out = {} as Timeline;
  for (const key of Object.keys(FULL_TIMELINE) as (keyof Timeline)[]) out[key] = FULL_TIMELINE[key] * scale;
  return out;
}

export type Phase = 'charge' | 'impact' | 'burst' | 'climax' | 'settle' | 'done';

export function phaseAt(tl: Timeline, t: number): Phase {
  if (t < tl.impact) return 'charge';
  if (t < tl.flash) return 'impact';
  if (t < tl.kanji) return 'burst';
  if (t < tl.settle) return 'climax';
  if (t < tl.end) return 'settle';
  return 'done';
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
export const easeOutCubic = (p: number) => 1 - (1 - p) ** 3;
export const easeInCubic = (p: number) => p * p * p;
export const easeInOutCubic = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
export const easeOutBack = (p: number) => {
  const c1 = 1.9;
  const c3 = c1 + 1;
  return 1 + c3 * (p - 1) ** 3 + c1 * (p - 1) ** 2;
};
/** 区間 [a, b] の中での進み具合 0..1 */
export const span = (t: number, a: number, b: number) => clamp01((t - a) / Math.max(1e-6, b - a));

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** バイブレーションのパターン（ミリ秒、on/off 交互）。演出の山に合わせる。 */
export function hapticPattern(tl: Timeline, calm: boolean): number[] {
  if (calm) return [];
  const ms = (s: number) => Math.round(s * 1000);
  const pattern: number[] = [];
  let cursor = ms(tl.lift * 0.4);
  pattern.push(cursor); // 最初は待つ（off から始めるため 0 振動）
  pattern.unshift(0);
  let gap = 170;
  while (cursor + gap + 40 < ms(tl.impact)) {
    pattern.push(30, gap);
    cursor += 30 + gap;
    gap = Math.max(35, gap * 0.82);
  }
  pattern.push(0, Math.max(0, ms(tl.flash) - cursor));
  cursor = ms(tl.flash);
  pattern.push(380, Math.max(0, ms(tl.slam) - cursor - 380));
  pattern.push(130, 60, 70);
  return pattern;
}
