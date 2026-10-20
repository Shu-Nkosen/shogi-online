import { describe, expect, it } from 'vitest';
import { isAttacked } from './attack.ts';
import { createGame, playMove, replay, resign, toWire } from './game.ts';
import { applyMove, isCheck, legalMoves, pseudoMoves } from './moves.ts';
import { formatMove } from './notation.ts';
import { fileOf, makePiece, rankOf, sq } from './pieces.ts';
import { INITIAL_SFEN, parseSfen, toSfen } from './sfen.ts';
import type { Move, PieceType, State } from './types.ts';

function destinations(state: State, from: number, piece: PieceType): Move[] {
  return legalMoves(state).filter((move) => move.from === from && move.piece === piece);
}

function dropTo(state: State, piece: PieceType, file: number, rank: number): Move | undefined {
  return legalMoves(state).find((move) => move.from === null && move.piece === piece && move.to === sq(file, rank));
}

function mustPlay(stateSfen: string | undefined, partial: Pick<Move, 'from' | 'to' | 'piece' | 'promote'>) {
  const game = createGame(stateSfen);
  const next = playMove(game, partial);
  expect(next, `${partial.piece} ${partial.from}->${partial.to}`).not.toBeNull();
  return next!;
}

function expectAttackConsistent(state: State): void {
  for (const color of ['sente', 'gote'] as const) {
    const boardMoves = pseudoMoves({ ...state, turn: color }).filter((move) => move.from !== null);
    const targets = new Set(boardMoves.map((move) => move.to));
    for (let square = 0; square < 81; square += 1) {
      const occ = state.board[square];
      if (occ && occ.color === color) continue;
      if (occ?.type === 'king') {
        const board = state.board.slice();
        board[square] = makePiece(occ.color, 'gold', false);
        const hits = pseudoMoves({ board, hands: state.hands, turn: color })
          .filter((move) => move.from !== null)
          .some((move) => move.to === square);
        expect(isAttacked(state.board, square, color)).toBe(hits);
      } else {
        expect(isAttacked(state.board, square, color)).toBe(targets.has(square));
      }
    }
  }
}

describe('sfen', () => {
  it('round-trips the initial position', () => {
    const state = parseSfen(INITIAL_SFEN);
    expect(toSfen(state)).toBe(INITIAL_SFEN);
    expect(state.turn).toBe('sente');
    expect(state.board[sq(5, 9)]).toMatchObject({ type: 'king', color: 'sente' });
    expect(state.board[sq(5, 1)]).toMatchObject({ type: 'king', color: 'gote' });
    expect(state.board[sq(2, 8)]).toMatchObject({ type: 'rook', color: 'sente' });
    expect(state.board[sq(8, 8)]).toMatchObject({ type: 'bishop', color: 'sente' });
    expect(state.board[sq(8, 2)]).toMatchObject({ type: 'rook', color: 'gote' });
    expect(state.board[sq(2, 2)]).toMatchObject({ type: 'bishop', color: 'gote' });
  });

  it('round-trips promoted pieces and hands', () => {
    const sfen = '8k/9/9/9/4+P4/9/9/9/K8 w r2b10p 1';
    const state = parseSfen(sfen);
    expect(state.board[sq(5, 5)]).toMatchObject({ type: 'pawn', color: 'sente', promoted: true });
    expect(state.hands.gote.rook).toBe(1);
    expect(state.hands.gote.bishop).toBe(2);
    expect(state.hands.gote.pawn).toBe(10);
    expect(toSfen(state)).toBe(sfen);
  });
});

describe('initial moves', () => {
  it('gives sente 15 legal moves and does not mutate', () => {
    const state = parseSfen(INITIAL_SFEN);
    const before = toSfen(state);
    const moves = legalMoves(state);
    expect(moves).toHaveLength(30);
    expect(moves.filter((move) => move.piece === 'pawn')).toHaveLength(9);
    expect(moves.filter((move) => move.piece === 'rook')).toHaveLength(6);
    expect(moves.filter((move) => move.piece === 'king')).toHaveLength(3);
    expect(toSfen(state)).toBe(before);
    applyMove(state, moves[0]!);
    expect(toSfen(state)).toBe(before);
  });

  it('gives gote the mirrored 15 moves', () => {
    const state = parseSfen('lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1');
    expect(legalMoves(state)).toHaveLength(30);
  });
});

