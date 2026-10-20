import { pieceChar } from '../engine/pieces.ts';
import { HAND_TYPES, type Color, type PieceType, type State } from '../engine/types.ts';
import { cn } from '../lib/utils.ts';

interface StandProps {
  state: State;
  color: Color;
  label: string;
  active: boolean;
  selectable: boolean;
  selected: PieceType | null;
  onSelect: (piece: PieceType) => void;
}

export function Stand({ state, color, label, active, selectable, selected, onSelect }: StandProps) {
  const hand = state.hands[color];
  const pieces = HAND_TYPES.filter((type) => hand[type] > 0);
  return (
    <section className={cn('stand', active && 'is-active')} aria-label={`${label}の持ち駒`}>
      <header>
        <span className="stand-name">{label}</span>
        <span className="stand-side">{color === 'sente' ? '先手' : '後手'}</span>
      </header>
      <div className="stand-pieces">
        {pieces.length === 0 ? <p className="stand-empty">持ち駒なし</p> : null}
        {pieces.map((type) => (
          <button
            key={type}
            type="button"
            className={cn('hand-piece', selected === type && 'is-selected')}
            data-testid={`hand-${color}-${type}`}
            disabled={!selectable}
            onClick={() => onSelect(type)}
            aria-label={`${pieceChar(type, false, color)}を打つ`}
          >
            <span className={cn('mini-koma', color === 'gote' && 'is-gote-glyph')}>{pieceChar(type, false, color)}</span>
            {hand[type] > 1 ? <em>{hand[type]}</em> : null}
          </button>
        ))}
      </div>
    </section>
  );
}
