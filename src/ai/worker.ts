import { parseSfen } from '../engine/sfen.ts';
import { toWire } from '../engine/game.ts';
import { chooseMove, type Level } from './search.ts';

interface GoRequest {
  type: 'go';
  id: number;
  sfen: string;
  level: Level;
}

self.onmessage = (event: MessageEvent<GoRequest>) => {
  const data = event.data;
  if (data.type !== 'go') return;
  try {
    const move = chooseMove(parseSfen(data.sfen), data.level);
    self.postMessage({ type: 'move', id: data.id, move: toWire(move) });
  } catch (error) {
    const message = error instanceof Error ? error.message : '読みに失敗しました';
    self.postMessage({ type: 'error', id: data.id, message });
  }
};
