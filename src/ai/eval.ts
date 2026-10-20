import { HAND_TYPES, type Piece, type PieceType, type State } from '../engine/types.ts';

const BASE: Record<PieceType, number> = {
  pawn: 100,
  lance: 310,
  knight: 350,
  silver: 470,
  gold: 540,
  bishop: 730,
  rook: 890,
  king: 0,
};

function material(piece: Piece): number {
  if (!piece.promoted) return BASE[piece.type];
  switch (piece.type) {
    case 'pawn':
      return 520;
    case 'lance':
      return 490;
    case 'knight':
      return 500;
    case 'silver':
      return 530;
    case 'bishop':
      return 980;
    case 'rook':
      return 1120;
    case 'gold':
    case 'king':
      return BASE[piece.type];
    default:
      return assertPiece(piece.type);
  }
}

function assertPiece(value: never): never {
  throw new Error(`不明な駒: ${String(value)}`);
}

function placeValue(piece: Piece, square: number): number {
  const y = (square / 9) | 0;
  const x = square % 9;
  const forward = piece.color === 'sente' ? 8 - y : y;
  const center = 4 - Math.abs(x - 4);
  switch (piece.type) {
    case 'pawn':
      return piece.promoted ? 16 + forward * 3 : forward * 8;
    case 'king':
      return -forward * 16;
    case 'rook':
    case 'bishop':
      return forward * 2 + center * 6 + (piece.promoted ? 10 : 0);
    case 'lance':
    case 'knight':
    case 'silver':
    case 'gold':
      return forward * 4 + center * 2 + (piece.promoted ? 8 : 0);
    default:
      return assertPiece(piece.type);
  }
}

const HAND_BONUS: Record<PieceType, number> = {
  pawn: 18,
  lance: 30,
  knight: 32,
  silver: 36,
  gold: 40,
  bishop: 70,
  rook: 90,
  king: 0,
};

/** 先手有利が正。呼び出し側で手番側の符号に直す。 */
export function evaluateAbsolute(state: State): number {
  let score = 0;
  for (let square = 0; square < 81; square += 1) {
    const piece = state.board[square];
    if (!piece) continue;
    const value = material(piece) + placeValue(piece, square);
    score += piece.color === 'sente' ? value : -value;
  }
  for (const type of HAND_TYPES) {
    const sente = state.hands.sente[type];
    const gote = state.hands.gote[type];
    if (sente) score += sente * (BASE[type] + HAND_BONUS[type]);
    if (gote) score -= gote * (BASE[type] + HAND_BONUS[type]);
  }
  return score;
}

export function evaluate(state: State): number {
  const score = evaluateAbsolute(state);
  return state.turn === 'sente' ? score : -score;
}
