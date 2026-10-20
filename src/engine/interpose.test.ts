import { describe, expect, it } from 'vitest';
import { chooseMove } from '../ai/search.ts';
import { isAttacked } from './attack.ts';
import { createGame, gameStatus, playMove, type PlayedGame } from './game.ts';
import { applyMove, isCheck, legalMoves } from './moves.ts';
import { emptyHands, makePiece, opposite, sq } from './pieces.ts';
import { parseSfen } from './sfen.ts';
import type { Color, Move, PieceType, State } from './types.ts';

function hasDrop(state: State, piece: PieceType, file: number, rank: number): boolean {
  return legalMoves(state).some((m) => m.from === null && m.piece === piece && m.to === sq(file, rank));
}

function hasBoardMove(state: State, from: [number, number], to: [number, number]): boolean {
  return legalMoves(state).some((m) => m.from === sq(...from) && m.to === sq(...to));
}

/** Escapes that are neither king moves nor captures of the checker, i.e. interpositions. */
function interpositions(state: State): Move[] {
  return legalMoves(state).filter((m) => m.piece !== 'king' && m.capture === null);
}

const gameStatusKind = (game: PlayedGame) => gameStatus(game).kind;

describe('blocking (合い駒) a sliding check', () => {
  it('blocks a rook check with a board move', () => {
    const state = parseSfen('4r3k/9/9/9/9/9/9/5G3/4K4 b - 1');
    expect(isCheck(state, 'sente')).toBe(true);
    expect(hasBoardMove(state, [4, 8], [5, 8])).toBe(true);
    expect(hasBoardMove(state, [4, 8], [5, 7])).toBe(true);
    // the gold may not wander off the line while the check stands
    expect(hasBoardMove(state, [4, 8], [4, 7])).toBe(false);
    const next = playMove(createGame('4r3k/9/9/9/9/9/9/5G3/4K4 b - 1'), {
      from: sq(4, 8),
      to: sq(5, 8),
      piece: 'gold',
      promote: false,
    });
    expect(next).not.toBeNull();
    expect(isCheck(next!.state, 'sente')).toBe(false);
  });

  it('blocks a rook check with a drop on every square in between', () => {
    const state = parseSfen('4r3k/9/9/9/9/9/9/9/4K4 b GP 1');
    for (let rank = 2; rank <= 8; rank += 1) {
      expect(hasDrop(state, 'gold', 5, rank), `gold 5${rank}`).toBe(true);
      expect(hasDrop(state, 'pawn', 5, rank), `pawn 5${rank}`).toBe(true);
    }
    // a drop off the line does not answer the check
    expect(hasDrop(state, 'gold', 4, 8)).toBe(false);
  });

  it('blocks a bishop diagonal check by move or drop', () => {
    const state = parseSfen('k8/9/9/9/b8/9/9/9/2G1K4 b S 1');
    expect(isCheck(state, 'sente')).toBe(true);
    expect(hasBoardMove(state, [7, 9], [6, 8])).toBe(true);
    for (const [file, rank] of [[8, 6], [7, 7], [6, 8]] as const) {
      expect(hasDrop(state, 'silver', file, rank), `silver ${file}${rank}`).toBe(true);
    }
  });

  it('blocks a lance check', () => {
    const state = parseSfen('k8/9/9/9/4l4/9/9/9/4K4 b P 1');
    expect(isCheck(state, 'sente')).toBe(true);
    for (const rank of [6, 7, 8]) expect(hasDrop(state, 'pawn', 5, rank)).toBe(true);
    expect(interpositions(state)).toHaveLength(3);
  });

  it('blocks long dragon and horse checks but not their one-step checks', () => {
    const dragon = parseSfen('k8/9/9/9/4+r4/9/9/9/4K4 b G 1');
    for (const rank of [6, 7, 8]) expect(hasDrop(dragon, 'gold', 5, rank)).toBe(true);
    const horse = parseSfen('k8/9/9/9/+b8/9/9/9/4K4 b G 1');
    for (const [file, rank] of [[8, 6], [7, 7], [6, 8]] as const) expect(hasDrop(horse, 'gold', file, rank)).toBe(true);
    const adjacent = parseSfen('k8/9/9/9/9/9/9/3+r5/4K4 b G 1');
    expect(isCheck(adjacent, 'sente')).toBe(true);
    expect(interpositions(adjacent)).toHaveLength(0);
  });

  it('blocks checks for gote as well', () => {
    const state = parseSfen('4k4/9/9/4L4/9/9/9/9/K8 w p 1');
    expect(isCheck(state, 'gote')).toBe(true);
    for (const rank of [2, 3]) expect(hasDrop(state, 'pawn', 5, rank)).toBe(true);
  });

  it('cannot block with a pawn drop that would be nifu', () => {
    // sente pawn already on the 8-file; gote rook on 1i checks the king on 9i along the 9th rank
    const state = parseSfen('k8/9/9/9/9/9/1P7/9/K7r b P 1');
    expect(isCheck(state, 'sente')).toBe(true);
    expect(hasDrop(state, 'pawn', 8, 9)).toBe(false);
    for (let file = 7; file >= 2; file -= 1) expect(hasDrop(state, 'pawn', file, 9), `pawn ${file}9`).toBe(true);
  });
});