describe('piece movement', () => {
  it('moves a gote knight only forward', () => {
    const state = parseSfen('8k/9/9/9/4n4/9/9/9/K8 w - 1');
    const moves = destinations(state, sq(5, 5), 'knight');
    expect(moves.map((move) => move.to).sort()).toEqual([sq(6, 7), sq(6, 7), sq(4, 7), sq(4, 7)].sort());
    expect(moves.filter((move) => move.promote)).toHaveLength(2);
    expect(moves.filter((move) => !move.promote)).toHaveLength(2);
  });

  it('lets a tokin move as a gold, not as a pawn', () => {
    const state = parseSfen('8k/9/9/9/4+P4/9/9/9/K8 b - 1');
    const targets = destinations(state, sq(5, 5), 'pawn').map((move) => move.to).sort();
    expect(targets).toEqual([sq(6, 4), sq(5, 4), sq(4, 4), sq(6, 5), sq(4, 5), sq(5, 6)].sort());
  });

  it('lets a dragon step one square diagonally and slide as a rook', () => {
    const state = parseSfen('8k/9/9/9/4+R4/9/9/9/K8 b - 1');
    const targets = new Set(destinations(state, sq(5, 5), 'rook').map((move) => move.to));
    expect(targets.size).toBe(20);
    expect(targets.has(sq(4, 4))).toBe(true);
    expect(targets.has(sq(3, 3))).toBe(false);
    expect(targets.has(sq(5, 1))).toBe(true);
  });

  it('jumps a knight over pieces', () => {
    const state = parseSfen('8k/9/9/9/9/4P4/9/9/KN7 b - 1');
    const knightMoves = destinations(state, sq(8, 9), 'knight');
    expect(knightMoves.map((move) => move.to).sort()).toEqual([sq(9, 7), sq(7, 7)].sort());
  });
});

describe('promotion', () => {
  it('forces a pawn on the last rank to promote', () => {
    const state = parseSfen('8k/4P4/9/9/9/9/9/9/K8 b - 1');
    const moves = destinations(state, sq(5, 2), 'pawn');
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ to: sq(5, 1), promote: true });
  });

  it('offers a choice when a pawn enters the camp but can still move', () => {
    const state = parseSfen('8k/9/4P4/9/9/9/9/9/K8 b - 1');
    const moves = destinations(state, sq(5, 3), 'pawn');
    expect(moves).toHaveLength(2);
    expect(moves.map((move) => move.promote).sort()).toEqual([false, true]);
  });

  it('forces a knight landing on the second rank to promote', () => {
    const state = parseSfen('8k/9/9/4N4/9/9/9/9/K8 b - 1');
    const moves = destinations(state, sq(5, 4), 'knight');
    expect(moves).toHaveLength(2);
    expect(moves.every((move) => move.promote)).toBe(true);
    expect(moves.map((move) => rankOf(move.to)).sort()).toEqual([2, 2]);
  });

  it('lets a knight landing on the third rank decline promotion', () => {
    const state = parseSfen('8k/9/9/9/4N4/9/9/9/K8 b - 1');
    const moves = destinations(state, sq(5, 5), 'knight');
    expect(moves).toHaveLength(4);
    expect(moves.filter((move) => !move.promote)).toHaveLength(2);
  });

  it('forces a gote pawn on the last rank to promote', () => {
    const state = parseSfen('8k/9/9/9/9/9/9/4p4/K8 w - 1');
    const moves = destinations(state, sq(5, 8), 'pawn');
    expect(moves).toEqual([expect.objectContaining({ to: sq(5, 9), promote: true })]);
  });

  it('lets a silver promote when stepping back out of the camp', () => {
    const state = parseSfen('8k/9/4S4/9/9/9/9/9/K8 b - 1');
    const back = destinations(state, sq(5, 3), 'silver').filter((move) => rankOf(move.to) === 4);
    expect(back.map((move) => move.promote).sort()).toEqual([false, true, false, true].sort());
    expect(back.length).toBe(4);
  });
});

describe('drops', () => {
  it('rejects nifu, dead drops, and allows a tokin file', () => {
    const nifu = parseSfen('8k/9/9/9/4P4/9/9/9/K8 b P 1');
    expect(dropTo(nifu, 'pawn', 5, 4)).toBeUndefined();
    expect(dropTo(nifu, 'pawn', 4, 4)).toBeDefined();
    expect(dropTo(nifu, 'pawn', 5, 1)).toBeUndefined();

    const tokin = parseSfen('8k/9/9/9/4+P4/9/9/9/K8 b P 1');
    expect(dropTo(tokin, 'pawn', 5, 4)).toBeDefined();

    const lance = parseSfen('8k/9/9/9/9/9/9/9/K8 b L 1');
    expect(dropTo(lance, 'lance', 5, 1)).toBeUndefined();
    expect(dropTo(lance, 'lance', 5, 2)).toBeDefined();

    const knight = parseSfen('8k/9/9/9/9/9/9/9/K8 b N 1');
    expect(dropTo(knight, 'knight', 5, 1)).toBeUndefined();
    expect(dropTo(knight, 'knight', 5, 2)).toBeUndefined();
    expect(dropTo(knight, 'knight', 5, 3)).toBeDefined();
  });

  it('rejects uchi-fuzume and allows a pawn drop that is only check', () => {
    const mate = parseSfen('7lk/7p1/7G1/9/9/9/9/9/K8 b P 1');
    expect(dropTo(mate, 'pawn', 1, 2)).toBeUndefined();
    expect(dropTo(mate, 'pawn', 1, 4)).toBeDefined();

    const check = parseSfen('7lk/7p1/9/9/9/9/9/9/K8 b P 1');
    expect(dropTo(check, 'pawn', 1, 2)).toBeDefined();
    const game = createGame('7lk/7p1/9/9/9/9/9/9/K8 b P 1');
    const next = playMove(game, { from: null, to: sq(1, 2), piece: 'pawn', promote: false });
    expect(next?.result).toBeNull();
    expect(isCheck(next!.state, 'gote')).toBe(true);
    expect(legalMoves(next!.state).some((move) => move.to === sq(1, 2) && move.capture === 'pawn')).toBe(true);
  });

  it('returns a captured dragon to hand as an unpromoted rook', () => {
    const game = mustPlay('8k/9/9/9/4+r4/9/9/4R4/K8 b - 1', {
      from: sq(5, 8),
      to: sq(5, 5),
      piece: 'rook',
      promote: false,
    });
    expect(game.state.hands.sente.rook).toBe(1);
    expect(game.state.board[sq(5, 5)]).toMatchObject({ type: 'rook', color: 'sente', promoted: false });
  });
});

