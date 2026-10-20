import { findKing, isAttacked } from './attack.ts';
import { copyHands, makePiece, opposite } from './pieces.ts';
import { HAND_TYPES, type Color, type Move, type Piece, type PieceType, type State } from './types.ts';

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

const ALL8: readonly (readonly [number, number])[] = [...ORTHO, ...DIAG];

function onBoard(x: number, y: number): boolean {
  return x >= 0 && x < 9 && y >= 0 && y < 9;
}

function goldSteps(color: Color): readonly (readonly [number, number])[] {
  if (color === 'sente') return [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [0, 1]];
  return [[-1, 1], [0, 1], [1, 1], [-1, 0], [1, 0], [0, -1]];
}

function silverSteps(color: Color): readonly (readonly [number, number])[] {
  if (color === 'sente') return [[-1, -1], [0, -1], [1, -1], [-1, 1], [1, 1]];
  return [[-1, 1], [0, 1], [1, 1], [-1, -1], [1, -1]];
}

function inZone(color: Color, y: number): boolean {
  return color === 'sente' ? y <= 2 : y >= 6;
}

function mustPromote(type: PieceType, color: Color, toY: number, already: boolean): boolean {
  if (already) return false;
  if (type === 'pawn' || type === 'lance') return color === 'sente' ? toY === 0 : toY === 8;
  if (type === 'knight') return color === 'sente' ? toY <= 1 : toY >= 7;
  return false;
}

function canPromote(piece: Piece, fromY: number, toY: number): boolean {
  if (piece.promoted || piece.type === 'gold' || piece.type === 'king') return false;
  return inZone(piece.color, fromY) || inZone(piece.color, toY);
}

function movement(piece: Piece): {
  steps: readonly (readonly [number, number])[];
  rays: readonly (readonly [number, number])[];
} {
  const forward = piece.color === 'sente' ? -1 : 1;
  switch (piece.type) {
    case 'king':
      return { steps: ALL8, rays: [] };
    case 'rook':
      return piece.promoted ? { steps: DIAG, rays: ORTHO } : { steps: [], rays: ORTHO };
    case 'bishop':
      return piece.promoted ? { steps: ORTHO, rays: DIAG } : { steps: [], rays: DIAG };
    case 'gold':
      return { steps: goldSteps(piece.color), rays: [] };
    case 'silver':
      return piece.promoted
        ? { steps: goldSteps(piece.color), rays: [] }
        : { steps: silverSteps(piece.color), rays: [] };
    case 'knight':
      return piece.promoted
        ? { steps: goldSteps(piece.color), rays: [] }
        : { steps: [[-1, forward * 2], [1, forward * 2]], rays: [] };
    case 'lance':
      return piece.promoted ? { steps: goldSteps(piece.color), rays: [] } : { steps: [], rays: [[0, forward]] };
    case 'pawn':
      return piece.promoted ? { steps: goldSteps(piece.color), rays: [] } : { steps: [[0, forward]], rays: [] };
    default:
      return assertPiece(piece.type);
  }
}

function assertPiece(value: never): never {
  throw new Error(`不明な駒: ${String(value)}`);
}

function pushMove(
  moves: Move[],
  piece: Piece,
  from: number,
  to: number,
  fromY: number,
  toY: number,
  occ: Piece | null,
): void {
  const base = {
    from,
    to,
    piece: piece.type,
    capture: occ ? occ.type : null,
    capturedPromoted: Boolean(occ?.promoted),
    alreadyPromoted: piece.promoted,
  };
  if (canPromote(piece, fromY, toY)) {
    moves.push({ ...base, promote: true });
    if (!mustPromote(piece.type, piece.color, toY, piece.promoted)) {
      moves.push({ ...base, promote: false });
    }
    return;
  }
  moves.push({ ...base, promote: false });
}

function addPieceMoves(moves: Move[], board: readonly (Piece | null)[], piece: Piece, from: number): void {
  const x = from % 9;
  const y = (from / 9) | 0;
  const { steps, rays } = movement(piece);
  for (const [dx, dy] of steps) {
    const nx = x + dx;
    const ny = y + dy;
    if (!onBoard(nx, ny)) continue;
    const to = ny * 9 + nx;
    const occ = board[to] ?? null;
    if (occ && (occ.color === piece.color || occ.type === 'king')) continue;
    pushMove(moves, piece, from, to, y, ny, occ);
  }
  for (const [dx, dy] of rays) {
    let nx = x + dx;
    let ny = y + dy;
    while (onBoard(nx, ny)) {
      const to = ny * 9 + nx;
      const occ = board[to] ?? null;
      if (occ) {
        if (occ.color !== piece.color && occ.type !== 'king') pushMove(moves, piece, from, to, y, ny, occ);
        break;
      }
      pushMove(moves, piece, from, to, y, ny, null);
      nx += dx;
      ny += dy;
    }
  }
}

