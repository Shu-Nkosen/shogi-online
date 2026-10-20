import { fileOf, pieceChar, rankOf } from './pieces.ts';
import type { Color, Move } from './types.ts';

const FILES = ['１', '２', '３', '４', '５', '６', '７', '８', '９'] as const;
const RANKS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'] as const;

export function formatMove(move: Move, mover: Color): string {
  const mark = mover === 'sente' ? '▲' : '△';
  const file = FILES[fileOf(move.to) - 1] ?? '';
  const rank = RANKS[rankOf(move.to) - 1] ?? '';
  const char = pieceChar(move.piece, move.alreadyPromoted, mover);
  if (move.from === null) return `${mark}${file}${rank}${char}打`;
  return `${mark}${file}${rank}${char}${move.promote ? '成' : ''}`;
}

export function formatSquare(square: number): string {
  return `${FILES[fileOf(square) - 1] ?? ''}${RANKS[rankOf(square) - 1] ?? ''}`;
}

export function moverOf(index: number, initialTurn: Color = 'sente'): Color {
  if (initialTurn === 'sente') return index % 2 === 0 ? 'sente' : 'gote';
  return index % 2 === 0 ? 'gote' : 'sente';
}
