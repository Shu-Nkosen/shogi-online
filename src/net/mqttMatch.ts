import mqtt, { type MqttClient } from 'mqtt';
import type { Move } from '../engine/types.ts';
import { toWire } from '../engine/game.ts';
import { act, createSession, ingest, type NetMsg, type Presence, type Session } from './protocol.ts';

export const BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081',
];

export type LinkStatus = 'connecting' | 'online' | 'offline';

export interface OnlineHandle {
  move: (move: Move) => void;
  resign: () => void;
  reset: () => void;
  close: () => void;
}

interface StartOptions {
  room: string;
  role: 'host' | 'guest';
  clientId: string;
  onSession: (session: Session, animate: Move | null) => void;
  onLink: (status: LinkStatus) => void;
}

export function roomTopic(room: string): string {
  return `shogi/koma/v1/${room}`;
}

export function startOnline(options: StartOptions): OnlineHandle {
  const topic = roomTopic(options.room);
  let session = createSession(options.role, options.clientId);
  let client: MqttClient | null = null;
  let closed = false;
  let opened = false;
  let ready = false;
  let booted = false;
  const buffered: NetMsg[] = [];
  let presenceTimer = 0;

  const publish = (msg: NetMsg, retain: boolean) => {
    if (!client || !opened) return;
    client.publish(topic, JSON.stringify(msg), { qos: 0, retain });
  };

  const commit = (next: Session, send: { msg: NetMsg; retain: boolean }[], animate: Move | null, force: boolean) => {
    const previous = session;
    session = next;
    for (const item of send) publish(item.msg, item.retain);
    const changed =
      force ||
      previous.game !== session.game ||
      previous.presence !== session.presence ||
      previous.error !== session.error ||
      animate !== null;
    if (changed) options.onSession(session, animate);
  };

  const applyMessage = (msg: NetMsg) => {
    const step = ingest(session, msg, Date.now());
    commit(step.session, step.send, step.animate, false);
  };

  const arm = (active: MqttClient) => {
    client = active;
    active.on('message', (_topic, payload) => {
      if (closed) return;
      let msg: NetMsg;
      try {
        msg = JSON.parse(payload.toString()) as NetMsg;
      } catch {
        return;
      }
      if (!ready) {
        buffered.push(msg);
        return;
      }
      applyMessage(msg);
    });
    active.on('offline', () => {
      if (!closed) options.onLink('offline');
    });
    active.on('reconnect', () => {
      if (!closed) options.onLink('connecting');
    });
    const onConnect = () => {
      if (closed) return;
      opened = true;
      options.onLink('online');
      const firstConnect = !booted;
      booted = true;
      active.subscribe(topic, { qos: 0 }, () => {
        if (closed) return;
        if (ready) {
          if (options.role === 'guest') {
            publish({ t: 'hello', v: 1, id: options.clientId, role: 'guest' }, false);
            publish({ t: 'req', v: 1, id: options.clientId }, false);
          } else {
            publish(stateMessage(session), true);
          }
          return;
        }
        window.setTimeout(() => {
          if (closed || ready) return;
          ready = true;
          const queued = buffered.splice(0);
          for (const msg of queued) applyMessage(msg);
          if (options.role === 'host' && session.game.moves.length === 0) {
            publish(stateMessage(session), true);
          }
          if (options.role === 'guest') {
            publish({ t: 'hello', v: 1, id: options.clientId, role: 'guest' }, false);
            publish({ t: 'req', v: 1, id: options.clientId }, false);
          }
          options.onSession(session, null);
        }, 700);
      });
      if (firstConnect) {
        presenceTimer = window.setInterval(() => {
          if (closed) return;
          const step = act(session, { type: 'ping', now: Date.now() });
          commit(step.session, step.send, null, false);
        }, 3000);
      }
    };
    active.on('connect', onConnect);
    if (active.connected) onConnect();
  };

  void connectFirst(options.clientId)
    .then((active) => {
      if (closed) {
        active.end(true);
        return;
      }
      arm(active);
    })
    .catch(() => {
      if (!closed) options.onLink('offline');
    });

  options.onLink('connecting');
  options.onSession(session, null);

  return {
    move(move) {
      const step = act(session, { type: 'move', move });
      commit(step.session, step.send, step.animate, false);
    },
    resign() {
      const step = act(session, { type: 'resign' });
      commit(step.session, step.send, step.animate, false);
    },
    reset() {
      const step = act(session, { type: 'reset' });
      commit(step.session, step.send, step.animate, true);
    },
    close() {
      closed = true;
      window.clearInterval(presenceTimer);
      client?.end(true);
    },
  };
}

function stateMessage(session: Session): NetMsg {
  return {
    t: 'state',
    v: 1,
    id: session.selfId,
    moves: session.game.moves.map(toWire),
    result: session.game.result,
  };
}

function connectFirst(clientId: string): Promise<MqttClient> {
  const attempt = (index: number): Promise<MqttClient> => {
    const url = BROKERS[index];
    if (!url) return Promise.reject(new Error('中継サーバーに接続できません'));
    const suffix = Math.floor(Math.random() * 0xffff).toString(16);
    return connectOne(url, `${clientId}${index}${suffix}`.slice(0, 23)).catch(() => attempt(index + 1));
  };
  return attempt(0);
}

function connectOne(url: string, clientId: string): Promise<MqttClient> {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(url, {
      clientId,
      clean: true,
      reconnectPeriod: 2000,
      connectTimeout: 7000,
      keepalive: 30,
    });
    const timer = window.setTimeout(() => {
      client.end(true);
      reject(new Error('timeout'));
    }, 8000);
    client.once('connect', () => {
      window.clearTimeout(timer);
      resolve(client);
    });
    client.once('error', () => {
      window.clearTimeout(timer);
      client.end(true);
      reject(new Error('error'));
    });
  });
}

export function makeRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length] ?? 'A').join('');
}

export function tabClientId(): string {
  const key = 'shogi.clientId';
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const id = `p${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
  sessionStorage.setItem(key, id);
  return id;
}

export type { Presence };
