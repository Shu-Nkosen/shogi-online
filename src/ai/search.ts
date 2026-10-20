import { hashState } from '../engine/hash.ts';
import { applyMove, isCheck, legalMoves } from '../engine/moves.ts';
import type { Move, PieceType, State } from '../engine/types.ts';
import { evaluate } from './eval.ts';

export const LEVELS = ['easy', 'normal', 'hard'] as const;
export type Level = (typeof LEVELS)[number];

interface LevelOptions {
  maxDepth: number;
  timeMs: number;
  randomness: number;
  quiescence: boolean;
}

const OPTIONS: Record<Level, LevelOptions> = {
  easy: { maxDepth: 2, timeMs: 700, randomness: 140, quiescence: false },
  normal: { maxDepth: 3, timeMs: 1600, randomness: 0, quiescence: true },
  hard: { maxDepth: 4, timeMs: 2800, randomness: 0, quiescence: true },
};

const MATE = 100_000;
const CAPTURE_VALUE: Record<PieceType, number> = {
  pawn: 100,
  lance: 300,
  knight: 340,
  silver: 460,
  gold: 530,
  bishop: 720,
  rook: 880,
  king: 0,
};

interface Entry {
  depth: number;
  score: number;
  flag: 'exact' | 'lower' | 'upper';
  best: Move | null;
}

interface Context {
  deadline: number;
  nodes: number;
  aborted: boolean;
  quiescence: boolean;
  tt: Map<bigint, Entry>;
}

function moveKey(move: Move): string {
  return `${move.from ?? 'd'}:${move.to}:${move.piece}:${move.promote ? 1 : 0}`;
}

function orderScore(move: Move): number {
  let score = 0;
  if (move.capture) {
    const victim = CAPTURE_VALUE[move.capture] + (move.capturedPromoted ? 250 : 0);
    score += 10_000 + victim * 8 - CAPTURE_VALUE[move.piece];
  }
  if (move.promote) score += 800;
  return score;
}

function ordered(moves: Move[], best: Move | null): Move[] {
  return [...moves].sort((a, b) => {
    const aBest = best && moveKey(a) === moveKey(best) ? 50_000 : 0;
    const bBest = best && moveKey(b) === moveKey(best) ? 50_000 : 0;
    return orderScore(b) + bBest - (orderScore(a) + aBest);
  });
}

function sameMove(a: Move, b: Move): boolean {
  return moveKey(a) === moveKey(b);
}

function negamax(state: State, depth: number, alpha: number, beta: number, ply: number, ctx: Context): number {
  ctx.nodes += 1;
  if ((ctx.nodes & 127) === 0 && performance.now() > ctx.deadline) {
    ctx.aborted = true;
  }
  if (ctx.aborted) return evaluate(state);

  const hash = hashState(state);
  const cached = ctx.tt.get(hash);
  if (cached && cached.depth >= depth && Math.abs(cached.score) < 90_000) {
    if (cached.flag === 'exact') return cached.score;
    if (cached.flag === 'lower' && cached.score >= beta) return cached.score;
    if (cached.flag === 'upper' && cached.score <= alpha) return cached.score;
  }

  const inCheck = isCheck(state, state.turn);
  if (depth <= 0 && !inCheck) {
    return ctx.quiescence ? quiescence(state, alpha, beta, ply, ctx, 0) : evaluate(state);
  }

  const moves = legalMoves(state);
  if (moves.length === 0) return inCheck ? -MATE + ply : -50_000 + ply;
  if (depth <= 0) return evaluate(state) - 25;

  let bestScore = -MATE;
  let bestMove: Move | null = cached?.best ?? null;
  let flag: Entry['flag'] = 'upper';
  for (const move of ordered(moves, bestMove)) {
    if (ctx.aborted) break;
    const score = -negamax(applyMove(state, move), depth - 1, -beta, -alpha, ply + 1, ctx);
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
    if (score > alpha) {
      alpha = score;
      flag = 'exact';
    }
    if (alpha >= beta) {
      flag = 'lower';
      break;
    }
  }
  if (!ctx.aborted && Math.abs(bestScore) < 90_000) {
    ctx.tt.set(hash, { depth, score: bestScore, flag, best: bestMove });
  }
  return bestScore;
}

function quiescence(state: State, alpha: number, beta: number, ply: number, ctx: Context, extra: number): number {
  ctx.nodes += 1;
  if ((ctx.nodes & 127) === 0 && performance.now() > ctx.deadline) ctx.aborted = true;
  if (ctx.aborted) return evaluate(state);
  const stand = evaluate(state);
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;
  if (extra >= 2) return alpha;
  const tactical = legalMoves(state).filter((move) => move.capture || move.promote);
  for (const move of ordered(tactical, null)) {
    if (ctx.aborted) break;
    const score = -quiescence(applyMove(state, move), -beta, -alpha, ply + 1, ctx, extra + 1);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

export function chooseMove(state: State, level: Level): Move {
  const options = OPTIONS[level];
  const moves = legalMoves(state);
  const first = moves[0];
  if (!first) throw new Error('指せる手がありません');
  if (moves.length === 1) return first;

  const ctx: Context = {
    deadline: performance.now() + options.timeMs,
    nodes: 0,
    aborted: false,
    quiescence: options.quiescence,
    tt: new Map(),
  };
  let best = first;
  let completed = new Map<string, number>();

  for (let depth = 1; depth <= options.maxDepth; depth += 1) {
    if (performance.now() > ctx.deadline) break;
    ctx.aborted = false;
    const running = new Map<string, number>();
    let depthBest = best;
    let depthBestScore = -MATE;
    let alpha = -MATE;
    const beta = MATE;
    for (const move of ordered(moves, depthBest)) {
      if (performance.now() > ctx.deadline && depth > 1) {
        ctx.aborted = true;
        break;
      }
      const score = -negamax(applyMove(state, move), depth - 1, -beta, -alpha, 1, ctx);
      if (ctx.aborted) break;
      running.set(moveKey(move), score);
      if (score > depthBestScore) {
        depthBestScore = score;
        depthBest = move;
        alpha = score;
      }
    }
    if (ctx.aborted) break;
    best = depthBest;
    completed = running;
  }

  if (options.randomness <= 0 || completed.size === 0) return best;
  const bestScore = completed.get(moveKey(best)) ?? 0;
  const pool = moves.filter((move) => (completed.get(moveKey(move)) ?? -MATE) >= bestScore - options.randomness);
  const pick = pool[Math.floor(Math.random() * pool.length)];
  return pick ?? best;
}

export function levelLabel(level: Level): string {
  switch (level) {
    case 'easy':
      return '易しい';
    case 'normal':
      return '普通';
    case 'hard':
      return '強い';
    default:
      return assertLevel(level);
  }
}

function assertLevel(value: never): never {
  throw new Error(`不明な強さ: ${String(value)}`);
}

export { sameMove };
