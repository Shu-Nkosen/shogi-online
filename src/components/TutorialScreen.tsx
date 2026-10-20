import { useEffect, useMemo, useRef, useState } from 'react';
import { createGame, playMove, type PlayedGame } from '../engine/game.ts';
import { isCheck, legalMoves } from '../engine/moves.ts';
import { formatMove } from '../engine/notation.ts';
import type { Move, PieceType } from '../engine/types.ts';
import { cn } from '../lib/utils.ts';
import { goalMet, LESSONS, lessonById, markSquares, toIndex, type Lesson, type Step } from '../tutorial/lessons.ts';
import { loadDone, resetDone, saveDone } from '../tutorial/progress.ts';
import { BoardView } from './BoardView.tsx';
import { Koma } from './Koma.tsx';
import { MoveDiagram } from './MoveDiagram.tsx';
import { Stand } from './Stand.tsx';
import { Button } from './ui/button.tsx';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog.tsx';

interface TutorialScreenProps {
  lessonId: string | null;
  onOpen: (lessonId: string | null) => void;
  onHome: () => void;
  onPlayCpu: () => void;
}

export function TutorialScreen({ lessonId, onOpen, onHome, onPlayCpu }: TutorialScreenProps) {
  const [done, setDone] = useState<Set<string>>(() => loadDone());
  const lesson = lessonId ? lessonById(lessonId) : undefined;

  function complete(id: string) {
    setDone((current) => {
      if (current.has(id)) return current;
      const next = new Set(current);
      next.add(id);
      saveDone(next);
      return next;
    });
  }

  if (!lesson) {
    return (
      <LessonList
        done={done}
        onOpen={onOpen}
        onHome={onHome}
        onReset={() => {
          resetDone();
          setDone(new Set());
        }}
      />
    );
  }
  const index = LESSONS.indexOf(lesson);
  const nextLesson = LESSONS[index + 1] ?? null;
  return (
    <LessonPlayer
      key={lesson.id}
      lesson={lesson}
      number={index + 1}
      nextLesson={nextLesson}
      onComplete={() => complete(lesson.id)}
      onList={() => onOpen(null)}
      onNext={() => onOpen(nextLesson ? nextLesson.id : null)}
      onPlayCpu={() => {
        complete(lesson.id);
        onPlayCpu();
      }}
    />
  );
}

