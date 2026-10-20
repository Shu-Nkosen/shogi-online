import { isCheck, findLegal, legalMoves, applyMove } from './moves.ts';
import { opposite } from './pieces.ts';
import { initialState, parseSfen, toSfen } from './sfen.ts';
import { type Color, type Move, type Result, type State, type Status, type WireMove } from './types.ts';

export interface PlayedGame {
  state: State;
  moves: Move[];
  keys: string[];
  deliveredCheck: boolean[];
  result: Result | null;
}

export function createGame(sfen?: string): PlayedGame {
  const state = sfen ? parseSfen(sfen) : initialState();
  return finishIfTerminal({
    state,
    moves: [],
    keys: [toSfen(state)],
    deliveredCheck: [],
    result: null,
  });
}

export function playMove(game: PlayedGame, partial: Pick<Move, 'from' | 'to' | 'piece' | 'promote'>): PlayedGame | null {
  if (game.result) return null;
  const move = findLegal(game.state, partial);
  if (!move) return null;
  const nextState = applyMove(game.state, move);
  const next: PlayedGame = {
    state: nextState,
    moves: [...game.moves, move],
    keys: [...game.keys, toSfen(nextState)],
    deliveredCheck: [...game.deliveredCheck, isCheck(nextState, nextState.turn)],
    result: null,
  };
  return finishIfTerminal(applyRepetition(next));
}

export function resign(game: PlayedGame, color: Color): PlayedGame {
  if (game.result) return game;
  return { ...game, result: { kind: 'resign', winner: opposite(color) } };
}

export function gameStatus(game: PlayedGame): Status {
  if (game.result) return game.result;
  if (isCheck(game.state, game.state.turn)) return { kind: 'check' };
  return { kind: 'playing' };
}

export function toWire(move: Move): WireMove {
  return { f: move.from, t: move.to, p: move.piece, pr: move.promote };
}

export function replay(wireMoves: readonly WireMove[], result: Result | null = null): PlayedGame {
  let game = createGame();
  for (const wire of wireMoves) {
    if (game.result) break;
    const next = playMove(game, { from: wire.f, to: wire.t, piece: wire.p, promote: wire.pr });
    if (!next) break;
    game = next;
  }
  if (result?.kind === 'resign' && !game.result) return { ...game, result };
  if (result?.kind === 'sennichite' && !game.result) return { ...game, result };
  return game;
}

function finishIfTerminal(game: PlayedGame): PlayedGame {
  if (game.result) return game;
  if (legalMoves(game.state).length > 0) return game;
  const winner = opposite(game.state.turn);
  const kind = isCheck(game.state, game.state.turn) ? 'checkmate' : 'nomove';
  return { ...game, result: { kind, winner } };
}

function applyRepetition(game: PlayedGame): PlayedGame {
  const key = game.keys[game.keys.length - 1];
  const indices: number[] = [];
  for (let i = 0; i < game.keys.length; i += 1) {
    if (game.keys[i] === key) indices.push(i);
  }
  if (indices.length < 4) return game;
  const start = indices[indices.length - 4] ?? 0;
  const end = indices[indices.length - 1] ?? 0;
  const lastMover = opposite(game.state.turn);
  let senteChecks = true;
  let goteChecks = true;
  let senteCount = 0;
  let goteCount = 0;
  for (let m = start; m < end; m += 1) {
    const distance = game.moves.length - 1 - m;
    const mover: Color = distance % 2 === 0 ? lastMover : opposite(lastMover);
    const gave = game.deliveredCheck[m] ?? false;
    if (mover === 'sente') {
      senteCount += 1;
      if (!gave) senteChecks = false;
    } else {
      goteCount += 1;
      if (!gave) goteChecks = false;
    }
  }
  const sentePerpetual = senteCount > 0 && senteChecks;
  const gotePerpetual = goteCount > 0 && goteChecks;
  let winner: Color | null = null;
  if (sentePerpetual && !gotePerpetual) winner = 'gote';
  else if (gotePerpetual && !sentePerpetual) winner = 'sente';
  return { ...game, result: { kind: 'sennichite', winner } };
}
