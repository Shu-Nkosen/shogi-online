/**
 * 雀魂の和了演出のような「緩急」を持つ成り演出のタイムライン（秒、実時間）。
 *
 * 止める → 斬る → 目元 → カットイン → 叫び（爆発・成）→ 一瞬で戻る
 * ゆっくり（静止・溜め）と一瞬（斬撃・ムチのような出入り）を交互に置く。
 */
export interface RonTimeline {
  /** 時が止まる：盤が色を失い、駒にゆっくり寄る */
  freeze: number;
  tink: number;
  /** 斜めの斬撃が画面を割る */
  slash: number;
  bandIn: number;
  /** 目元：一瞬で滑り込み → ほぼ止まる → ムチのように抜ける */
  eyesIn: number;
  eyesSettle: number;
  eyesGlint: number;
  eyesOut: number;
  bandOut: number;
  /** 少女のカットイン：横から飛び込み、扇を突き出す瞬間が拍に乗る */
  girlIn: number;
  fanHit: number;
  girlOut: number;
  girlGone: number;
  /** 叫び：白黒の衝撃コマ → 閃光・爆発 → 裏返り → 「成」叩きつけ */
  impact: number;
  flash: number;
  flipEnd: number;
  kanji: number;
  slam: number;
  sub: number;
  confettiEnd: number;
  climaxEnd: number;
  /** 一瞬で盤へ戻る */
  snap: number;
  land: number;
  end: number;
  /** 目元のカットを入れるか（ショート版は省く） */
  eyes: boolean;
}

export const RON_FULL: RonTimeline = {
  freeze: 0,
  tink: 0.06,
  slash: 0.95,
  bandIn: 1.0,
  eyesIn: 1.04,
  eyesSettle: 1.3,
  eyesGlint: 1.68,
  eyesOut: 2.36,
  bandOut: 2.46,
  girlIn: 2.6,
  fanHit: 2.96,
  girlOut: 4.36,
  girlGone: 4.56,
  impact: 4.6,
  flash: 4.78,
  flipEnd: 5.3,
  kanji: 5.26,
  slam: 5.4,
  sub: 6.4,
  confettiEnd: 7.6,
  climaxEnd: 8.5,
  snap: 8.55,
  land: 8.88,
  end: 9.6,
  eyes: true,
};

export const RON_SHORT: RonTimeline = {
  freeze: 0,
  tink: 0.03,
  slash: 0.3,
  bandIn: 0.3,
  eyesIn: 0.3,
  eyesSettle: 0.3,
  eyesGlint: 0.3,
  eyesOut: 0.3,
  bandOut: 0.3,
  girlIn: 0.32,
  fanHit: 0.6,
  girlOut: 1.24,
  girlGone: 1.4,
  impact: 1.42,
  flash: 1.56,
  flipEnd: 1.98,
  kanji: 1.86,
  slam: 2.0,
  sub: 2.2,
  confettiEnd: 2.6,
  climaxEnd: 2.72,
  snap: 2.74,
  land: 2.98,
  end: 3.2,
  eyes: false,
};

export type RonPhase = 'freeze' | 'slash' | 'eyes' | 'cutin' | 'impact' | 'burst' | 'climax' | 'snap' | 'settle' | 'done';

export function ronPhaseAt(tl: RonTimeline, t: number): RonPhase {
  if (t < tl.slash) return 'freeze';
  if (tl.eyes && t < tl.eyesIn) return 'slash';
  if (tl.eyes && t < tl.bandOut + 0.12) return 'eyes';
  if (t < tl.impact) return 'cutin';
  if (t < tl.flash) return 'impact';
  if (t < tl.kanji) return 'burst';
  if (t < tl.snap) return 'climax';
  if (t < tl.land) return 'snap';
  if (t < tl.end) return 'settle';
  return 'done';
}

/** 強いイージング（緩急） */
export const easeOutExpo = (p: number) => (p >= 1 ? 1 : 1 - 2 ** (-10 * p));
export const easeInExpo = (p: number) => (p <= 0 ? 0 : 2 ** (10 * p - 10));
/** 大きく行き過ぎて戻る（カットイン用） */
export const easeOutBackStrong = (p: number) => {
  const c1 = 2.4;
  const c3 = c1 + 1;
  return 1 + c3 * (p - 1) ** 3 + c1 * (p - 1) ** 2;
};

/** バイブレーション（ミリ秒、off/on 交互で 0 から開始） */
export function ronHapticPattern(tl: RonTimeline): number[] {
  const ms = (s: number) => Math.round(s * 1000);
  const hits: [number, number][] = [[tl.tink, 12]];
  if (tl.eyes) hits.push([tl.slash, 25]);
  hits.push([tl.fanHit, 60], [tl.impact, 40], [tl.flash, 320], [tl.slam, 140], [tl.land, 40]);
  const pattern: number[] = [];
  let cursor = 0;
  for (const [at, length] of hits) {
    const start = Math.max(cursor, ms(at));
    pattern.push(start - cursor, length);
    cursor = start + length;
  }
  return pattern;
}