describe('checkmate detection with interpositions', () => {
  // sente king boxed in at 9i by its own pawns, gote rook checks along the 9th rank
  const BOXED = 'k8/9/9/9/9/9/9/PP7/K7r b';

  it('declares mate when nothing can interpose', () => {
    expect(createGame(`${BOXED} - 1`).result).toEqual({ kind: 'checkmate', winner: 'gote' });
  });

  it('does not declare mate when a drop can interpose', () => {
    const game = createGame(`${BOXED} G 1`);
    expect(game.result).toBeNull();
    expect(interpositions(game.state)).toHaveLength(7);
  });

  it('does not declare mate when a board piece can interpose', () => {
    const game = createGame('k8/9/9/9/9/9/9/PP4G2/K7r b - 1');
    expect(game.result).toBeNull();
    expect(legalMoves(game.state).map((m) => m.to)).toEqual([sq(3, 9)]);
  });

  it('does not declare mate after a rook drop check that can be blocked', () => {
    const game = createGame('k8/9/9/9/9/9/9/PP7/K8 w Gr 1');
    const next = playMove(game, { from: null, to: sq(1, 9), piece: 'rook', promote: false });
    expect(next).not.toBeNull();
    expect(isCheck(next!.state, 'sente')).toBe(true);
    expect(next!.result).toBeNull();
    expect(gameStatusKind(next!)).toBe('check');
  });

  it('still declares a real mate in one with a gold drop', () => {
    const ready = createGame('7lk/7p1/7G1/9/9/9/9/9/K8 b G 1');
    const next = playMove(ready, { from: null, to: sq(1, 2), piece: 'gold', promote: false });
    expect(next?.result).toEqual({ kind: 'checkmate', winner: 'sente' });
  });

  it('keeps uchi-fuzume illegal while a non-mating pawn check stays legal', () => {
    const mate = parseSfen('7lk/7p1/7G1/9/9/9/9/9/K8 b P 1');
    expect(hasDrop(mate, 'pawn', 1, 2)).toBe(false);
    const check = parseSfen('7lk/7p1/9/9/9/9/9/9/K8 b P 1');
    expect(hasDrop(check, 'pawn', 1, 2)).toBe(true);
  });

  it('allows a pawn drop interposition and does not treat it as uchi-fuzume', () => {
    const state = parseSfen('k8/9/9/9/9/9/9/PP7/K7r b P 1');
    // files 9 and 8 are nifu; 7i..2i are legal blocks, so this is not mate
    expect(interpositions(state).map((m) => m.to).sort((x, y) => x - y)).toEqual(
      [7, 6, 5, 4, 3, 2].map((file) => sq(file, 9)).sort((x, y) => x - y),
    );
    expect(createGame('k8/9/9/9/9/9/9/PP7/K7r b P 1').result).toBeNull();
  });
});

describe('computer opponent under check', () => {
  it('interposes when blocking is the only escape', () => {
    for (const level of ['easy', 'normal', 'hard'] as const) {
      const state = parseSfen('k8/9/9/9/9/9/9/PP7/K7r b G 1');
      const move = chooseMove(state, level);
      expect(move.from, level).toBeNull();
      expect(move.piece).toBe('gold');
      expect(isCheck(applyMove(state, move), 'sente')).toBe(false);
    }
  });
});

describe('property: every gap square of a single sliding check accepts a drop', () => {
  it('holds over random sparse positions', () => {
    let seed = 777;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const ri = (n: number) => Math.floor(rnd() * n);
    let tested = 0;
    for (let n = 0; n < 40000 && tested < 1500; n += 1) {
      const board: State['board'] = Array(81).fill(null);
      const turn: Color = rnd() < 0.5 ? 'sente' : 'gote';
      const king = ri(81);
      board[king] = makePiece(turn, 'king', false);
      let enemyKing = ri(81);
      while (board[enemyKing]) enemyKing = ri(81);
      board[enemyKing] = makePiece(opposite(turn), 'king', false);
      const kind = ri(5);
      const ortho = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
      const diag = [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const;
      const dirs = kind === 0 || kind === 2 ? ortho : kind === 1 || kind === 3 ? diag : ([[0, turn === 'sente' ? -1 : 1]] as const);
      const [dx, dy] = dirs[ri(dirs.length)]!;
      const dist = 2 + ri(6);
      const kx = king % 9;
      const ky = (king / 9) | 0;
      const cx = kx + dx * dist;
      const cy = ky + dy * dist;
      if (cx < 0 || cx > 8 || cy < 0 || cy > 8) continue;
      const gap: number[] = [];
      for (let i = 1; i < dist; i += 1) gap.push((ky + dy * i) * 9 + kx + dx * i);
      const checker = cy * 9 + cx;
      if (board[checker] || gap.some((s) => board[s])) continue;
      const type: PieceType = kind === 0 || kind === 2 ? 'rook' : kind === 1 || kind === 3 ? 'bishop' : 'lance';
      board[checker] = makePiece(opposite(turn), type, kind === 2 || kind === 3);
      for (let i = 0; i < 8; i += 1) {
        const s = ri(81);
        if (board[s] || gap.includes(s)) continue;
        const t = (['pawn', 'silver', 'gold', 'knight'] as const)[ri(4)]!;
        board[s] = makePiece(rnd() < 0.5 ? 'sente' : 'gote', t, false);
      }
      const hands = emptyHands();
      hands[turn].gold = 1;
      const state: State = { board, hands, turn };
      if (!isCheck(state, turn)) continue;
      const without = board.slice();
      without[checker] = null;
      if (isAttacked(without, king, opposite(turn))) continue; // double check
      if (isCheck({ ...state, turn: opposite(turn) }, opposite(turn))) continue;
      tested += 1;
      const legal = legalMoves(state);
      for (const s of gap) expect(legal.some((m) => m.from === null && m.piece === 'gold' && m.to === s)).toBe(true);
      expect(legal.length).toBeGreaterThan(0);
    }
    expect(tested).toBeGreaterThan(500);
  });
});
