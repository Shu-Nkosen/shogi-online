import { useState } from 'react';
import type { Level } from '../ai/search.ts';
import { levelLabel } from '../ai/search.ts';
import type { Color } from '../engine/types.ts';
import { Button } from './ui/button.tsx';
import { Input } from './ui/input.tsx';

interface HomeScreenProps {
  initialCode?: string;
  error?: string | null;
  onLocal: () => void;
  onAi: (level: Level, human: Color) => void;
  onCreate: () => void;
  onJoin: (code: string) => void;
}

export function HomeScreen({ initialCode = '', error, onLocal, onAi, onCreate, onJoin }: HomeScreenProps) {
  const [level, setLevel] = useState<Level>('normal');
  const [human, setHuman] = useState<Color>('sente');
  const [code, setCode] = useState(initialCode);
  const [codeError, setCodeError] = useState<string | null>(null);

  function join() {
    const room = code.trim().toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{4,8}$/.test(room)) {
      setCodeError('部屋コードは英数字4〜8文字です');
      return;
    }
    setCodeError(null);
    onJoin(room);
  }

  return (
    <main className="home">
      <div className="home-hero">
        <p className="eyebrow">持ち駒・成り・詰みまで</p>
        <h1>将棋</h1>
        <p className="lead">木目の盤で、ブラウザだけで一局。相手は隣の人でも、別の端末でも、コンピュータでも。</p>
      </div>
      {error ? <p className="banner error">{error}</p> : null}
      <div className="home-grid">
        <section className="plaque">
          <h2>オンライン対局</h2>
          <p>部屋を作ってリンクを渡すと、離れた相手とリアルタイムで指せます。利用料はかかりません。</p>
          <Button variant="gold" size="lg" onClick={onCreate}>
            部屋を作る
          </Button>
          <div className="join-row">
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="部屋コード"
              aria-label="部屋コード"
              maxLength={8}
              onKeyDown={(event) => {
                if (event.key === 'Enter') join();
              }}
            />
            <Button variant="outline" onClick={join}>
              入室する
            </Button>
          </div>
          {codeError ? <p className="form-error">{codeError}</p> : null}
        </section>
        <section className="plaque">
          <h2>コンピュータ対戦</h2>
          <p>読みはすべてこのブラウザの中で行います。強さを選んで、すぐに始められます。</p>
          <div className="choice-row" role="radiogroup" aria-label="強さ">
            {(['easy', 'normal', 'hard'] as const).map((item) => (
              <button key={item} type="button" className={level === item ? 'choice is-on' : 'choice'} onClick={() => setLevel(item)}>
                {levelLabel(item)}
              </button>
            ))}
          </div>
          <div className="choice-row" role="radiogroup" aria-label="手番">
            <button type="button" className={human === 'sente' ? 'choice is-on' : 'choice'} onClick={() => setHuman('sente')}>
              先手
            </button>
            <button type="button" className={human === 'gote' ? 'choice is-on' : 'choice'} onClick={() => setHuman('gote')}>
              後手
            </button>
          </div>
          <Button size="lg" onClick={() => onAi(level, human)}>
            対局を始める
          </Button>
        </section>
        <section className="plaque">
          <h2>同じ画面で対局</h2>
          <p>一台の端末を、先手と後手で交互に操作します。盤は先手側を下にして置きます。</p>
          <Button variant="outline" size="lg" onClick={onLocal}>
            交互に指す
          </Button>
        </section>
      </div>
    </main>
  );
}
