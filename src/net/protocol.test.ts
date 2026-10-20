import { describe, expect, it } from 'vitest';
import { legalMoves } from '../engine/moves.ts';
import { sq } from '../engine/pieces.ts';
import { toSfen } from '../engine/sfen.ts';
import { act, createSession, ingest, type Session, type Step } from './protocol.ts';

function exchange(from: Step, to: Session, now: number): Step {
  let current = to;
  let last: Step = { session: to, send: [], animate: null };
  for (const out of from.send) {
    last = ingest(current, out.msg, now);
    current = last.session;
  }
  return last;
}

describe('online protocol', () => {
  it('syncs moves both ways and keeps a second guest out', () => {
    let host = createSession('host', 'host-1');
    let guest = createSession('guest', 'guest-1');
    const welcomed = ingest(host, { t: 'hello', v: 1, id: 'guest-1', role: 'guest' }, 1_000);
    host = welcomed.session;
    expect(host.presence).toBe('live');
    guest = exchange(welcomed, guest, 1_000).session;
    expect(guest.presence).toBe('live');
    expect(toSfen(guest.game.state)).toBe(toSfen(host.game.state));

    const blocked = act(host, { type: 'move', move: legalMoves(createSession('host', 'x').game.state)[0]! });
    expect(blocked.session.game.moves.length === 0 || blocked.send.length > 0).toBe(true);

    const pawn = legalMoves(host.game.state).find((move) => move.to === sq(7, 6));
    expect(pawn).toBeDefined();
    const hostMove = act(host, { type: 'move', move: pawn! });
    host = hostMove.session;
    const guestSaw = exchange(hostMove, guest, 2_000);
    guest = guestSaw.session;
    expect(guestSaw.animate?.to).toBe(sq(7, 6));
    expect(toSfen(guest.game.state)).toBe(toSfen(host.game.state));

    const reply = legalMoves(guest.game.state).find((move) => move.piece === 'pawn');
    expect(reply).toBeDefined();
    const guestMove = act(guest, { type: 'move', move: reply! });
    guest = guestMove.session;
    const hostSaw = exchange(guestMove, host, 3_000);
    host = hostSaw.session;
    expect(host.game.moves).toHaveLength(2);
    expect(hostSaw.animate?.to).toBe(reply!.to);
    const confirm = exchange(hostSaw, guest, 3_000);
    expect(confirm.animate).toBeNull();
    expect(confirm.session.game.moves).toHaveLength(2);

    const stranger = ingest(host, { t: 'hello', v: 1, id: 'guest-2', role: 'guest' }, 3_100);
    expect(stranger.send[0]?.msg.t).toBe('full');
    const rejected = ingest(createSession('guest', 'guest-2'), stranger.send[0]!.msg, 3_100);
    expect(rejected.session.error).toContain('満席');
  });

  it('ignores an illegal move and shares a resignation', () => {
    const welcomed = ingest(createSession('host', 'h'), { t: 'hello', v: 1, id: 'g', role: 'guest' }, 1);
    const host = welcomed.session;
    const guest = exchange(welcomed, createSession('guest', 'g'), 1).session;
    const illegal = act(guest, {
      type: 'move',
      move: {
        from: sq(7, 7),
        to: sq(7, 5),
        piece: 'pawn',
        promote: false,
        capture: null,
        capturedPromoted: false,
        alreadyPromoted: false,
      },
    });
    expect(illegal.send).toHaveLength(0);
    expect(illegal.session.game.moves).toHaveLength(0);

    const resigned = act(guest, { type: 'resign' });
    expect(resigned.session.game.result).toEqual({ kind: 'resign', winner: 'sente' });
    const hostSaw = exchange(resigned, host, 2);
    expect(hostSaw.session.game.result).toEqual({ kind: 'resign', winner: 'sente' });
  });

  it('does not let the host move before the guest arrives', () => {
    const host = createSession('host', 'h');
    const move = legalMoves(host.game.state)[0];
    expect(move).toBeDefined();
    const step = act(host, { type: 'move', move: move! });
    expect(step.send).toHaveLength(0);
    expect(step.session.game.moves).toHaveLength(0);
  });
});
