import { describe, expect, it } from 'vitest';
import { findKing } from '../engine/attack.ts';
import { createGame, playMove } from '../engine/game.ts';
import { isCheck, legalMoves } from '../engine/moves.ts';
import { parseSfen, toSfen } from '../engine/sfen.ts';
import type { State } from '../engine/types.ts';
import { goalMet, LESSONS, markSquares, toIndex } from './lessons.ts';

function solutions(sfen: string, step: (typeof LESSONS)[number]['steps'][number]) {
  const game = createGame(sfen);
  return legalMoves(game.state).filter((move) => {
    const after = playMove(game, move);
    return after !== null && goalMet(step.goal, game.state, move, after);
  });
}

function expectSanePosition(state: State, label: string) {
  const kings = state.board.filter((piece) => piece?.type === 'king');
  expect(kings, `${label}: one king each`).toHaveLength(2);
  expect(findKing(state.board, 'sente'), label).toBeGreaterThanOrEqual(0);
  expect(findKing(state.board, 'gote'), label).toBeGreaterThanOrEqual(0);
  expect(state.turn, `${label}: learner is sente`).toBe('sente');
  expect(isCheck(state, 'gote'), `${label}: side not to move must not be in check`).toBe(false);
  for (const color of ['sente', 'gote'] as const) {
    const files = new Set<number>();
    state.board.forEach((piece, index) => {
      if (!piece || piece.color !== color || piece.promoted) return;
      const rank = ((index / 9) | 0) + 1;
      const far = color === 'sente' ? rank : 10 - rank;
      if (piece.type === 'pawn' || piece.type === 'lance') expect(far, `${label}: dead ${piece.type}`).toBeGreaterThan(1);
      if (piece.type === 'knight') expect(far, `${label}: dead knight`).toBeGreaterThan(2);
      if (piece.type === 'pawn') {
        expect(files.has(index % 9), `${label}: nifu`).toBe(false);
        files.add(index % 9);
      }
    });
  }
}

describe('tutorial lessons', () => {
  it('has unique ids and at least one step each', () => {
    const ids = LESSONS.map((lesson) => lesson.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const lesson of LESSONS) expect(lesson.steps.length, lesson.id).toBeGreaterThan(0);
    expect(LESSONS[LESSONS.length - 1]?.finale).toBe(true);
  });

  for (const lesson of LESSONS) {
    lesson.steps.forEach((step, index) => {
      const label = `${lesson.id}#${index + 1}`;
      it(`${label}: legal setup and achievable task`, () => {
        const state = parseSfen(step.sfen);
        expect(toSfen(state)).toBe(step.sfen);
        expectSanePosition(state, label);
        expect(createGame(step.sfen).result, `${label}: game not already over`).toBeNull();
        for (const mark of markSquares(step)) expect(mark >= 0 && mark < 81, label).toBe(true);

        const goal = step.goal;
        if (goal.kind === 'read') return;
        if (goal.kind === 'tap') {
          expect(toIndex(goal.square)).toBeGreaterThanOrEqual(0);
          return;
        }
        const good = solutions(step.sfen, step);
        expect(good.length, `${label}: target move must be legal`).toBeGreaterThan(0);
        if (!(goal.kind === 'escape' && goal.how === 'king')) {
          expect(good.length, `${label}: not every move may succeed`).toBeLessThan(legalMoves(state).length);
        }

        if (typeof step.select === 'string') {
          expect(state.hands.sente[step.select], `${label}: selected hand piece exists`).toBeGreaterThan(0);
        } else if (step.select) {
          expect(state.board[toIndex(step.select)]?.color, `${label}: selected piece is ours`).toBe('sente');
        }
        if (goal.kind === 'move' && goal.from) {
          expect(state.board[toIndex(goal.from)]?.color).toBe('sente');
        }
        if (goal.kind === 'escape') {
          expect(isCheck(state, 'sente'), `${label}: escape lessons start in check`).toBe(true);
        }
        for (const mark of step.marks ?? []) {
          expect(good.some((move) => move.to === toIndex(mark)), `${label}: mark ${mark.join('')} is a solution square`).toBe(true);
        }
        for (const ng of step.ng ?? []) {
          const to = toIndex(ng);
          const relevant = legalMoves(state).filter((move) =>
            typeof step.select === 'string'
              ? move.from === null && move.piece === step.select
              : move.from === (step.select ? toIndex(step.select) : -1),
          );
          expect(relevant.some((move) => move.to === to), `${label}: ✕ square ${ng.join('')} must be illegal`).toBe(false);
        }
        for (const bad of step.illegal ?? []) {
          expect(
            legalMoves(state).some((move) => move.from === null && move.piece === bad.drop && move.to === toIndex(bad.to)),
            `${label}: ${bad.drop} drop on ${bad.to.join('')} is a foul`,
          ).toBe(false);
        }
      });
    });
  }

  it('mate puzzles are real mate in 1 and the answer square mates', () => {
    const puzzles = LESSONS.flatMap((lesson) => lesson.steps).filter(
      (step) => step.goal.kind === 'mate' || (step.goal.kind === 'move' && step.goal.mate),
    );
    expect(puzzles.length).toBeGreaterThanOrEqual(5);
    for (const step of puzzles) {
      const game = createGame(step.sfen);
      expect(isCheck(game.state, 'sente')).toBe(false);
      const mates = legalMoves(game.state).filter((move) => playMove(game, move)?.result?.kind === 'checkmate');
      expect(mates.length, step.sfen).toBeGreaterThan(0);
      for (const move of solutions(step.sfen, step)) {
        const after = playMove(game, move)!;
        expect(after.result?.kind, step.sfen).toBe('checkmate');
        expect(legalMoves(after.state), step.sfen).toHaveLength(0);
      }
      if (step.answer) expect(mates.some((move) => move.to === toIndex(step.answer!)), step.sfen).toBe(true);
    }
  });

  it('promotion steps fail when the learner declines to promote', () => {
    for (const step of LESSONS.flatMap((lesson) => lesson.steps)) {
      const goal = step.goal;
      if (goal.kind !== 'move' || goal.promote !== true || !goal.from) continue;
      const game = createGame(step.sfen);
      const decline = legalMoves(game.state).find(
        (move) => move.from === toIndex(goal.from!) && move.to === toIndex(goal.to) && !move.promote,
      );
      expect(decline, step.sfen).toBeDefined();
      expect(goalMet(goal, game.state, decline!, playMove(game, decline!)!)).toBe(false);
    }
  });

  it('the capture lesson free piece is really free and the other is defended', () => {
    const game = createGame('4k4/6s2/2g3p2/9/4B4/9/9/9/4K4 b - 1');
    const takePawn = playMove(game, { from: toIndex([5, 5]), to: toIndex([3, 3]), piece: 'bishop', promote: false })!;
    expect(legalMoves(takePawn.state).some((move) => move.to === toIndex([3, 3]) && move.capture === 'bishop')).toBe(true);
    const takeGold = playMove(game, { from: toIndex([5, 5]), to: toIndex([7, 3]), piece: 'bishop', promote: false })!;
    expect(legalMoves(takeGold.state).some((move) => move.to === toIndex([7, 3]))).toBe(false);
  });
});
