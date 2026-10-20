import { PIECE_TYPES, type Color, type Hands, type Piece, type PieceType } from './types.ts';

const POOL = new Map<string, Piece>();

export function makePiece(color: Color, type: PieceType, promoted: boolean): Piece {
  const usePromoted = promoted && type !== 'gold' && type !== 'king';
  const key = `${color}:${type}:${usePromoted ? 1 : 0}`;
  let piece = POOL.get(key);
  if (!piece) {
    piece = Object.freeze({ color, type, promoted: usePromoted });
    POOL.set(key, piece);
  }
  return piece;
}

export function opposite(color: Color): Color {
  return color === 'sente' ? 'gote' : 'sente';
}

export function emptyHands(): Hands {
  const row = (): Record<PieceType, number> => ({
    pawn: 0,
    lance: 0,
    knight: 0,
    silver: 0,
    gold: 0,
    bishop: 0,
    rook: 0,
    king: 0,
  });
  return { sente: row(), gote: row() };
}

export function copyHands(hands: Hands): Hands {
  return {
    sente: { ...hands.sente },
    gote: { ...hands.gote },
  };
}

export function sq(file: number, rank: number): number {
  return (rank - 1) * 9 + (9 - file);
}

export function fileOf(square: number): number {
  return 9 - (square % 9);
}

export function rankOf(square: number): number {
  return ((square / 9) | 0) + 1;
}

const TYPE_INDEX: Record<PieceType, number> = {
  pawn: 0,
  lance: 1,
  knight: 2,
  silver: 3,
  gold: 4,
  bishop: 5,
  rook: 6,
  king: 7,
};

export function pieceIndex(piece: Piece): number {
  return TYPE_INDEX[piece.type] + (piece.promoted ? 8 : 0) + (piece.color === 'gote' ? 16 : 0);
}

export function pieceChar(type: PieceType, promoted: boolean, color: Color = 'sente'): string {
  switch (type) {
    case 'pawn':
      return promoted ? 'と' : '歩';
    case 'lance':
      return promoted ? '杏' : '香';
    case 'knight':
      return promoted ? '圭' : '桂';
    case 'silver':
      return promoted ? '全' : '銀';
    case 'gold':
      return '金';
    case 'bishop':
      return promoted ? '馬' : '角';
    case 'rook':
      return promoted ? '龍' : '飛';
    case 'king':
      return color === 'gote' ? '王' : '玉';
    default:
      return assertType(type);
  }
}

function assertType(value: never): never {
  throw new Error(`不明な駒: ${String(value)}`);
}

export const SFEN_TO_TYPE: Record<string, PieceType> = {
  P: 'pawn',
  L: 'lance',
  N: 'knight',
  S: 'silver',
  G: 'gold',
  B: 'bishop',
  R: 'rook',
  K: 'king',
};

export const TYPE_TO_SFEN: Record<PieceType, string> = {
  pawn: 'P',
  lance: 'L',
  knight: 'N',
  silver: 'S',
  gold: 'G',
  bishop: 'B',
  rook: 'R',
  king: 'K',
};

export { PIECE_TYPES };
