import { useState } from 'react';
import { levelLabel } from '../ai/search.ts';
import { gameStatus } from '../engine/game.ts';
import { formatMove, moverOf } from '../engine/notation.ts';
import { opposite } from '../engine/pieces.ts';
import { assertNever, type Color, type Status } from '../engine/types.ts';
import type { MatchConfig } from '../hooks/useMatch.ts';
import { useMatch } from '../hooks/useMatch.ts';
import { soundEnabled, setSoundEnabled } from '../audio.ts';
import { BoardView } from './BoardView.tsx';
import { Stand } from './Stand.tsx';
import { PromoFxSetting } from './PromoFxSetting.tsx';
import { Button } from './ui/button.tsx';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog.tsx';

interface GameScreenProps {
  config: MatchConfig;
  onLeave: () => void;
}

export function GameScreen({ config, onLeave }: GameScreenProps) {
  const match = useMatch(config);
  const [resignOpen, setResignOpen] = useState(false);
  const [sound, setSound] = useState(soundEnabled);
  const [copied, setCopied] = useState(false);
  const status = gameStatus(match.game);
  const flipped = match.viewer === 'gote';
  const names = playerNames(config);
  const lastMove = match.game.moves[match.game.moves.length - 1] ?? null;
  const room = config.mode === 'online' ? config.room : null;
  const shareUrl = room ? `${window.location.origin}${window.location.pathname}?room=${room}` : '';

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      const area = document.createElement('textarea');
      area.value = shareUrl;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <main className="game-screen">
      <header className="topbar">
        <Button variant="ghost" onClick={onLeave}>
          ホーム
        </Button>
        <div className="topbar-title">
          <strong>将棋</strong>
          <span>{modeLabel(config)}</span>
        </div>
        <Button
          variant="ghost"
          onClick={() => {
            const next = !sound;
            setSound(next);
            setSoundEnabled(next);
          }}
        >
          {sound ? '音あり' : '音なし'}
        </Button>
      </header>

      {room ? (
        <div className="room-bar">
          <span>
            部屋コード <b data-testid="room-code">{room}</b>
          </span>
          <Button variant="outline" size="sm" onClick={() => void copyLink()}>
            {copied ? 'コピーしました' : 'リンクをコピー'}
          </Button>
          <span data-testid="conn-status">{connectionLabel(match.link, match.presence, config)}</span>
        </div>
      ) : null}
      {match.error ? <p className="banner error">{match.error}</p> : null}
      {match.thinking ? <p className="banner">コンピュータが読んでいます…</p> : null}
      {config.mode === 'online' && match.presence === 'waiting' && match.link === 'online' ? (
        <p className="banner">相手の入室を待っています。リンクを共有してください。</p>
      ) : null}
      {config.mode === 'online' && match.presence === 'away' ? (
        <p className="banner">相手の接続が切れています。再接続を待っています。</p>
      ) : null}
      {config.mode === 'online' && match.link === 'connecting' ? <p className="banner">中継サーバーに接続しています…</p> : null}
      {config.mode === 'online' && match.link === 'offline' ? (
        <p className="banner error">通信が切れています。自動でつなぎ直します。</p>
      ) : null}

      <div className="table">
        <Stand
          state={match.game.state}
          color={flipped ? 'sente' : 'gote'}
          label={flipped ? names.sente : names.gote}
          active={match.game.state.turn === (flipped ? 'sente' : 'gote') && !match.game.result}
          selectable={match.controllable && match.game.state.turn === (flipped ? 'sente' : 'gote')}
          selected={match.selected?.kind === 'hand' ? match.selected.piece : null}
          onSelect={match.onHand}
        />
        <BoardView
          state={match.game.state}
          flipped={flipped}
          selected={match.selected?.kind === 'board' ? match.selected.square : null}
          targets={match.targets}
          lastMove={lastMove}
          inCheck={status.kind === 'check' || status.kind === 'checkmate'}
          fx={match.fx}
          interactive={match.controllable}
          onSquare={match.onSquare}
          onFxDone={match.clearFx}
        />
        <Stand
          state={match.game.state}
          color={flipped ? 'gote' : 'sente'}
          label={flipped ? names.gote : names.sente}
          active={match.game.state.turn === (flipped ? 'gote' : 'sente') && !match.game.result}
          selectable={match.controllable && match.game.state.turn === (flipped ? 'gote' : 'sente')}
          selected={match.selected?.kind === 'hand' ? match.selected.piece : null}
          onSelect={match.onHand}
        />
      </div>

      <footer className="game-foot">
        <p className="turn" data-testid="turn-status">
          {statusText(status, match.game.state.turn, match.viewer, config.mode === 'local')}
        </p>
        <div className="kifu" aria-label="棋譜">
          {match.game.moves.length === 0 ? <span>局面開始</span> : null}
          {match.game.moves.slice(-8).map((move, index, list) => {
            const ply = match.game.moves.length - list.length + index;
            return <span key={`${ply}-${move.to}`}>{formatMove(move, moverOf(ply))}</span>;
          })}
        </div>
        <PromoFxSetting compact />
        <div className="actions">
          {!match.game.result ? (
            <Button variant="outline" onClick={() => setResignOpen(true)} disabled={config.mode === 'online' && match.presence === 'waiting'}>
              投了
            </Button>
          ) : (
            <Button onClick={match.reset}>{config.mode === 'online' && config.role === 'guest' ? 'もう一局を頼む' : 'もう一局'}</Button>
          )}
        </div>
      </footer>

      <Dialog open={Boolean(match.pending)} onOpenChange={(open) => !open && match.cancelPromotion()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>成りますか</DialogTitle>
            <DialogDescription>敵陣に入った駒です。成ると動きが変わり、赤い文字になります。</DialogDescription>
          </DialogHeader>
          <div className="dialog-actions">
            <Button data-testid="promote-yes" size="lg" onClick={() => match.choosePromotion(true)}>
              成る
            </Button>
            <Button data-testid="promote-no" size="lg" variant="outline" onClick={() => match.choosePromotion(false)}>
              不成
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={resignOpen} onOpenChange={setResignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>投了しますか</DialogTitle>
            <DialogDescription>この対局はあなたの負けになります。</DialogDescription>
          </DialogHeader>
          <div className="dialog-actions">
            <Button
              variant="default"
              onClick={() => {
                setResignOpen(false);
                match.resign();
              }}
            >
              投了する
            </Button>
            <Button variant="outline" onClick={() => setResignOpen(false)}>
              まだ指す
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function playerNames(config: MatchConfig): { sente: string; gote: string } {
  switch (config.mode) {
    case 'local':
      return { sente: '先手', gote: '後手' };
    case 'ai':
      return {
        sente: config.human === 'sente' ? 'あなた' : 'コンピュータ',
        gote: config.human === 'gote' ? 'あなた' : 'コンピュータ',
      };
    case 'online':
      return config.role === 'host'
        ? { sente: 'あなた', gote: '相手' }
        : { sente: '相手', gote: 'あなた' };
    default:
      return assertNever(config);
  }
}

function modeLabel(config: MatchConfig): string {
  switch (config.mode) {
    case 'local':
      return '同じ画面';
    case 'ai':
      return `コンピュータ・${levelLabel(config.level)}`;
    case 'online':
      return config.role === 'host' ? 'オンライン・先手' : 'オンライン・後手';
    default:
      return assertNever(config);
  }
}

function connectionLabel(link: 'connecting' | 'online' | 'offline', presence: 'waiting' | 'live' | 'away', config: MatchConfig): string {
  if (config.mode !== 'online') return '';
  if (link === 'connecting') return '接続中';
  if (link === 'offline') return '再接続中';
  switch (presence) {
    case 'waiting':
      return '待機中';
    case 'live':
      return '対局中';
    case 'away':
      return '相手が離れました';
    default:
      return assertNever(presence);
  }
}

function statusText(status: Status, turn: Color, viewer: Color, local: boolean): string {
  const who = turn === 'sente' ? '先手番' : '後手番';
  const yours = local ? '' : turn === viewer ? '（あなたの番）' : '（相手の番）';
  switch (status.kind) {
    case 'playing':
      return `${who}${yours}`;
    case 'check':
      return `王手　${who}${yours}`;
    case 'checkmate':
      return `${sideName(status.winner)}の勝ち　詰み`;
    case 'nomove':
      return `${sideName(status.winner)}の勝ち　指せる手がありません`;
    case 'resign':
      return `${sideName(opposite(status.winner))}が投了しました`;
    case 'sennichite':
      return status.winner ? `連続王手の千日手　${sideName(status.winner)}の勝ち` : '千日手です';
    default:
      return assertNever(status);
  }
}

function sideName(color: Color): string {
  return color === 'sente' ? '先手' : '後手';
}
