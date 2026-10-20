import type { Move } from '../engine/types.ts';

export interface FxItem {
  id: number;
  move: Move;
}

/**
 * 盤面の「表示」を実際の対局状態から少し遅らせるためのキュー。
 * 対局状態（通信・CPU）はすぐ進め、演出中に来た手は演出が終わってから順に見せる。
 */
export interface DisplayState<G> {
  shown: G;
  fx: FxItem | null;
  queue: { game: G; move: Move | null }[];
  nextId: number;
}

export function initDisplay<G>(game: G): DisplayState<G> {
  return { shown: game, fx: null, queue: [], nextId: 1 };
}

function animates(move: Move | null): move is Move {
  return Boolean(move && move.from !== null);
}

export function pushDisplay<G>(state: DisplayState<G>, game: G, move: Move | null): DisplayState<G> {
  if (state.fx || state.queue.length > 0) {
    const last = state.queue[state.queue.length - 1];
    if (!move && last && !last.move) {
      return { ...state, queue: [...state.queue.slice(0, -1), { game, move: null }] };
    }
    return { ...state, queue: [...state.queue, { game, move }] };
  }
  if (animates(move)) {
    return { ...state, shown: game, fx: { id: state.nextId, move }, nextId: state.nextId + 1 };
  }
  return { ...state, shown: game };
}

export function finishFx<G>(state: DisplayState<G>): DisplayState<G> {
  let shown = state.shown;
  let nextId = state.nextId;
  const queue = state.queue.slice();
  while (queue.length > 0) {
    const item = queue.shift()!;
    shown = item.game;
    if (animates(item.move)) {
      return { shown, fx: { id: nextId, move: item.move }, queue, nextId: nextId + 1 };
    }
  }
  return { shown, fx: null, queue: [], nextId };
}

export function resetDisplay<G>(state: DisplayState<G>, game: G): DisplayState<G> {
  return { shown: game, fx: null, queue: [], nextId: state.nextId };
}

export function isIdle<G>(state: DisplayState<G>): boolean {
  return !state.fx && state.queue.length === 0;
}
