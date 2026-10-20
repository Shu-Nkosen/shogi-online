import { pieceChar } from '../engine/pieces.ts';
import type { Color, PieceType } from '../engine/types.ts';
import { cn } from '../lib/utils.ts';

interface KomaProps {
  type: PieceType;
  color: Color;
  promoted: boolean;
  selected?: boolean;
  className?: string;
}

export function Koma({ type, color, promoted, selected = false, className }: KomaProps) {
  return (
    <div className={cn('koma', promoted && 'is-promoted', selected && 'is-lifted', className)} data-promoted={promoted ? '1' : '0'}>
      <span>{pieceChar(type, promoted, color)}</span>
    </div>
  );
}

interface SsjAuraProps {
  /** アニメーションの位相をずらすための数（マス番号など） */
  seed?: number;
  big?: boolean;
}

/** 成り駒のまわりに立ちのぼる金色のオーラ（炎＋ときどき青白い稲妻）。CSS アニメーションだけで描く。 */
export function SsjAura({ seed = 0, big = false }: SsjAuraProps) {
  const style = {
    ['--d' as string]: `${-((seed * 0.37) % 1.3).toFixed(2)}s`,
    ['--z' as string]: `${-((seed * 1.13) % 4.1).toFixed(2)}s`,
  };
  return (
    <span className={cn('ssj', big && 'is-big')} style={style} aria-hidden="true">
      <i className="ssj-glow" />
      <i className="ssj-flame f1" />
      <i className="ssj-flame f2" />
      <i className="ssj-flame f3" />
      <i className="ssj-zap z1" />
      <i className="ssj-zap z2" />
    </span>
  );
}
