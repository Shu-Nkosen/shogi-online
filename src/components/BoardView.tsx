import { useEffect, useMemo, useRef, useState } from 'react';
import { playPromote, playWood } from '../audio.ts';
import { findKing } from '../engine/attack.ts';
import { formatSquare } from '../engine/notation.ts';
import { fileOf, pieceChar, rankOf } from '../engine/pieces.ts';
import type { Color, Move, State } from '../engine/types.ts';
import { cn } from '../lib/utils.ts';
import { Koma, SsjAura } from './Koma.tsx';
import { PromotionFx } from './PromotionFx.tsx';
import { PromotionCinematic } from './PromotionCinematic.tsx';
import { loadPromoFxChoice, prefersReducedMotion, resolvePlayback } from '../fx/settings.ts';

const FILE_LABELS = ['１', '２', '３', '４', '５', '６', '７', '８', '９'];
const RANK_LABELS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

interface BoardViewProps {
  state: State;
  flipped: boolean;
  selected: number | null;
  targets: Map<number, 'move' | 'capture'>;
  lastMove: Move | null;
  inCheck: boolean;
  fx: { id: number; move: Move } | null;
  interactive: boolean;
  onSquare: (square: number) => void;
  onFxDone: () => void;
  /** 目標マス（チュートリアル用の金色リング） */
  marks?: ReadonlySet<number>;
  /** 行けない・打てないマス（×印） */
  ng?: ReadonlySet<number>;
}

