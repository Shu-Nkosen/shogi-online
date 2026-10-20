import { useMemo } from 'react';
import { pseudoMoves } from '../engine/moves.ts';
import { emptyHands, makePiece } from '../engine/pieces.ts';
import type { PieceType, State } from '../engine/types.ts';
import { Koma } from './Koma.tsx';

type Cell = { kind: 'step' | 'ray' | 'ray-mid' | 'jump'; angle: number } | null;

/** 駒の動きをエンジンから求めて 5×5 の図にする（盤の中央に駒を1枚だけ置いて調べる）。 */
function movementCells(type: PieceType, promoted: boolean): Cell[] {
  const board: State['board'] = Array(81).fill(null);
  const center = 4 * 9 + 4;
  board[center] = makePiece('sente', type, promoted);
  const reach = new Set(
    pseudoMoves({ board, hands: emptyHands(), turn: 'sente' })
      .filter((move) => move.from === center)
      .map((move) => `${(move.to % 9) - 4},${((move.to / 9) | 0) - 4}`),
  );
  const cells: Cell[] = [];
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      if (dx === 0 && dy === 0) {
        cells.push(null);
        continue;
      }
      const near = Math.abs(dx) <= 1 && Math.abs(dy) <= 1;
      const inLine = dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy);
      const angle = Math.round((Math.atan2(dy, dx) * 180) / Math.PI) + 90;
      if (near) {
        if (!reach.has(`${dx},${dy}`)) cells.push(null);
        else cells.push({ kind: reach.has(`${dx * 2},${dy * 2}`) ? 'ray-mid' : 'step', angle });
      } else if (!reach.has(`${dx},${dy}`)) {
        cells.push(null);
      } else if (inLine && reach.has(`${dx / 2},${dy / 2}`)) {
        cells.push({ kind: 'ray', angle });
      } else {
        cells.push({ kind: 'jump', angle });
      }
    }
  }
  return cells;
}

interface MoveDiagramProps {
  type: PieceType;
  promoted?: boolean;
  label: string;
}

export function MoveDiagram({ type, promoted = false, label }: MoveDiagramProps) {
  const cells = useMemo(() => movementCells(type, promoted), [type, promoted]);
  return (
    <figure className="move-diagram" aria-label={`${label}の動き`}>
      <div className="md-grid">
        {cells.map((cell, index) =>
          index === 12 ? (
            <div key={index} className="md-cell md-center">
              <Koma type={type} color="sente" promoted={promoted} />
            </div>
          ) : (
            <div
              key={index}
              className={cell ? `md-cell md-${cell.kind}` : 'md-cell'}
              style={cell ? { ['--a' as string]: `${cell.angle}deg` } : undefined}
            >
              {cell ? <i /> : null}
            </div>
          ),
        )}
      </div>
      <figcaption>{label}</figcaption>
    </figure>
  );
}