function addDrops(moves: Move[], state: State): void {
  const hand = state.hands[state.turn];
  const pawnFiles = new Set<number>();
  if (hand.pawn > 0) {
    for (let i = 0; i < 81; i += 1) {
      const piece = state.board[i];
      if (piece && piece.color === state.turn && piece.type === 'pawn' && !piece.promoted) {
        pawnFiles.add(i % 9);
      }
    }
  }
  for (const type of HAND_TYPES) {
    if (hand[type] <= 0) continue;
    for (let to = 0; to < 81; to += 1) {
      if (state.board[to]) continue;
      const y = (to / 9) | 0;
      if ((type === 'pawn' || type === 'lance') && ((state.turn === 'sente' && y === 0) || (state.turn === 'gote' && y === 8))) {
        continue;
      }
      if (type === 'knight' && ((state.turn === 'sente' && y <= 1) || (state.turn === 'gote' && y >= 7))) continue;
      if (type === 'pawn' && pawnFiles.has(to % 9)) continue;
      moves.push({
        from: null,
        to,
        piece: type,
        promote: false,
        capture: null,
        capturedPromoted: false,
        alreadyPromoted: false,
      });
    }
  }
}

export function isCheck(state: State, color: Color): boolean {
  const king = findKing(state.board, color);
  if (king < 0) return true;
  return isAttacked(state.board, king, opposite(color));
}

function hasAnyEscape(state: State): boolean {
  const replies = generateMoves(state, 'pseudo');
  for (const reply of replies) {
    const next = applyMove(state, reply);
    if (isCheck(next, state.turn)) continue;
    if (reply.from === null && reply.piece === 'pawn' && isCheck(next, next.turn) && !hasAnyEscape(next)) continue;
    return true;
  }
  return false;
}

function isLegalPlacement(state: State, move: Move): boolean {
  const next = applyMove(state, move);
  if (isCheck(next, state.turn)) return false;
  if (move.from === null && move.piece === 'pawn' && isCheck(next, next.turn) && !hasAnyEscape(next)) return false;
  return true;
}

export function generateMoves(state: State, kind: 'pseudo' | 'legal'): Move[] {
  const moves: Move[] = [];
  for (let i = 0; i < 81; i += 1) {
    const piece = state.board[i];
    if (!piece || piece.color !== state.turn) continue;
    addPieceMoves(moves, state.board, piece, i);
  }
  addDrops(moves, state);
  if (kind === 'pseudo') return moves;
  return moves.filter((move) => isLegalPlacement(state, move));
}

export function pseudoMoves(state: State): Move[] {
  return generateMoves(state, 'pseudo');
}

export function legalMoves(state: State): Move[] {
  return generateMoves(state, 'legal');
}

export function applyMove(state: State, move: Move): State {
  const board = state.board.slice();
  const hands = copyHands(state.hands);
  if (move.from === null) {
    hands[state.turn][move.piece] -= 1;
    board[move.to] = makePiece(state.turn, move.piece, false);
  } else {
    const piece = board[move.from];
    if (!piece) throw new Error('移動元に駒がありません');
    board[move.from] = null;
    const captured = board[move.to];
    if (captured) hands[state.turn][captured.type] += 1;
    board[move.to] = makePiece(piece.color, piece.type, piece.promoted || move.promote);
  }
  return { board, hands, turn: opposite(state.turn) };
}

export function sameMove(a: Move, b: Pick<Move, 'from' | 'to' | 'piece' | 'promote'>): boolean {
  return a.from === b.from && a.to === b.to && a.piece === b.piece && a.promote === b.promote;
}

export function findLegal(state: State, partial: Pick<Move, 'from' | 'to' | 'piece' | 'promote'>): Move | null {
  for (const move of legalMoves(state)) {
    if (sameMove(move, partial)) return move;
  }
  return null;
}
