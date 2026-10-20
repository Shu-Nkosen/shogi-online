import { useEffect, useMemo, useRef, useState } from 'react';
import type { Level } from '../ai/search.ts';
import { createGame, playMove, resign as resignGame, type PlayedGame } from '../engine/game.ts';
import { legalMoves } from '../engine/moves.ts';
import { toSfen } from '../engine/sfen.ts';
import type { Color, Move, PieceType } from '../engine/types.ts';
import { startOnline, tabClientId, type LinkStatus, type OnlineHandle } from '../net/mqttMatch.ts';
import { myColor, type Presence } from '../net/protocol.ts';

export type MatchConfig =
  | { mode: 'local' }
  | { mode: 'ai'; level: Level; human: Color }
  | { mode: 'online'; room: string; role: 'host' | 'guest' };

export type Selection = { kind: 'board'; square: number } | { kind: 'hand'; piece: PieceType } | null;

interface WorkerResponse {
  type: 'move' | 'error';
  id: number;
  move?: { f: number | null; t: number; p: PieceType; pr: boolean };
  message?: string;
}

export function useMatch(config: MatchConfig) {
  const [game, setGame] = useState<PlayedGame>(() => createGame());
  const [fx, setFx] = useState<{ id: number; move: Move } | null>(null);
  const [thinking, setThinking] = useState(false);
  const [link, setLink] = useState<LinkStatus>(config.mode === 'online' ? 'connecting' : 'online');
  const [presence, setPresence] = useState<Presence>(config.mode === 'online' ? 'waiting' : 'live');
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Selection>(null);
  const [pending, setPending] = useState<Move[] | null>(null);
  const gameRef = useRef(game);
  const fxRef = useRef(fx);
  const onlineRef = useRef<OnlineHandle | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const searchId = useRef(0);
  const fxId = useRef(0);
  gameRef.current = game;
  fxRef.current = fx;

  const viewer: Color = config.mode === 'ai' ? config.human : config.mode === 'online' ? myColor(config.role) : 'sente';

  function showMove(next: PlayedGame, animate: Move | null) {
    setGame(next);
    setSelected(null);
    setPending(null);
    if (animate && animate.from !== null) {
      fxId.current += 1;
      const nextFx = { id: fxId.current, move: animate };
      fxRef.current = nextFx;
      setFx(nextFx);
    }
  }

  useEffect(() => {
    if (config.mode !== 'ai') return undefined;
    const worker = new Worker(new URL('../ai/worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const data = event.data;
      if (data.id !== searchId.current) return;
      setThinking(false);
      if (data.type !== 'move' || !data.move) {
        const fallback = legalMoves(gameRef.current.state)[0];
        if (!fallback) {
          setError('コンピュータが手を選べませんでした');
          return;
        }
        const next = playMove(gameRef.current, fallback);
        if (next) showMove(next, next.moves[next.moves.length - 1] ?? null);
        return;
      }
      const next = playMove(gameRef.current, {
        from: data.move.f,
        to: data.move.t,
        piece: data.move.p,
        promote: data.move.pr,
      });
      if (!next) {
        setError('コンピュータの手が指せませんでした');
        return;
      }
      showMove(next, next.moves[next.moves.length - 1] ?? null);
    };
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [config.mode]);

  useEffect(() => {
    if (config.mode !== 'ai') return undefined;
    if (game.result || fx || thinking) return undefined;
    if (game.state.turn === config.human) return undefined;
    const worker = workerRef.current;
    if (!worker) return undefined;
    searchId.current += 1;
    const id = searchId.current;
    setThinking(true);
    worker.postMessage({ type: 'go', id, sfen: toSfen(game.state), level: config.level });
    return undefined;
  }, [config, game, fx, thinking]);

  useEffect(() => {
    if (config.mode !== 'online') return undefined;
    const handle = startOnline({
      room: config.room,
      role: config.role,
      clientId: tabClientId(),
      onLink: setLink,
      onSession: (session, animate) => {
        setPresence(session.presence);
        setError(session.error);
        showMove(session.game, animate);
      },
    });
    onlineRef.current = handle;
    return () => {
      handle.close();
      onlineRef.current = null;
    };
  }, [config.mode, config.mode === 'online' ? config.room : '', config.mode === 'online' ? config.role : '']);

  const controllable = useMemo(() => {
    if (game.result || fx || pending) return false;
    if (config.mode === 'local') return true;
    if (config.mode === 'ai') return game.state.turn === config.human && !thinking;
    const mine = myColor(config.role);
    if (game.state.turn !== mine || link !== 'online' || error) return false;
    if (config.role === 'host') return presence === 'live' || presence === 'away';
    return presence === 'live';
  }, [config, error, fx, game.result, game.state.turn, link, pending, presence, thinking]);

  function commit(move: Move) {
    if (config.mode === 'online') {
      onlineRef.current?.move(move);
      setSelected(null);
      setPending(null);
      return;
    }
    const next = playMove(gameRef.current, move);
    if (!next) return;
    showMove(next, next.moves[next.moves.length - 1] ?? null);
  }

  function onSquare(square: number) {
    if (!controllable) return;
    const state = gameRef.current.state;
    if (selected?.kind === 'board') {
      const choices = legalMoves(state).filter((move) => move.from === selected.square && move.to === square);
      if (choices.length === 1 && choices[0]) {
        commit(choices[0]);
        return;
      }
      if (choices.length > 1) {
        setPending(choices);
        return;
      }
    }
    if (selected?.kind === 'hand') {
      const drop = legalMoves(state).find(
        (move) => move.from === null && move.piece === selected.piece && move.to === square,
      );
      if (drop) {
        commit(drop);
        return;
      }
    }
    const piece = state.board[square];
    if (piece && piece.color === state.turn) {
      const owned = config.mode === 'local' || (config.mode === 'ai' ? piece.color === config.human : piece.color === myColor(config.role));
      if (owned) {
        setSelected({ kind: 'board', square });
        return;
      }
    }
    setSelected(null);
  }

  function onHand(piece: PieceType) {
    if (!controllable) return;
    if (selected?.kind === 'hand' && selected.piece === piece) {
      setSelected(null);
      return;
    }
    setSelected({ kind: 'hand', piece });
  }

  function choosePromotion(promote: boolean) {
    const move = pending?.find((item) => item.promote === promote);
    setPending(null);
    if (move) commit(move);
  }

  function resign() {
    if (gameRef.current.result) return;
    if (config.mode === 'online') {
      onlineRef.current?.resign();
      return;
    }
    const color: Color = config.mode === 'ai' ? config.human : gameRef.current.state.turn;
    setGame(resignGame(gameRef.current, color));
    setSelected(null);
  }

  function reset() {
    setSelected(null);
    setPending(null);
    setFx(null);
    setError(null);
    if (config.mode === 'online') {
      onlineRef.current?.reset();
      return;
    }
    setGame(createGame());
  }

  const targets = useMemo(() => {
    const map = new Map<number, 'move' | 'capture'>();
    if (!selected || !controllable) return map;
    for (const move of legalMoves(game.state)) {
      const hit =
        selected.kind === 'board'
          ? move.from === selected.square
          : move.from === null && move.piece === selected.piece;
      if (!hit) continue;
      map.set(move.to, move.capture ? 'capture' : map.get(move.to) ?? 'move');
    }
    return map;
  }, [controllable, game, selected]);

  return {
    game,
    fx,
    thinking,
    link,
    presence,
    error,
    selected,
    pending,
    targets,
    viewer,
    controllable,
    onSquare,
    onHand,
    choosePromotion,
    cancelPromotion: () => setPending(null),
    clearFx: () => setFx(null),
    resign,
    reset,
  };
}
