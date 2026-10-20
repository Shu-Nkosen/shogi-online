import { createGame, playMove, replay, resign, toWire, type PlayedGame } from '../engine/game.ts';
import type { Color, Move, Result, WireMove } from '../engine/types.ts';

export type Presence = 'waiting' | 'live' | 'away';

export type NetMsg =
  | { t: 'hello'; v: 1; id: string; role: 'host' | 'guest' }
  | { t: 'state'; v: 1; id: string; moves: WireMove[]; result: Result | null }
  | { t: 'move'; v: 1; id: string; seq: number; move: WireMove }
  | { t: 'resign'; v: 1; id: string }
  | { t: 'reset'; v: 1; id: string }
  | { t: 'ping'; v: 1; id: string; role: 'host' | 'guest' }
  | { t: 'req'; v: 1; id: string }
  | { t: 'full'; v: 1; id: string };

export interface Session {
  role: 'host' | 'guest';
  selfId: string;
  game: PlayedGame;
  guestId: string | null;
  opponentSeen: number;
  presence: Presence;
  synced: boolean;
  error: string | null;
}

export interface Outgoing {
  msg: NetMsg;
  retain: boolean;
}

export interface Step {
  session: Session;
  send: Outgoing[];
  animate: Move | null;
}

export type Action =
  | { type: 'move'; move: Move }
  | { type: 'resign' }
  | { type: 'reset' }
  | { type: 'ping'; now: number };

const AWAY_MS = 12_000;

export function createSession(role: 'host' | 'guest', selfId: string): Session {
  return {
    role,
    selfId,
    game: createGame(),
    guestId: null,
    opponentSeen: 0,
    presence: 'waiting',
    synced: role === 'host',
    error: null,
  };
}

export function ingest(session: Session, msg: NetMsg, now: number): Step {
  if (msg.v !== 1) return idle(session);
  switch (msg.t) {
    case 'hello':
      return onHello(session, msg, now);
    case 'state':
      return onState(session, msg, now);
    case 'move':
      return onMove(session, msg, now);
    case 'resign':
      return onResign(session, msg, now);
    case 'reset':
      return onReset(session, msg);
    case 'ping':
      return onPing(session, msg, now);
    case 'req':
      return onReq(session, msg);
    case 'full':
      if (session.role === 'guest' && msg.id !== session.selfId) {
        return done({ ...session, error: 'この部屋は満席です', presence: 'waiting' }, [], null);
      }
      return idle(session);
    default:
      return assertMsg(msg);
  }
}

export function act(session: Session, action: Action): Step {
  switch (action.type) {
    case 'ping':
      return {
        session: refreshPresence(session, action.now),
        send: [{ msg: { t: 'ping', v: 1, id: session.selfId, role: session.role }, retain: false }],
        animate: null,
      };
    case 'move':
      return onLocalMove(session, action.move);
    case 'resign':
      return onLocalResign(session);
    case 'reset':
      return onLocalReset(session);
    default:
      return assertAction(action);
  }
}

export function refreshPresence(session: Session, now: number): Session {
  if (!session.synced || session.presence === 'waiting') return session;
  if (session.opponentSeen === 0) return session;
  const away = now - session.opponentSeen > AWAY_MS;
  const presence: Presence = away ? 'away' : 'live';
  if (presence === session.presence) return session;
  return { ...session, presence };
}

export function myColor(role: 'host' | 'guest'): Color {
  return role === 'host' ? 'sente' : 'gote';
}

function onHello(session: Session, msg: Extract<NetMsg, { t: 'hello' }>, now: number): Step {
  if (msg.id === session.selfId || session.role !== 'host' || msg.role !== 'guest') return idle(session);
  if (session.guestId && session.guestId !== msg.id && now - session.opponentSeen < AWAY_MS) {
    return done(session, [{ msg: { t: 'full', v: 1, id: session.selfId }, retain: false }], null);
  }
  const next: Session = {
    ...session,
    guestId: msg.id,
    opponentSeen: now,
    presence: 'live',
    synced: true,
    error: null,
  };
  return done(next, [stateOut(next)], null);
}

function onState(session: Session, msg: Extract<NetMsg, { t: 'state' }>, now: number): Step {
  if (session.role === 'host') {
    if (msg.id === session.selfId && session.game.moves.length === 0 && msg.moves.length > 0) {
      return done({ ...session, game: replay(msg.moves, msg.result), synced: true }, [], null);
    }
    return idle(session);
  }
  if (msg.id === session.selfId) return idle(session);
  const localLen = session.game.moves.length;
  if (msg.moves.length === localLen && sameResult(session.game.result, msg.result)) {
    return done({ ...session, presence: 'live', opponentSeen: now, synced: true, error: null }, [], null);
  }
  const game = replay(msg.moves, msg.result);
  const animate = msg.moves.length === localLen + 1 ? (game.moves[game.moves.length - 1] ?? null) : null;
  return done(
    { ...session, game, presence: 'live', opponentSeen: now, synced: true, error: null },
    [],
    animate,
  );
}

