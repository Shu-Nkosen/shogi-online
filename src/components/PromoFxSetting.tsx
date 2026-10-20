import { useEffect, useState } from 'react';
import { loadPromoFx, onPromoFxChange, PROMO_FX_MODES, savePromoFx, type PromoFxMode } from '../fx/settings.ts';
import { cn } from '../lib/utils.ts';

const SHORT_LABEL: Record<PromoFxMode, string> = { full: 'フル', short: 'ショート', off: 'オフ' };
const TITLE: Record<PromoFxMode, string> = {
  full: '約10秒のフル演出',
  short: '約2秒の短い演出',
  off: '演出なし（駒が裏返るだけ）',
};

export function usePromoFx(): [PromoFxMode, (mode: PromoFxMode) => void] {
  const [mode, setMode] = useState<PromoFxMode>(() => loadPromoFx());
  useEffect(() => onPromoFxChange(setMode), []);
  return [mode, (next) => savePromoFx(next)];
}

/** 成り演出の長さ（フル／ショート／オフ）を切り替えるセグメント。 */
export function PromoFxSetting({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = usePromoFx();
  return (
    <div className={cn('fx-setting', compact && 'is-compact')} role="radiogroup" aria-label="成りの演出">
      <span className="fx-setting-label">成り演出</span>
      {PROMO_FX_MODES.map((item) => (
        <button
          key={item}
          type="button"
          role="radio"
          aria-checked={mode === item}
          title={TITLE[item]}
          className={cn('fx-chip', mode === item && 'is-on')}
          data-testid={`promo-fx-${item}`}
          onClick={() => setMode(item)}
        >
          {SHORT_LABEL[item]}
        </button>
      ))}
    </div>
  );
}