export function BoardView({
  state,
  flipped,
  selected,
  targets,
  lastMove,
  inCheck,
  fx,
  interactive,
  onSquare,
  onFxDone,
  marks,
  ng,
}: BoardViewProps) {
  const [phase, setPhase] = useState<'slide' | 'flip' | null>(null);
  const [slideAtEnd, setSlideAtEnd] = useState(false);
  const done = useRef(false);
  const onDoneRef = useRef(onFxDone);
  onDoneRef.current = onFxDone;
  const boardRef = useRef<HTMLDivElement>(null);
  const playback = useMemo(() => resolvePlayback(loadPromoFxChoice(), prefersReducedMotion()), [fx?.id]);
  const cinematic = playback.kind === 'cinematic';
  const king = inCheck ? findKing(state.board, state.turn) : -1;
  const files = flipped ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : [9, 8, 7, 6, 5, 4, 3, 2, 1];
  const ranks = flipped ? [9, 8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8, 9];

  useEffect(() => {
    if (!fx || fx.move.from === null) {
      setPhase(null);
      return undefined;
    }
    done.current = false;
    setSlideAtEnd(false);
    setPhase('slide');
    playWood();
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => setSlideAtEnd(true));
    });
    const nudge = window.setTimeout(() => {
      if (done.current || !fx.move.promote) return;
      setPhase((current) => (current === 'slide' ? 'flip' : current));
    }, 420);
    const debugFx = new URLSearchParams(window.location.search).has('fxdebug');
    const promoMs = debugFx ? 600_000 : playback.kind === 'cinematic' ? playback.duration * 1000 + 2500 : 3600;
    const backup = window.setTimeout(() => finish(), fx.move.promote ? promoMs : 560);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(nudge);
      window.clearTimeout(backup);
    };
  }, [fx]);

  function finish() {
    if (done.current) return;
    done.current = true;
    setPhase(null);
    onDoneRef.current();
  }

  function beginFlip() {
    if (!fx?.move.promote) {
      finish();
      return;
    }
    setPhase('flip');
  }

  useEffect(() => {
    if (phase === 'flip' && !cinematic) playPromote();
  }, [phase, fx?.id]);

  const mover: Color = state.turn === 'sente' ? 'gote' : 'sente';
  const invertMover = flipped ? mover === 'sente' : mover === 'gote';
  const glow = fx && phase === 'flip' && !cinematic ? anchorOf(fx.move.to, flipped) : null;

  return (
    <div
      className={cn('board-frame', phase === 'flip' && !cinematic && 'is-promoting')}
      data-fx={phase ?? ''}
      style={glow ? { ['--glow-x' as string]: glow.left, ['--glow-y' as string]: glow.top } : undefined}
    >
      <div className="file-labels">
        {files.map((file) => (
          <span key={file}>{FILE_LABELS[file - 1]}</span>
        ))}
      </div>
      <div className="board-row">
        <div className="board" data-testid="board" ref={boardRef}>
          {state.board.map((piece, index) => {
            const place = cellOf(index, flipped);
            const hint = targets.get(index);
            const star = (fileOf(index) === 3 || fileOf(index) === 7) && (rankOf(index) === 3 || rankOf(index) === 7);
            const covered = Boolean(fx && phase && fx.move.to === index);
            const upsideDown = piece ? (flipped ? piece.color === 'sente' : piece.color === 'gote') : false;
            return (
              <button
                key={index}
                type="button"
                className={cn(
                  'square',
                  lastMove && (lastMove.from === index || lastMove.to === index) && 'is-last',
                  selected === index && 'is-selected',
                  king === index && 'is-check',
                  hint && 'is-target',
                  marks?.has(index) && 'is-mark',
                )}
                style={{ gridColumn: place.col + 1, gridRow: place.row + 1 }}
                data-testid={`square-${index}`}
                data-piece={piece ? `${piece.color}-${piece.type}${piece.promoted ? '+' : ''}` : ''}
                aria-label={piece ? `${formatSquare(index)} ${pieceChar(piece.type, piece.promoted, piece.color)}` : formatSquare(index)}
                onClick={() => onSquare(index)}
                disabled={!interactive}
              >
                {star ? <i className="star" /> : null}
                {marks?.has(index) ? <i className="mark" /> : null}
                {ng?.has(index) && !piece ? <i className="ng-mark" aria-hidden="true" /> : null}
                {hint ? <i className={hint === 'capture' ? 'hint capture' : 'hint'} /> : null}
                {piece && !covered ? (
                  <span className={cn('piece-slot', upsideDown && 'is-inverted')}>
                    {piece.promoted ? <SsjAura seed={index} /> : null}
                    <Koma type={piece.type} color={piece.color} promoted={piece.promoted} selected={selected === index} />
                  </span>
                ) : null}
              </button>
            );
          })}
          {fx && phase === 'slide' && fx.move.from !== null ? (
            <div
              className={cn('mover', slideAtEnd && 'at-end', invertMover && 'is-inverted')}
              style={{
                ['--from-x' as string]: anchorOf(fx.move.from, flipped).left,
                ['--from-y' as string]: anchorOf(fx.move.from, flipped).top,
                ['--to-x' as string]: anchorOf(fx.move.to, flipped).left,
                ['--to-y' as string]: anchorOf(fx.move.to, flipped).top,
              }}
              onTransitionEnd={(event) => {
                if (event.propertyName === 'left') beginFlip();
              }}
            >
              <Koma type={fx.move.piece} color={mover} promoted={fx.move.alreadyPromoted} />
            </div>
          ) : null}
          {fx && phase === 'flip' && playback.kind === 'cinematic' ? (
            <PromotionCinematic
              key={fx.id}
              move={fx.move}
              color={mover}
              invert={invertMover}
              square={boardRef.current?.querySelector<HTMLElement>(`[data-testid="square-${fx.move.to}"]`) ?? null}
              duration={playback.duration}
              calm={playback.calm}
              onDone={finish}
            />
          ) : null}
          {fx && phase === 'flip' && !cinematic ? (
            <div className="fx-layer" style={{ left: anchorOf(fx.move.to, flipped).left, top: anchorOf(fx.move.to, flipped).top }}>
              <PromotionFx move={fx.move} color={mover} invert={invertMover} onDone={finish} />
            </div>
          ) : null}
        </div>
        <div className="rank-labels">
          {ranks.map((rank) => (
            <span key={rank}>{RANK_LABELS[rank - 1]}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function cellOf(square: number, flipped: boolean): { col: number; row: number } {
  const x = square % 9;
  const y = (square / 9) | 0;
  return flipped ? { col: 8 - x, row: 8 - y } : { col: x, row: y };
}

function anchorOf(square: number, flipped: boolean): { left: string; top: string } {
  const place = cellOf(square, flipped);
  return { left: `${((place.col + 0.5) / 9) * 100}%`, top: `${((place.row + 0.5) / 9) * 100}%` };
}
