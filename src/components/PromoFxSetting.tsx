import { useEffect, useState } from 'react';
import { loadPromoFxChoice, onPromoFxChange, PROMO_FX_MODES, prefersReducedMotion, savePromoFx, type PromoFxMode } from '../fx/settings.ts';
import { cn } from '../lib/utils.ts';

const SHORT_LABEL: Record<PromoFxMode, string> = { full: 'フル', short: 'ショート', off: 'オフ' };
const TITLE: Record<PromoFxMode, string> = {
  full: '約10秒のフル演出',
  short: '約3秒の短い演出（カットインだけ）',
  off: '演出なし（駒が裏返るだけ）',
};

/** 利用者が選んだ設定（まだ選んでいなければ null）。 */
export function usePromoFx(): [PromoFxMode | null, (mode: PromoFxMode) => void] {
  const [mode, setMode] = useState<PromoFxMode | null>(() => loadPromoFxChoice());
  useEffect(() => onPromoFxChange(setMode), []);
  return [mode, (next) => savePromoFx(next)];
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return undefined;
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);
  return reduced;
}

/** 成り演出の長さ（フル／ショート／オフ）を切り替えるセグメント。 */
export function PromoFxSetting({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = usePromoFx();
  const reduced = useReducedMotion();
  // まだ選んでいない＆端末が「動きを減らす」なら控えめ版。どのチップも点けずに理由を出す
  const calmAuto = mode === null && reduced;
  const active: PromoFxMode | null = mode ?? (calmAuto ? null : 'full');
  return (
    <div className={cn('fx-setting', compact && 'is-compact')} role="radiogroup" aria-label="成りの演出">
      <span className="fx-setting-label">成り演出</span>
      {PROMO_FX_MODES.map((item) => (
        <button
          key={item}
          type="button"
          role="radio"
          aria-checked={active === item}
          title={TITLE[item]}
          className={cn('fx-chip', active === item && 'is-on')}
          data-testid={`promo-fx-${item}`}
          onClick={() => setMode(item)}
        >
          {SHORT_LABEL[item]}
        </button>
      ))}
      {calmAuto ? (
        <span className="fx-setting-note" data-testid="promo-fx-calm-note">
          端末の「動きを減らす」がオンのため控えめ版（約2.6秒）です。フルを選ぶと10秒版になります。
        </span>
      ) : null}
    </div>
  );
}