describe('king safety', () => {
  it('allows only king moves against a rook check when nothing can interpose', () => {
    const state = parseSfen('4r4/9/9/9/9/9/9/9/4K4 b - 1');
    const moves = legalMoves(state);
    expect(moves).toHaveLength(4);
    expect(moves.every((move) => move.piece === 'king' && fileOf(move.to) !== 5)).toBe(true);
    expect(isCheck(state, 'sente')).toBe(true);
  });

  it('rejects moving a pinned gold off the file', () => {
    const game = createGame('4r4/9/9/9/4G4/9/9/9/4K4 b - 1');
    expect(isCheck(game.state, 'sente')).toBe(false);
    expect(playMove(game, { from: sq(5, 5), to: sq(4, 5), piece: 'gold', promote: false })).toBeNull();
    const along = playMove(game, { from: sq(5, 5), to: sq(5, 4), piece: 'gold', promote: false });
    expect(along).not.toBeNull();
  });

  it('detects checkmate and a gold drop mate in one', () => {
    const mated = createGame('7lk/7pG/7G1/9/9/9/9/9/K8 w - 1');
    expect(mated.result).toEqual({ kind: 'checkmate', winner: 'sente' });

    const ready = createGame('7lk/7p1/7G1/9/9/9/9/9/K8 b G 1');
    expect(ready.result).toBeNull();
    const next = playMove(ready, { from: null, to: sq(1, 2), piece: 'gold', promote: false });
    expect(next?.result).toEqual({ kind: 'checkmate', winner: 'sente' });
  });
});

describe('game flow', () => {
  it('records check, notation, resign, and replay', () => {
    let game = createGame();
    const first = legalMoves(game.state).find((move) => move.piece === 'pawn' && move.to === sq(7, 6));
    expect(first).toBeDefined();
    game = playMove(game, first!)!;
    expect(formatMove(game.moves[0]!, 'sente')).toBe('▲７六歩');
    game = resign(game, 'sente');
    expect(game.result).toEqual({ kind: 'resign', winner: 'gote' });
    const again = replay(game.moves.slice(0, 1).map(toWire), { kind: 'resign', winner: 'gote' });
    expect(toSfen(again.state)).toBe(toSfen(game.state));
    expect(again.result?.kind).toBe('resign');
  });

  it('declares sennichite after the same position returns four times', () => {
    let game = createGame('8k/9/9/9/9/9/9/9/K8 b - 1');
    const cycle: Pick<Move, 'from' | 'to' | 'piece' | 'promote'>[] = [
      { from: sq(9, 9), to: sq(8, 9), piece: 'king', promote: false },
      { from: sq(1, 1), to: sq(2, 1), piece: 'king', promote: false },
      { from: sq(8, 9), to: sq(9, 9), piece: 'king', promote: false },
      { from: sq(2, 1), to: sq(1, 1), piece: 'king', promote: false },
    ];
    for (let i = 0; i < 3; i += 1) {
      for (const move of cycle) {
        const next = playMove(game, move);
        expect(next).not.toBeNull();
        game = next!;
      }
    }
    expect(game.result).toEqual({ kind: 'sennichite', winner: null });
  });

  it('keeps attacks aligned with move generation through a random game', () => {
    let game = createGame();
    let seed = 0x123456;
    const rand = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    expectAttackConsistent(game.state);
    for (let ply = 0; ply < 24 && !game.result; ply += 1) {
      const moves = legalMoves(game.state);
      const choice = moves[Math.floor(rand() * moves.length)]!;
      const before = toSfen(game.state);
      const next = playMove(game, choice);
      expect(next).not.toBeNull();
      expect(toSfen(game.state)).toBe(before);
      game = next!;
      expect(toSfen(parseSfen(toSfen(game.state)))).toBe(toSfen(game.state));
      expectAttackConsistent(game.state);
    }
  });
});

describe('colors', () => {
  it('uses the side to move only', () => {
    const state = parseSfen(INITIAL_SFEN);
    expect(legalMoves(state).every((move) => {
      if (move.from === null) return true;
      return state.board[move.from]?.color === 'sente';
    })).toBe(true);
  });
});
