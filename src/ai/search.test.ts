import { describe, expect, it } from 'vitest';
import { createGame, playMove } from '../engine/game.ts';
import { findLegal } from '../engine/moves.ts';
import { sq } from '../engine/pieces.ts';
import { parseSfen } from '../engine/sfen.ts';
import { chooseMove } from './search.ts';

describe('computer opponent', () => {
  it('finds a mate in one at every level', () => {
    const state = parseSfen('7lk/7p1/7G1/9/9/9/9/9/K8 b G 1');
    for (const level of ['easy', 'normal', 'hard'] as const) {
      const started = performance.now();
      const move = chooseMove(state, level);
      expect(performance.now() - started).toBeLessThan(4500);
      const game = createGame('7lk/7p1/7G1/9/9/9/9/9/K8 b G 1');
      const next = playMove(game, move);
      expect(next?.result).toEqual({ kind: 'checkmate', winner: 'sente' });
      expect(move).toMatchObject({ from: null, to: sq(1, 2), piece: 'gold' });
    }
  });

  it('returns a legal move from the opening within a few seconds', () => {
    const state = parseSfen('lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1');
    const started = performance.now();
    const move = chooseMove(state, 'hard');
    expect(performance.now() - started).toBeLessThan(4500);
    expect(findLegal(state, move)).not.toBeNull();
  });

  it('stays inside the time limit on an open board', () => {
    const state = parseSfen('lnsgkgsnl/1r5b1/9/9/9/9/9/1B5R1/LNSGKGSNL b - 1');
    const started = performance.now();
    const move = chooseMove(state, 'hard');
    const elapsed = performance.now() - started;
    expect(elapsed).toBeLessThan(4500);
    expect(findLegal(state, move)).not.toBeNull();
  });
});
