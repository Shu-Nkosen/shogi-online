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
