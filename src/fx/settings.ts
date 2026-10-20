export type PromoFxMode = 'full' | 'short' | 'off';
export const PROMO_FX_MODES: readonly PromoFxMode[] = ['full', 'short', 'off'];
export const PROMO_FX_KEY = 'shogi.promoFx';

export const FULL_SECONDS = 10;
export const SHORT_SECONDS = 3.8;
export const CALM_SECONDS = 2.6;

export function parsePromoFx(value: unknown): PromoFxMode {
  return value === 'short' || value === 'off' || value === 'full' ? value : 'full';
}

function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadPromoFx(storage: Pick<Storage, 'getItem'> | null = store()): PromoFxMode {
  try {
    return parsePromoFx(storage?.getItem(PROMO_FX_KEY));
  } catch {
    return 'full';
  }
}

/** 利用者が自分で選んだ設定があるか（なければ null）。 */
export function loadPromoFxChoice(storage: Pick<Storage, 'getItem'> | null = store()): PromoFxMode | null {
  try {
    const raw = storage?.getItem(PROMO_FX_KEY);
    return raw === 'full' || raw === 'short' || raw === 'off' ? raw : null;
  } catch {
    return null;
  }
}

export function savePromoFx(mode: PromoFxMode, storage: Pick<Storage, 'setItem'> | null = store()): void {
  try {
    storage?.setItem(PROMO_FX_KEY, mode);
  } catch {
    // 保存できない環境では今回だけ有効
  }
  listeners.forEach((listener) => listener(mode));
}

const listeners = new Set<(mode: PromoFxMode) => void>();
export function onPromoFxChange(listener: (mode: PromoFxMode) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function nextPromoFx(mode: PromoFxMode): PromoFxMode {
  return PROMO_FX_MODES[(PROMO_FX_MODES.indexOf(mode) + 1) % PROMO_FX_MODES.length] ?? 'full';
}

export function promoFxLabel(mode: PromoFxMode): string {
  return mode === 'full' ? 'フル（約10秒）' : mode === 'short' ? 'ショート（約4秒）' : 'オフ（裏返しのみ）';
}

export function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export type Playback = { kind: 'cinematic'; duration: number; calm: boolean } | { kind: 'flip' };

/**
 * 設定と OS の「動きを減らす」から、実際に再生する演出を決める。
 * OS 設定で控えめ版にするのは、利用者がまだ自分で選んでいないときだけ。
 * 「フル」「ショート」を明示的に選んだら、その長さで再生する。
 */
export function resolvePlayback(mode: PromoFxMode | null, reducedMotion: boolean): Playback {
  if (mode === 'off') return { kind: 'flip' };
  if (mode === null && reducedMotion) return { kind: 'cinematic', duration: CALM_SECONDS, calm: true };
  if (mode === null) return { kind: 'cinematic', duration: FULL_SECONDS, calm: false };
  return { kind: 'cinematic', duration: mode === 'full' ? FULL_SECONDS : SHORT_SECONDS, calm: false };
}