function LessonList({
  done,
  onOpen,
  onHome,
  onReset,
}: {
  done: ReadonlySet<string>;
  onOpen: (id: string) => void;
  onHome: () => void;
  onReset: () => void;
}) {
  const count = LESSONS.filter((lesson) => done.has(lesson.id)).length;
  const resume = LESSONS.find((lesson) => !done.has(lesson.id)) ?? null;
  return (
    <main className="tutorial">
      <header className="topbar">
        <Button variant="ghost" onClick={onHome}>
          ← ホーム
        </Button>
        <div className="topbar-title">
          <strong>はじめての将棋</strong>
          <span>ルールを1つずつ、盤で覚えよう</span>
        </div>
        <span className="topbar-spacer" />
      </header>
      <section className="tut-hero">
        <div className="tut-progress" aria-label={`${LESSONS.length}レッスン中 ${count} 完了`}>
          <div className="tut-progress-bar">
            <span style={{ width: `${(count / LESSONS.length) * 100}%` }} />
          </div>
          <p>
            <b>{count}</b> / {LESSONS.length} レッスン完了
          </p>
        </div>
        {resume ? (
          <Button variant="gold" size="lg" onClick={() => onOpen(resume.id)} data-testid="tut-resume">
            {count === 0 ? 'さっそく始める' : `続きから：${resume.title}`}
          </Button>
        ) : (
          <p className="tut-allclear">全レッスンクリア！おめでとうございます 🎉</p>
        )}
      </section>
      <ol className="lesson-list">
        {LESSONS.map((lesson, index) => {
          const cleared = done.has(lesson.id);
          return (
            <li key={lesson.id}>
              <button
                type="button"
                className={cn('lesson-card', cleared && 'is-done', resume?.id === lesson.id && 'is-next')}
                onClick={() => onOpen(lesson.id)}
                data-testid={`lesson-${lesson.id}`}
              >
                <span className="lesson-no">{index + 1}</span>
                <span className="lesson-glyph" aria-hidden="true">
                  {lesson.glyph}
                </span>
                <span className="lesson-text">
                  <strong>{lesson.title}</strong>
                  <small>{lesson.short}</small>
                </span>
                <span className="lesson-state" aria-label={cleared ? '完了' : '未完了'}>
                  {cleared ? '✓' : ''}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {count > 0 ? (
        <p className="tut-reset">
          <button type="button" onClick={onReset}>
            進み具合をリセット
          </button>
        </p>
      ) : null}
    </main>
  );
}

type Selection = { kind: 'board'; square: number } | { kind: 'hand'; piece: PieceType } | null;
type Phase = 'play' | 'moving' | 'wrong' | 'success';
type Feedback = { tone: 'hint' | 'wrong' | 'good'; text: string } | null;

function initialSelection(step: Step): Selection {
  if (!step.select) return null;
  return typeof step.select === 'string' ? { kind: 'hand', piece: step.select } : { kind: 'board', square: toIndex(step.select) };
}

function LessonPlayer({
  lesson,
  number,
  nextLesson,
  onComplete,
  onList,
  onNext,
  onPlayCpu,
}: {
  lesson: Lesson;
  number: number;
  nextLesson: Lesson | null;
  onComplete: () => void;
  onList: () => void;
  onNext: () => void;
  onPlayCpu: () => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = lesson.steps[stepIndex] ?? lesson.steps[0]!;
  const [game, setGame] = useState<PlayedGame>(() => createGame(step.sfen));
  const [selected, setSelected] = useState<Selection>(() => initialSelection(step));
  const [pending, setPending] = useState<Move[] | null>(null);
  const [fx, setFx] = useState<{ id: number; move: Move } | null>(null);
  const [phase, setPhase] = useState<Phase>(step.goal.kind === 'read' ? 'success' : 'play');
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [lastMove, setLastMove] = useState<Move | null>(null);
  const outcome = useRef<{ ok: boolean; move: Move; next: PlayedGame } | null>(null);
  const fxId = useRef(0);
  const isLast = stepIndex === lesson.steps.length - 1;
  const lessonDone = phase === 'success' && isLast;

  function loadStep(index: number) {
    const target = lesson.steps[index];
    if (!target) return;
    setStepIndex(index);
    setGame(createGame(target.sfen));
    setSelected(initialSelection(target));
    setPending(null);
    setFx(null);
    setFeedback(null);
    setShowAnswer(false);
    setLastMove(null);
    outcome.current = null;
    setPhase(target.goal.kind === 'read' ? 'success' : 'play');
  }

  useEffect(() => {
    if (lessonDone) onComplete();
  }, [lessonDone]);

  useEffect(() => {
    if (phase !== 'wrong') return undefined;
    const timer = window.setTimeout(() => retry(), 2600);
    return () => window.clearTimeout(timer);
  }, [phase, stepIndex]);

  function retry() {
    setGame(createGame(step.sfen));
    setSelected(initialSelection(step));
    setPending(null);
    setFx(null);
    setLastMove(null);
    outcome.current = null;
    setPhase('play');
  }

  function resolve() {
    const result = outcome.current;
    if (!result) return;
    outcome.current = null;
    if (result.ok) {
      setPhase('success');
      setFeedback({ tone: 'good', text: step.success });
    } else {
      setPhase('wrong');
      setFeedback({ tone: 'wrong', text: wrongMessage(step, result.move, result.next) });
    }
  }

  function commit(move: Move) {
    const next = playMove(game, move);
    if (!next) return;
    const played = next.moves[next.moves.length - 1] ?? move;
    outcome.current = { ok: goalMet(step.goal, game.state, played, next), move: played, next };
    setGame(next);
    setSelected(null);
    setPending(null);
    setLastMove(played);
    if (played.from !== null) {
      fxId.current += 1;
      setFx({ id: fxId.current, move: played });
      setPhase('moving');
    } else {
      resolve();
    }
  }

  function onSquare(square: number) {
    if (phase !== 'play' || pending) return;
    const state = game.state;
    if (step.goal.kind === 'tap') {
      if (square === toIndex(step.goal.square)) {
        setPhase('success');
        setLastMove({ from: null, to: square, piece: 'king', promote: false, capture: null, capturedPromoted: false, alreadyPromoted: false });
        setFeedback({ tone: 'good', text: step.success });
      } else {
        setFeedback({ tone: 'wrong', text: `そこではありません。${step.hint}` });
      }
      return;
    }
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
      const drop = legalMoves(state).find((move) => move.from === null && move.piece === selected.piece && move.to === square);
      if (drop) {
        commit(drop);
        return;
      }
    }
    const piece = state.board[square];
    if (piece && piece.color === state.turn) {
      setSelected({ kind: 'board', square });
      return;
    }
    if (selected && piece) setFeedback({ tone: 'hint', text: 'その駒は相手の駒です。点や赤い丸が出ているマスに動かせます。' });
    else if (selected) setFeedback({ tone: 'hint', text: 'そこには動かせません。緑の点が出ているマスを選びましょう。' });
    setSelected(null);
  }

  function onHand(piece: PieceType) {
    if (phase !== 'play' || game.state.turn !== 'sente') return;
    setSelected(selected?.kind === 'hand' && selected.piece === piece ? null : { kind: 'hand', piece });
  }

  function showHint() {
    setFeedback({ tone: 'hint', text: step.hint });
    if (step.answer) setShowAnswer(true);
    if (phase === 'play' && !selected) setSelected(initialSelection(step));
  }

  const targets = useMemo(() => {
    const map = new Map<number, 'move' | 'capture'>();
    if (!selected || phase !== 'play' || step.goal.kind === 'tap') return map;
    for (const move of legalMoves(game.state)) {
      const hit = selected.kind === 'board' ? move.from === selected.square : move.from === null && move.piece === selected.piece;
      if (!hit) continue;
      map.set(move.to, move.capture ? 'capture' : (map.get(move.to) ?? 'move'));
    }
    return map;
  }, [game, selected, phase, step]);

  const marks = useMemo(() => {
    const set = new Set(markSquares(step));
    if (showAnswer && step.answer) set.add(toIndex(step.answer));
    return set;
  }, [step, showAnswer]);
  const ng = useMemo(() => new Set((step.ng ?? []).map(toIndex)), [step]);
  const inCheck = isCheck(game.state, game.state.turn);
  const mated = game.result?.kind === 'checkmate';
  const interactive = phase === 'play' && !pending;
  const showStamp = phase === 'success' && step.goal.kind !== 'read' && step.goal.kind !== 'tap';

  return (
    <main className="tutorial lesson">
      <header className="topbar">
        <Button variant="ghost" onClick={onList} data-testid="tut-back">
          ← 一覧
        </Button>
        <div className="topbar-title">
          <strong>
            {number}. {lesson.title}
          </strong>
          <span>はじめての将棋</span>
        </div>
        <span className="topbar-spacer" />
      </header>

      <div className="lesson-layout">
        <section className="lesson-panel">
          <p className="lesson-intro">{lesson.intro}</p>
          {lesson.diagram && stepIndex === 0 ? (
            <div className="diagram-row">
              {lesson.diagram.map((item) => (
                <MoveDiagram key={item.label} type={item.type} promoted={item.promoted} label={item.label} />
              ))}
            </div>
          ) : null}
          {lesson.diagram && stepIndex === 0 ? (
            <p className="diagram-legend">
              <span className="lg-step" />1マス <span className="lg-ray" />何マスでも <span className="lg-jump" />ジャンプ
            </p>
          ) : null}

          {lesson.steps.length > 1 ? (
            <ol className="step-dots" aria-label="ステップ">
              {lesson.steps.map((_, index) => (
                <li
                  key={index}
                  className={cn(index < stepIndex && 'is-done', index === stepIndex && 'is-now', index === stepIndex && phase === 'success' && 'is-done')}
                >
                  {index + 1}
                </li>
              ))}
            </ol>
          ) : null}

          <div className="task-card" data-testid="tut-task">
            <span className="task-label">{lesson.finale ? 'さいごに' : step.goal.kind === 'mate' ? '詰将棋' : 'やってみよう'}</span>
            <p className="task-text">{step.task}</p>
            {step.note ? <p className="task-note">{step.note}</p> : null}
          </div>

          {feedback ? (
            <p className={cn('feedback', `is-${feedback.tone}`)} data-testid="tut-feedback" role="status">
              {feedback.tone === 'good' ? '◎ ' : feedback.tone === 'wrong' ? '△ ' : '💡 '}
              {feedback.text}
            </p>
          ) : null}

          <div className="lesson-actions">
            {lesson.finale ? (
              <>
                <Button variant="gold" size="lg" onClick={onPlayCpu} data-testid="tut-play-cpu">
                  易しいコンピュータと対局する
                </Button>
                <Button variant="outline" onClick={onList}>
                  レッスン一覧へ
                </Button>
              </>
            ) : phase === 'success' ? (
              isLast ? (
                <>
                  <Button variant="gold" size="lg" onClick={onNext} data-testid="tut-next-lesson">
                    {nextLesson ? `次のレッスン：${nextLesson.title}` : '一覧へ戻る'}
                  </Button>
                  <Button variant="outline" onClick={() => loadStep(0)}>
                    もう一度
                  </Button>
                </>
              ) : (
                <Button variant="gold" size="lg" onClick={() => loadStep(stepIndex + 1)} data-testid="tut-next">
                  次へ →
                </Button>
              )
            ) : (
              <>
                <Button variant="outline" onClick={showHint} disabled={phase === 'moving'} data-testid="tut-hint">
                  ヒント
                </Button>
                <Button variant="outline" onClick={retry} disabled={phase === 'moving'} data-testid="tut-retry">
                  やり直す
                </Button>
              </>
            )}
          </div>
          {lessonDone && !lesson.finale ? <p className="lesson-clear">レッスン完了！ ✓ 進み具合を保存しました</p> : null}
        </section>

        <section className="lesson-board" data-phase={phase}>
          <Stand
            state={game.state}
            color="gote"
            label="相手"
            active={false}
            selectable={false}
            selected={null}
            onSelect={() => undefined}
          />
          <div className="lesson-board-wrap">
            <BoardView
              state={game.state}
              flipped={false}
              selected={selected?.kind === 'board' ? selected.square : null}
              targets={targets}
              lastMove={lastMove}
              inCheck={inCheck}
              fx={fx}
              interactive={interactive}
              onSquare={onSquare}
              onFxDone={() => {
                setFx(null);
                resolve();
              }}
              marks={phase === 'success' ? undefined : marks}
              ng={phase === 'play' ? ng : undefined}
            />
            {showStamp ? (
              <div className={cn('stamp', mated && 'is-mate')} aria-hidden="true">
                <span>{mated ? '詰み' : '正解'}</span>
              </div>
            ) : null}
          </div>
          <Stand
            state={game.state}
            color="sente"
            label="あなた"
            active={phase === 'play'}
            selectable={phase === 'play' && game.state.turn === 'sente'}
            selected={selected?.kind === 'hand' ? selected.piece : null}
            onSelect={onHand}
          />
        </section>
      </div>

      <Dialog open={Boolean(pending)} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>成りますか</DialogTitle>
            <DialogDescription>敵陣に入った駒は、裏返して強くできます。</DialogDescription>
          </DialogHeader>
          {pending?.[0] ? (
            <div className="promo-preview" aria-hidden="true">
              <Koma type={pending[0].piece} color="sente" promoted={false} />
              <span>→</span>
              <Koma type={pending[0].piece} color="sente" promoted />
            </div>
          ) : null}
          <div className="dialog-actions">
            <Button data-testid="promote-yes" size="lg" onClick={() => choose(true)}>
              成る
            </Button>
            <Button data-testid="promote-no" size="lg" variant="outline" onClick={() => choose(false)}>
              不成
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );

  function choose(promote: boolean) {
    const move = pending?.find((item) => item.promote === promote);
    setPending(null);
    if (move) commit(move);
  }
}

function wrongMessage(step: Step, move: Move, next: PlayedGame): string {
  const goal = step.goal;
  const checked = next.deliveredCheck[next.deliveredCheck.length - 1] ?? false;
  switch (goal.kind) {
    case 'move':
      if (goal.promote === true && move.to === toIndex(goal.to) && !move.promote) return '今回は「成る」を選んでみよう。もう一度どうぞ。';
      if (goal.capture && move.to !== toIndex(goal.to) && move.capture) return `それも取れますが…${step.hint}`;
      return `おしい！${step.hint}`;
    case 'check':
      return `王手になっていません。${step.hint}`;
    case 'mate': {
      if (!checked) return `王手になっていません。詰ませるには、まず王手です。${step.hint}`;
      const escape = legalMoves(next.state)[0];
      const example = escape ? `（たとえば ${formatMove(escape, 'gote')} と逃げられます）` : '';
      return `王手ですが、相手はまだ逃げられます${example}。ヒントも見てみよう。`;
    }
    case 'escape': {
      const label = { king: '玉が逃げる', capture: '王手の駒を取る', 'block-move': '盤の駒で合い駒', 'block-drop': '持ち駒で合い駒' }[goal.how];
      return `それも王手を防ぐ正しい手です！でも今回は「${label}」で防いでみよう。`;
    }
    default:
      return step.hint;
  }
}
