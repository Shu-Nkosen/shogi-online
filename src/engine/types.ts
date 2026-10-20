export const COLORS = ['sente', 'gote'] as const;
export type Color = (typeof COLORS)[number];

export const PIECE_TYPES = ['pawn', 'lance', 'knight', 'silver', 'gold', 'bishop', 'rook', 'king'] as const;
export type PieceType = (typeof PIECE_TYPES)[number];

export const HAND_TYPES = ['rook', 'bishop', 'gold', 'silver', 'knight', 'lance', 'pawn'] as const;
export type HandType = (typeof HAND_TYPES)[number];

export interface Piece {
  color: Color;
  type: PieceType;
  promoted: boolean;
}

export interface Hands {
  sente: Record<PieceType, number>;
  gote: Record<PieceType, number>;
}

/** 盤は先手から見て左が筋9・上が段1。インデックスは y * 9 + x。 */
export interface State {
  board: (Piece | null)[];
  hands: Hands;
  turn: Color;
}

export interface Move {
  from: number | null;
  to: number;
  piece: PieceType;
  promote: boolean;
  capture: PieceType | null;
  capturedPromoted: boolean;
  alreadyPromoted: boolean;
}

export interface WireMove {
  f: number | null;
  t: number;
  p: PieceType;
  pr: boolean;
}

export type Result =
  | { kind: 'checkmate'; winner: Color }
  | { kind: 'nomove'; winner: Color }
  | { kind: 'resign'; winner: Color }
  | { kind: 'sennichite'; winner: Color | null };

export type Status = Result | { kind: 'playing' } | { kind: 'check' };

export function assertNever(value: never): never {
  throw new Error(`予期しない値: ${JSON.stringify(value)}`);
}