function onMove(session: Session, msg: Extract<NetMsg, { t: 'move' }>, now: number): Step {
  if (session.role !== 'host' || msg.id === session.selfId) return idle(session);
  if (session.guestId && session.guestId !== msg.id && now - session.opponentSeen < AWAY_MS) {
    return done(session, [{ msg: { t: 'full', v: 1, id: session.selfId }, retain: false }], null);
  }
  if (session.game.result || msg.seq !== session.game.moves.length || session.game.state.turn !== 'gote') {
    return done(session, [stateOut(session)], null);
  }
  const nextGame = playMove(session.game, { from: msg.move.f, to: msg.move.t, piece: msg.move.p, promote: msg.move.pr });
  if (!nextGame) return done(session, [stateOut(session)], null);
  const next: Session = {
    ...session,
    game: nextGame,
    guestId: session.guestId ?? msg.id,
    presence: 'live',
    opponentSeen: now,
    synced: true,
  };
  return done(next, [stateOut(next)], nextGame.moves[nextGame.moves.length - 1] ?? null);
}

function onResign(session: Session, msg: Extract<NetMsg, { t: 'resign' }>, now: number): Step {
  if (session.role !== 'host' || msg.id === session.selfId) return idle(session);
  if (session.game.result) return done(session, [stateOut(session)], null);
  const next: Session = {
    ...session,
    game: resign(session.game, 'gote'),
    guestId: session.guestId ?? msg.id,
    presence: 'live',
    opponentSeen: now,
  };
  return done(next, [stateOut(next)], null);
}

function onReset(session: Session, msg: Extract<NetMsg, { t: 'reset' }>): Step {
  if (session.role !== 'host' || msg.id === session.selfId || !session.game.result) return idle(session);
  const next: Session = { ...session, game: createGame(), error: null };
  return done(next, [stateOut(next)], null);
}

function onPing(session: Session, msg: Extract<NetMsg, { t: 'ping' }>, now: number): Step {
  if (msg.id === session.selfId) return idle(session);
  if (session.role === 'host' && msg.role === 'guest') {
    if (session.guestId && session.guestId !== msg.id) return idle(session);
    const presence: Presence = session.synced && session.guestId ? 'live' : session.presence;
    return done({ ...session, opponentSeen: now, guestId: session.guestId ?? msg.id, presence }, [], null);
  }
  if (session.role === 'guest' && msg.role === 'host') {
    const presence: Presence = session.synced ? 'live' : 'waiting';
    return done({ ...session, opponentSeen: now, presence }, [], null);
  }
  return idle(session);
}

function onReq(session: Session, msg: Extract<NetMsg, { t: 'req' }>): Step {
  if (session.role !== 'host' || msg.id === session.selfId) return idle(session);
  return done(session, [stateOut(session)], null);
}

function onLocalMove(session: Session, move: Move): Step {
  if (session.game.result || session.error) return idle(session);
  const color = myColor(session.role);
  if (session.game.state.turn !== color) return idle(session);
  if (session.role === 'host' && session.presence !== 'live') return idle(session);
  if (session.role === 'guest' && !session.synced) return idle(session);
  const nextGame = playMove(session.game, move);
  if (!nextGame) return idle(session);
  const animate = nextGame.moves[nextGame.moves.length - 1] ?? null;
  const next = { ...session, game: nextGame };
  if (session.role === 'host') return done(next, [stateOut(next)], animate);
  return done(
    next,
    [{ msg: { t: 'move', v: 1, id: session.selfId, seq: session.game.moves.length, move: toWire(move) }, retain: false }],
    animate,
  );
}

function onLocalResign(session: Session): Step {
  if (session.game.result) return idle(session);
  if (session.role === 'host') {
    const next = { ...session, game: resign(session.game, 'sente') };
    return done(next, [stateOut(next)], null);
  }
  if (!session.synced) return idle(session);
  const next = { ...session, game: resign(session.game, 'gote') };
  return done(next, [{ msg: { t: 'resign', v: 1, id: session.selfId }, retain: false }], null);
}

function onLocalReset(session: Session): Step {
  if (!session.game.result) return idle(session);
  if (session.role === 'guest') {
    return done(session, [{ msg: { t: 'reset', v: 1, id: session.selfId }, retain: false }], null);
  }
  const next = { ...session, game: createGame() };
  return done(next, [stateOut(next)], null);
}

function stateOut(session: Session): Outgoing {
  return {
    retain: true,
    msg: {
      t: 'state',
      v: 1,
      id: session.selfId,
      moves: session.game.moves.map(toWire),
      result: session.game.result,
    },
  };
}

function sameResult(a: Result | null, b: Result | null): boolean {
  if (!a && !b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  return a.winner === b.winner;
}

function idle(session: Session): Step {
  return { session, send: [], animate: null };
}

function done(session: Session, send: Outgoing[], animate: Move | null): Step {
  return { session, send, animate };
}

function assertMsg(value: never): Step {
  throw new Error(`不明な通信: ${JSON.stringify(value)}`);
}

function assertAction(value: never): Step {
  throw new Error(`不明な操作: ${JSON.stringify(value)}`);
}
