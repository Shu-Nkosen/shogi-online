import type { Color, Piece } from './types.ts';

const ORTHO: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const DIAG: readonly (readonly [number, number])[] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

function onBoard(x: number, y: number): boolean {
  return x >= 0 && x < 9 && y >= 0 && y < 9;
}

export function findKing(board: readonly (Piece | null)[], color: Color): number {
  for (let i = 0; i < 81; i += 1) {
    const piece = board[i];
    if (piece && piece.color === color && piece.type === 'king') return i;
  }
  return -1;
}

function goldLike(piece: Piece): boolean {
  if (piece.type === 'gold') return true;
  return piece.promoted && (piece.type === 'silver' || piece.type === 'knight' || piece.type === 'lance' || piece.type === 'pawn');
}

function sliderHits(piece: Piece, kind: 'ortho' | 'diag', dist: number): boolean {
  if (kind === 'ortho') {
    if (piece.type === 'rook') return true;
    return piece.type === 'bishop' && piece.promoted && dist === 1;
  }
  if (piece.type === 'bishop') return true;
  return piece.type === 'rook' && piece.promoted && dist === 1;
}

function rayHits(
  board: readonly (Piece | null)[],
  tx: number,
  ty: number,
  by: Color,
  dirs: readonly (readonly [number, number])[],
  kind: 'ortho' | 'diag',
): boolean {
  for (const [dx, dy] of dirs) {
    let x = tx + dx;
    let y = ty + dy;
    let dist = 1;
    while (onBoard(x, y)) {
      const piece = board[y * 9 + x];
      if (piece) {
        if (piece.color === by && sliderHits(piece, kind, dist)) return true;
        break;
      }
      x += dx;
      y += dy;
      dist += 1;
    }
  }
  return false;
}

export function isAttacked(board: readonly (Piece | null)[], target: number, by: Color): boolean {
  const tx = target % 9;
  const ty = (target / 9) | 0;

  const pawnY = by === 'sente' ? ty + 1 : ty - 1;
  if (onBoard(tx, pawnY)) {
    const piece = board[pawnY * 9 + tx];
    if (piece && piece.color === by && piece.type === 'pawn' && !piece.promoted) return true;
  }

  const knightY = by === 'sente' ? ty + 2 : ty - 2;
  for (const dx of [-1, 1]) {
    const x = tx + dx;
    if (!onBoard(x, knightY)) continue;
    const piece = board[knightY * 9 + x];
    if (piece && piece.color === by && piece.type === 'knight' && !piece.promoted) return true;
  }

  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const x = tx + dx;
      const y = ty + dy;
      if (!onBoard(x, y)) continue;
      const piece = board[y * 9 + x];
      if (piece && piece.color === by && piece.type === 'king') return true;
    }
  }

  const gold = by === 'sente'
    ? ([[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [0, 1]] as const)
    : ([[-1, 1], [0, 1], [1, 1], [-1, 0], [1, 0], [0, -1]] as const);
  for (const [dx, dy] of gold) {
    const x = tx - dx;
    const y = ty - dy;
    if (!onBoard(x, y)) continue;
    const piece = board[y * 9 + x];
    if (piece && piece.color === by && goldLike(piece)) return true;
  }

  const silver = by === 'sente'
    ? ([[-1, -1], [0, -1], [1, -1], [-1, 1], [1, 1]] as const)
    : ([[-1, 1], [0, 1], [1, 1], [-1, -1], [1, -1]] as const);
  for (const [dx, dy] of silver) {
    const x = tx - dx;
    const y = ty - dy;
    if (!onBoard(x, y)) continue;
    const piece = board[y * 9 + x];
    if (piece && piece.color === by && piece.type === 'silver' && !piece.promoted) return true;
  }

  if (by === 'sente') {
    for (let y = ty + 1; y < 9; y += 1) {
      const piece = board[y * 9 + tx];
      if (!piece) continue;
      if (piece.color === by && piece.type === 'lance' && !piece.promoted) return true;
      break;
    }
  } else {
    for (let y = ty - 1; y >= 0; y -= 1) {
      const piece = board[y * 9 + tx];
      if (!piece) continue;
      if (piece.color === by && piece.type === 'lance' && !piece.promoted) return true;
      break;
    }
  }

  if (rayHits(board, tx, ty, by, ORTHO, 'ortho')) return true;
  if (rayHits(board, tx, ty, by, DIAG, 'diag')) return true;
  return false;
}
