import { pieceIndex } from './pieces.ts';
import { PIECE_TYPES, type PieceType, type State } from './types.ts';

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
}

function rand64(next: () => number): bigint {
  return (BigInt(next()) << 32n) ^ BigInt(next());
}

const nextRand = mulberry32(0x51f00d);
const SQUARE_KEYS: bigint[][] = Array.from({ length: 81 }, () =>
  Array.from({ length: 32 }, () => rand64(nextRand)),
);
const HAND_KEYS: bigint[][][] = Array.from({ length: 2 }, () =>
  Array.from({ length: 8 }, () => Array.from({ length: 19 }, () => rand64(nextRand))),
);
const TURN_KEY = rand64(nextRand);

const TYPE_ORDER = PIECE_TYPES;

function typeIndex(type: PieceType): number {
  return TYPE_ORDER.indexOf(type);
}

export function hashState(state: State): bigint {
  let hash = state.turn === 'gote' ? TURN_KEY : 0n;
  for (let square = 0; square < 81; square += 1) {
    const piece = state.board[square];
    if (!piece) continue;
    hash ^= SQUARE_KEYS[square]?.[pieceIndex(piece)] ?? 0n;
  }
  for (const color of [0, 1] as const) {
    const hand = color === 0 ? state.hands.sente : state.hands.gote;
    for (const type of TYPE_ORDER) {
      const count = Math.min(18, hand[type]);
      if (!count) continue;
      hash ^= HAND_KEYS[color]?.[typeIndex(type)]?.[count] ?? 0n;
    }
  }
  return hash;
}
