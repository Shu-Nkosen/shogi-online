import { copyHands, emptyHands, makePiece, SFEN_TO_TYPE, TYPE_TO_SFEN } from './pieces.ts';
import { HAND_TYPES, type Piece, type PieceType, type State } from './types.ts';

export const INITIAL_SFEN = 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1';

export function initialState(): State {
  return parseSfen(INITIAL_SFEN);
}

export function parseSfen(sfen: string): State {
  const parts = sfen.trim().split(/\s+/);
  if (parts.length < 3) throw new Error(`SFENが不正です: ${sfen}`);
  const board = parseBoard(parts[0] ?? '');
  const turn = parts[1] === 'w' ? 'gote' : parts[1] === 'b' ? 'sente' : null;
  if (!turn) throw new Error(`手番が不正です: ${parts[1] ?? ''}`);
  const hands = parseHands(parts[2] ?? '-');
  return { board, hands, turn };
}

export function toSfen(state: State): string {
  const ranks: string[] = [];
  for (let y = 0; y < 9; y += 1) {
    let row = '';
    let empty = 0;
    for (let x = 0; x < 9; x += 1) {
      const piece = state.board[y * 9 + x];
      if (!piece) {
        empty += 1;
        continue;
      }
      if (empty) {
        row += String(empty);
        empty = 0;
      }
      row += pieceToSfen(piece);
    }
    if (empty) row += String(empty);
    ranks.push(row);
  }
  const turn = state.turn === 'sente' ? 'b' : 'w';
  return `${ranks.join('/')} ${turn} ${handsToSfen(state)} 1`;
}

function parseBoard(body: string): (Piece | null)[] {
  const ranks = body.split('/');
  if (ranks.length !== 9) throw new Error('SFENの段数が不正です');
  const board: (Piece | null)[] = Array.from({ length: 81 }, () => null);
  for (let y = 0; y < 9; y += 1) {
    const row = ranks[y] ?? '';
    let x = 0;
    for (let i = 0; i < row.length; i += 1) {
      const ch = row[i] ?? '';
      if (ch >= '1' && ch <= '9') {
        x += Number(ch);
        continue;
      }
      let promoted = false;
      let glyph = ch;
      if (ch === '+') {
        promoted = true;
        i += 1;
        glyph = row[i] ?? '';
      }
      const type = SFEN_TO_TYPE[glyph.toUpperCase()];
      if (!type || x >= 9) throw new Error(`SFENの駒が不正です: ${row}`);
      const color = glyph === glyph.toUpperCase() ? 'sente' : 'gote';
      board[y * 9 + x] = makePiece(color, type, promoted);
      x += 1;
    }
    if (x !== 9) throw new Error(`SFENの筋数が不正です: ${row}`);
  }
  return board;
}

function parseHands(body: string): State['hands'] {
  const hands = emptyHands();
  if (body === '-') return hands;
  let i = 0;
  while (i < body.length) {
    let count = 0;
    while (i < body.length && (body[i] ?? '') >= '0' && (body[i] ?? '') <= '9') {
      count = count * 10 + Number(body[i]);
      i += 1;
    }
    if (count === 0) count = 1;
    const glyph = body[i] ?? '';
    i += 1;
    const type = SFEN_TO_TYPE[glyph.toUpperCase()];
    if (!type) throw new Error(`持ち駒が不正です: ${body}`);
    const color = glyph === glyph.toUpperCase() ? 'sente' : 'gote';
    hands[color][type] = count;
  }
  return hands;
}

function pieceToSfen(piece: Piece): string {
  const glyph = TYPE_TO_SFEN[piece.type];
  const cased = piece.color === 'sente' ? glyph : glyph.toLowerCase();
  return piece.promoted ? `+${cased}` : cased;
}

function handsToSfen(state: State): string {
  let out = '';
  for (const color of ['sente', 'gote'] as const) {
    for (const type of HAND_TYPES) {
      const count = state.hands[color][type];
      if (!count) continue;
      const glyph = TYPE_TO_SFEN[type as PieceType];
      const cased = color === 'sente' ? glyph : glyph.toLowerCase();
      out += `${count > 1 ? String(count) : ''}${cased}`;
    }
  }
  return out || '-';
}

export function cloneState(state: State): State {
  return {
    board: state.board.slice(),
    hands: copyHands(state.hands),
    turn: state.turn,
  };
}
