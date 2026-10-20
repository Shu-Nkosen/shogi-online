import { useState } from 'react';
import { unlockAudio } from './audio.ts';
import { GameScreen } from './components/GameScreen.tsx';
import { HomeScreen } from './components/HomeScreen.tsx';
import type { Level } from './ai/search.ts';
import type { Color } from './engine/types.ts';
import type { MatchConfig } from './hooks/useMatch.ts';
import { makeRoomCode } from './net/mqttMatch.ts';

type Screen = { name: 'home' } | { name: 'game'; config: MatchConfig };

const ROOM_PATTERN = /^[A-HJ-NP-Z2-9]{4,8}$/;

function readOnline(): { room: string; role: 'host' | 'guest' } | null {
  const room = new URLSearchParams(window.location.search).get('room')?.toUpperCase() ?? '';
  if (!ROOM_PATTERN.test(room)) return null;
  const role = sessionStorage.getItem(`shogi.role.${room}`) === 'host' ? 'host' : 'guest';
  if (role === 'guest') sessionStorage.setItem(`shogi.role.${room}`, 'guest');
  return { room, role };
}

function setRoomUrl(room: string | null) {
  const url = new URL(window.location.href);
  if (room) url.searchParams.set('room', room);
  else url.searchParams.delete('room');
  window.history.replaceState(null, '', url);
}

export default function App() {
  const [screen, setScreen] = useState<Screen>(() => {
    const online = readOnline();
    return online ? { name: 'game', config: { mode: 'online', room: online.room, role: online.role } } : { name: 'home' };
  });

  function start(config: MatchConfig) {
    unlockAudio();
    if (config.mode === 'online') setRoomUrl(config.room);
    setScreen({ name: 'game', config });
  }

  return (
    <div className="app-shell" onPointerDown={unlockAudio}>
      {screen.name === 'home' ? (
        <HomeScreen
          onLocal={() => start({ mode: 'local' })}
          onAi={(level: Level, human: Color) => start({ mode: 'ai', level, human })}
          onCreate={() => {
            const room = makeRoomCode();
            sessionStorage.setItem(`shogi.role.${room}`, 'host');
            start({ mode: 'online', room, role: 'host' });
          }}
          onJoin={(room) => {
            const role = sessionStorage.getItem(`shogi.role.${room}`) === 'host' ? 'host' : 'guest';
            if (role === 'guest') sessionStorage.setItem(`shogi.role.${room}`, 'guest');
            start({ mode: 'online', room, role });
          }}
        />
      ) : (
        <GameScreen
          key={`${screen.config.mode}-${screen.config.mode === 'online' ? screen.config.room : ''}-${screen.config.mode === 'ai' ? screen.config.level + screen.config.human : ''}`}
          config={screen.config}
          onLeave={() => {
            setRoomUrl(null);
            setScreen({ name: 'home' });
          }}
        />
      )}
    </div>
  );
}
