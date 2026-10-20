import type { PlayedGame } from '../engine/game.ts';
import { sq } from '../engine/pieces.ts';
import type { Move, PieceType, State } from '../engine/types.ts';

/** [筋, 段] e.g. [7, 6] = ７六 */
export type Sq = readonly [file: number, rank: number];

export type Goal =
  | { kind: 'read' }
  | { kind: 'tap'; square: Sq }
  | { kind: 'move'; to: Sq; from?: Sq; drop?: PieceType; promote?: boolean; capture?: boolean; mate?: boolean }
  | { kind: 'check' }
  | { kind: 'mate' }
  | { kind: 'escape'; how: 'king' | 'capture' | 'block-move' | 'block-drop' };

export interface Step {
  sfen: string;
  /** やること（短い指示文） */
  task: string;
  /** 補足説明（任意） */
  note?: string;
  goal: Goal;
  hint: string;
  success: string;
  /** 目標マス（金色のリング）。未指定なら goal.to を使う */
  marks?: Sq[];
  /** 打てない・行けないマス（×印） */
  ng?: Sq[];
  /** 最初から選んでおく駒（盤上のマス or 持ち駒） */
  select?: Sq | PieceType;
  /** ヒントボタンで見せる答えのマス（詰将棋用） */
  answer?: Sq;
  /** テスト用：この局面で反則になる手 */
  illegal?: { drop: PieceType; to: Sq }[];
}

export interface Lesson {
  id: string;
  title: string;
  short: string;
  /** 一覧に出す駒の字 */
  glyph: string;
  intro: string;
  diagram?: { type: PieceType; promoted?: boolean; label: string }[];
  steps: Step[];
  finale?: boolean;
}

const K = '4K4';

export const LESSONS: Lesson[] = [
  {
    id: 'goal',
    title: '将棋ってどんなゲーム？',
    short: '勝ち方と盤の見方',
    glyph: '玉',
    intro:
      '将棋は2人が交互に1手ずつ指すゲームです。相手の「玉（王）」を、どうやっても逃げられない状態にしたら勝ち。これを「詰み」といいます。',
    steps: [
      {
        sfen: 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1',
        task: 'あなたの「玉」をタップしてみよう。',
        note: 'あなたは盤の下側（先手）です。駒の先がとがっている方が前。',
        goal: { kind: 'tap', square: [5, 9] },
        hint: 'いちばん下の段の、真ん中にある「玉」です。',
        success: 'それがあなたの玉。取られないように守りながら、相手の玉をねらいます。',
      },
      {
        sfen: 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1',
        task: '相手の「王」をタップしてみよう。',
        note: '上下が逆さまの駒が相手の駒です。',
        goal: { kind: 'tap', square: [5, 1] },
        hint: 'いちばん上の段の真ん中、逆さまの「王」です。',
        success: 'これがねらう相手の王。王と玉は同じ駒で、呼び方がちがうだけです。',
      },
      {
        sfen: 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1',
        task: '光っているマス「７六」をタップしてみよう。',
        note: 'マスは「筋（右から１〜９）」と「段（上から一〜九）」で呼びます。７筋の六段目で「７六」。盤の上と右の数字が目印です。',
        goal: { kind: 'tap', square: [7, 6] },
        marks: [[7, 6]],
        hint: '盤の上の「７」の列と、右の「六」の行が交わるマスです。',
        success: 'ばっちり！「▲７六歩」のように、マスの名前と駒で指し手を表します。',
      },
    ],
  },
  {
    id: 'fu',
    title: '歩（ふ）',
    short: '前に1マス',
    glyph: '歩',
    intro: '歩は前に1マスだけ進めます。数はいちばん多く、力は弱いけれど、成ると「と金」に大変身します。',
    diagram: [{ type: 'pawn', label: '歩' }],
    steps: [
      {
        sfen: `4k4/9/9/9/9/9/4P4/9/${K} b - 1`,
        task: '歩を１マス進めて、光っているマスへ。',
        goal: { kind: 'move', from: [5, 7], to: [5, 6] },
        select: [5, 7],
        hint: '歩は真っすぐ前に1マスだけ。緑の点のマスをタップします。',
        success: 'その調子！歩は後ろや横には動けません。',
      },
      {
        sfen: `4k4/9/9/9/9/4p4/4P4/9/${K} b - 1`,
        task: '目の前の相手の歩を取ってみよう。',
        note: '動ける先に相手の駒があれば、そこへ動いて取れます。',
        goal: { kind: 'move', from: [5, 7], to: [5, 6], capture: true },
        select: [5, 7],
        hint: '歩が進めるマス（前1マス）に相手の歩がいます。そこをタップ。',
        success: '取れました！取った駒は下の駒台に入り、「持ち駒」になります。',
      },
    ],
  },
  {
    id: 'kyo',
    title: '香車（きょうしゃ）',
    short: '前にどこまでも',
    glyph: '香',
    intro: '香車は真っすぐ前に、何マスでも進めます。ただし後ろや横には動けない、一方通行の駒です。',
    diagram: [{ type: 'lance', label: '香' }],
    steps: [
      {
        sfen: `4k4/9/9/9/9/9/9/9/L3K4 b - 1`,
        task: '香車を一気に「９四」まで進めよう。',
        goal: { kind: 'move', from: [9, 9], to: [9, 4] },
        select: [9, 9],
        hint: '９九の香車を選ぶと、前に点が並びます。光っているマスへ。',
        success: '一気に5マス！途中に駒があると、そこで止まります。',
      },
    ],
  },
  {
    id: 'kei',
    title: '桂馬（けいま）',
    short: '駒を飛びこえるジャンプ',
    glyph: '桂',
    intro: '桂馬は「2つ前の、ななめ左右」にジャンプします。間に駒があっても飛びこえられる、ただ1つの駒です。',
    diagram: [{ type: 'knight', label: '桂' }],
    steps: [
      {
        sfen: `4k4/9/9/9/9/9/9/1P7/1N2K4 b - 1`,
        task: '目の前の歩を飛びこえて「７七」へ跳ねよう。',
        goal: { kind: 'move', from: [8, 9], to: [7, 7] },
        select: [8, 9],
        hint: '８九の桂馬は、７七か９七に跳べます。光っている７七へ。',
        success: 'ぴょん！前にしか跳べないので、跳ぶ先はよく考えて。',
      },
    ],
  },
  {
    id: 'gin',
    title: '銀（ぎん）',
    short: '前とななめ後ろ',
    glyph: '銀',
    intro: '銀は「前の3方向」と「ななめ後ろ2方向」の5方向に1マス。真横と真後ろには動けません。',
    diagram: [{ type: 'silver', label: '銀' }],
    steps: [
      {
        sfen: `4k4/9/9/9/4S4/9/9/9/${K} b - 1`,
        task: '銀をななめ後ろの「６六」へ下げてみよう。',
        goal: { kind: 'move', from: [5, 5], to: [6, 6] },
        select: [5, 5],
        hint: '銀は真後ろには行けませんが、ななめ後ろなら行けます。',
        success: 'いいですね！攻めて、さっと引けるのが銀の持ち味です。',
      },
    ],
  },
  {
    id: 'kin',
    title: '金（きん）',
    short: '守りのかなめ',
    glyph: '金',
    intro: '金は「前の3方向・横・真後ろ」の6方向に1マス。ななめ後ろには動けません。玉を守るのが得意です。',
    diagram: [{ type: 'gold', label: '金' }],
    steps: [
      {
        sfen: `4k4/9/9/9/4G4/9/9/9/${K} b - 1`,
        task: '金を真横の「４五」へ動かそう。',
        goal: { kind: 'move', from: [5, 5], to: [4, 5] },
        select: [5, 5],
        hint: '銀とちがって、金は横に動けます。',
        success: 'そのとおり！金は成れません。最初から強い駒です。',
      },
    ],
  },
  {
    id: 'kaku',
    title: '角（かく）',
    short: 'ななめにどこまでも',
    glyph: '角',
    intro: '角はななめに何マスでも進めます。遠くからねらえる強い駒です。途中に駒があるとそこで止まります。',
    diagram: [{ type: 'bishop', label: '角' }],
    steps: [
      {
        sfen: `4k4/9/9/9/9/9/9/1B7/${K} b - 1`,
        task: '角をななめに「４四」まで動かそう。',
        goal: { kind: 'move', from: [8, 8], to: [4, 4] },
        select: [8, 8],
        hint: '８八から右上へ、ななめの線をたどります。',
        success: '盤の反対側まで一気に！',
      },
    ],
  },
  {
    id: 'hisha',
    title: '飛車（ひしゃ）',
    short: 'たて横にどこまでも',
    glyph: '飛',
    intro: '飛車はたてと横に何マスでも進めます。いちばん強い駒のひとつです。',
    diagram: [{ type: 'rook', label: '飛' }],
    steps: [
      {
        sfen: `4k4/9/9/9/9/9/9/7R1/${K} b - 1`,
        task: '飛車を前へ「２四」まで進めよう。',
        goal: { kind: 'move', from: [2, 8], to: [2, 4] },
        select: [2, 8],
        hint: '２八の飛車を選んで、たてに並んだ点の先へ。',
        success: 'いいですね。次は横にも動かしてみましょう。',
      },
      {
        sfen: `4k4/9/9/7R1/9/9/9/9/${K} b - 1`,
        task: '今度は横へ「７四」まで動かそう。',
        goal: { kind: 'move', from: [2, 4], to: [7, 4] },
        select: [2, 4],
        hint: '飛車は横にも何マスでも動けます。',
        success: '自由自在！強い駒なので、取られないように大事に使いましょう。',
      },
    ],
  },
  {
    id: 'gyoku',
    title: '玉（ぎょく）',
    short: '全方向に1マス',
    glyph: '玉',
    intro: '玉は全方向に1マス動けます。取られたら負けなので、相手の駒が利いている（次に取られる）マスには動けません。',
    diagram: [{ type: 'king', label: '玉' }],
    steps: [
      {
        sfen: `4kr3/9/9/9/9/9/9/9/${K} b - 1`,
        task: '玉を前の「５八」へ動かそう。',
        note: '４筋は相手の飛車が利いているので、点が出ません。',
        goal: { kind: 'move', from: [5, 9], to: [5, 8] },
        ng: [[4, 8], [4, 9]],
        select: [5, 9],
        hint: '×のマスは相手の飛車に取られてしまうので行けません。',
        success: 'そのとおり！玉は自分から危ないマスには入れません。',
      },
    ],
  },
  {
    id: 'capture',
    title: '駒を取る',
    short: '取った駒は自分のものに',
    glyph: '取',
    intro: '動ける先に相手の駒があれば、そこへ動いて取れます。取った駒は「持ち駒」として、あとで自分の駒として使えます。',
    steps: [
      {
        sfen: `4k4/9/9/4s4/9/9/9/4R4/${K} b - 1`,
        task: '飛車で相手の銀を取ろう。',
        goal: { kind: 'move', from: [5, 8], to: [5, 4], capture: true },
        hint: '５八の飛車をタップすると、銀のマスに赤い丸が出ます。',
        success: '銀をゲット！下の駒台を見てください。',
      },
      {
        sfen: `4k4/6s2/2g3p2/9/4B4/9/9/9/${K} b - 1`,
        task: '角で取れる駒が2つ。タダで取れる方を取ろう。',
        note: '３三の歩は３二の銀に守られていて、取ると角を取り返されます。',
        goal: { kind: 'move', from: [5, 5], to: [7, 3], capture: true },
        select: [5, 5],
        hint: '７三の金は、どの駒にも守られていません。成っても成らなくてもOK。',
        success: 'ナイス！タダで取れる駒を見つけるのが上達の近道です。',
      },
    ],
  },
  {
    id: 'drop',
    title: '持ち駒を打つ',
    short: '将棋ならではのルール',
    glyph: '打',
    intro: '持ち駒は、自分の番に1手使って、空いているマスに置けます。これを「打つ」といいます。打った駒は自分の駒としてふつうに動けます。',
    steps: [
      {
        sfen: `4k4/9/9/9/9/9/9/9/${K} b S 1`,
        task: '持ち駒の銀を「５五」に打とう。',
        goal: { kind: 'move', drop: 'silver', to: [5, 5] },
        select: 'silver',
        hint: '下の駒台の銀を選んでから、光っているマスをタップ。',
        success: '打てました！相手も取った駒を打ってくるので注意しましょう。',
      },
      {
        sfen: `4k4/9/9/9/9/9/9/9/${K} b G 1`,
        task: '金を相手の王の真ん前「５二」に打って王手をかけよう。',
        goal: { kind: 'move', drop: 'gold', to: [5, 2] },
        select: 'gold',
        hint: '駒台の金を選んで、王の目の前へ。',
        success: '王手！ただし守る駒がいないので、この金は王に取られてしまいます。',
      },
    ],
  },
  {
    id: 'promote',
    title: '成る',
    short: '敵陣で駒が裏返る',
    glyph: '成',
    intro: '相手の陣地（上から3段）に入るとき、出るとき、その中で動くときに「成る」ことができます。駒が裏返って強くなります。金と玉は成れません。',
    diagram: [
      { type: 'silver', promoted: true, label: '成銀' },
      { type: 'pawn', promoted: true, label: 'と金' },
      { type: 'rook', promoted: true, label: '龍' },
      { type: 'bishop', promoted: true, label: '馬' },
    ],
    steps: [
      {
        sfen: `4k4/9/9/5S3/9/9/9/9/${K} b - 1`,
        task: '銀を敵陣の「４三」へ進めて、「成る」を選ぼう。',
        note: '成銀は金と同じ動きになります。',
        goal: { kind: 'move', from: [4, 4], to: [4, 3], promote: true },
        select: [4, 4],
        hint: '４三に動かすと「成りますか」と聞かれます。「成る」を押しましょう。',
        success: '成銀になりました！赤い字が成った駒のしるしです。',
      },
      {
        sfen: `4k4/9/9/2P6/9/9/9/9/${K} b - 1`,
        task: '歩を進めて成り、「と金」にしよう。',
        note: 'と金は金と同じ動き。取られても相手には歩として渡るだけなので、とてもお得です。',
        goal: { kind: 'move', from: [7, 4], to: [7, 3], promote: true },
        select: [7, 4],
        hint: '７四の歩を１マス前へ。そして「成る」。',
        success: '歩が金に大変身！',
      },
      {
        sfen: `4k4/9/9/9/9/9/9/7R1/${K} b - 1`,
        task: '飛車を敵陣「２三」まで進めて「龍」にしよう。',
        note: '龍は飛車の動きに、ななめ1マスが加わった最強クラスの駒です。角が成ると「馬」になります。',
        goal: { kind: 'move', from: [2, 8], to: [2, 3], promote: true },
        select: [2, 8],
        hint: '２八から真っすぐ２三へ。最後に「成る」。',
        success: '龍の誕生！',
      },
    ],
  },
  {
    id: 'forbidden',
    title: 'やってはいけない手',
    short: '二歩・行き所のない駒・打ち歩詰め',
    glyph: '禁',
    intro: '将棋には指すと負けになる反則があります。このアプリでは反則の手はそもそも選べないので安心ですが、覚えておきましょう。',
    steps: [
      {
        sfen: `4k4/9/9/9/9/9/4P4/9/${K} b P 1`,
        task: '「二歩」：同じ筋に自分の歩を2枚置くのは反則。歩を「４六」に打とう。',
        note: '５筋にはもう歩があるので、５筋には打てません（×のマス）。',
        goal: { kind: 'move', drop: 'pawn', to: [4, 6] },
        ng: [[5, 6], [5, 5], [5, 4]],
        select: 'pawn',
        hint: '駒台の歩を選ぶと、５筋だけ点が出ないのがわかります。',
        success: 'OK！と金は歩として数えないので、と金がある筋には打てます。',
        illegal: [
          { drop: 'pawn', to: [5, 6] },
          { drop: 'pawn', to: [5, 2] },
        ],
      },
      {
        sfen: `4k4/9/9/9/9/9/9/9/${K} b N 1`,
        task: '「行き所のない駒」：動けなくなる場所には打てません。桂馬を「２三」に打とう。',
        note: '桂馬は一・二段目に、歩と香車は一段目に打てません。進めるときは必ず成ります。',
        goal: { kind: 'move', drop: 'knight', to: [2, 3] },
        ng: [[2, 1], [2, 2]],
        select: 'knight',
        hint: '一段目・二段目には点が出ません。三段目なら打てます。',
        success: 'そのとおり！そこからなら跳ねる先があります。',
        illegal: [
          { drop: 'knight', to: [2, 1] },
          { drop: 'knight', to: [2, 2] },
        ],
      },
      {
        sfen: `7lk/7p1/7G1/9/9/9/9/9/K8 b GP 1`,
        task: '「打ち歩詰め」：歩を打って詰ませるのは反則。かわりに金を「１二」に打って詰ませよう。',
        note: '１二に歩を打つと詰みになってしまうので打てません。歩を「進めて」詰ませるのはOKです。',
        goal: { kind: 'move', drop: 'gold', to: [1, 2], mate: true },
        hint: '駒台の金を選んで、王の真下の１二へ。２三の金が守ってくれます。',
        success: '詰み！同じ場所でも、歩はダメで金ならOKです。',
        illegal: [{ drop: 'pawn', to: [1, 2] }],
      },
    ],
  },
  {
    id: 'check',
    title: '王手と逃げ方',
    short: '逃げる・取る・合い駒',
    glyph: '王',
    intro:
      '次に玉を取れる状態にする手を「王手」といいます。王手をかけられたら、必ず防がなければいけません。防ぎ方は「逃げる」「取る」「間に駒を入れる（合い駒）」の3つです。',
    steps: [
      {
        sfen: `4k4/9/9/9/9/9/9/9/R3K4 b - 1`,
        task: 'まずは攻める側。飛車で相手の王に王手をかけよう。',
        goal: { kind: 'check' },
        marks: [[9, 1]],
        hint: '飛車を一段目まで上げると、横から王をねらえます。成っても成らなくてもOK。',
        success: '王手！相手の王が赤く光っています。',
      },
      {
        sfen: `4k4/9/9/9/4r4/9/9/9/${K} b - 1`,
        task: '王手されました。①玉を逃がそう。',
        note: '相手の飛車が５筋に利いています。',
        goal: { kind: 'escape', how: 'king' },
        select: [5, 9],
        hint: '玉を横か、ななめにずらしましょう。５筋にいる限り王手のままです。',
        success: '逃げられました！',
      },
      {
        sfen: `4k4/9/9/9/4r4/9/9/9/B3K4 b - 1`,
        task: '②王手をかけている駒を取ろう。',
        goal: { kind: 'escape', how: 'capture' },
        hint: '９九の角から、ななめの線の先に飛車がいます。',
        success: '飛車を取って王手を解消。しかも飛車が手に入りました！',
      },
      {
        sfen: `4k4/9/9/9/4r4/9/9/5G3/${K} b - 1`,
        task: '③合い駒：金を動かして、飛車と玉の間に入れよう。',
        note: '飛車・角・香車のように遠くから利く駒の王手は、間に駒を入れて止められます。',
        goal: { kind: 'escape', how: 'block-move' },
        marks: [
          [5, 8],
          [5, 7],
        ],
        select: [4, 8],
        hint: '４八の金を、５筋（光っているマス）へ動かします。',
        success: '金が壁になって、飛車の利きが止まりました。',
      },
      {
        sfen: `4k4/9/9/9/4r4/9/9/9/${K} b G 1`,
        task: '持ち駒を打って合い駒することもできます。金を飛車と玉の間に打とう。',
        goal: { kind: 'escape', how: 'block-drop' },
        marks: [
          [5, 6],
          [5, 7],
          [5, 8],
        ],
        select: 'gold',
        hint: '駒台の金を選ぶと、打てるマス（５筋の間）に点が出ます。',
        success: '持ち駒の合い駒、成功です！',
      },
    ],
  },
  {
    id: 'mate',
    title: '詰ませよう（1手詰め）',
    short: '4つのパズル',
    glyph: '詰',
    intro: '王手をかけて、相手がどう防いでも逃げられない状態が「詰み」。1手で詰ませるパズルに挑戦！点を頼りに、いろいろ試してみてください。',
    steps: [
      {
        sfen: `4k4/9/4P4/9/9/9/9/9/${K} b G 1`,
        task: '第1問：持ち駒の金で詰ませよう。',
        goal: { kind: 'mate' },
        answer: [5, 2],
        hint: '王の「頭」（すぐ前）に金を打つ「頭金」。歩が金を守っています。',
        success: '頭金で詰み！いちばん有名な詰みの形です。',
      },
      {
        sfen: `4k4/9/4GS3/9/9/9/9/9/${K} b - 1`,
        task: '第2問：盤の上の駒を動かして詰ませよう。',
        goal: { kind: 'mate' },
        answer: [5, 2],
        hint: '金を王の前へ。銀が金を守っているので、王は金を取れません。',
        success: '詰み！守りのついた駒で王手するのがコツです。',
      },
      {
        sfen: `8k/9/7G1/9/9/9/9/9/K8 b R 1`,
        task: '第3問：持ち駒の飛車で詰ませよう。',
        goal: { kind: 'mate' },
        answer: [5, 1],
        hint: '一段目に飛車を打つと、横から王手。逃げ道の二段目は金が押さえています。王のすぐ隣に打つと取られるので、少し離して。',
        success: '詰み！遠くから利く飛車ならではの詰みです。',
      },
      {
        sfen: `7lk/7np/9/9/9/9/9/9/${K} b N 1`,
        task: '第4問：持ち駒の桂馬で詰ませよう。',
        goal: { kind: 'mate' },
        answer: [2, 3],
        hint: '王のまわりは相手の駒でふさがっています。駒を飛びこえて王手できる桂馬を「２三」へ。',
        success: '詰み！自分の駒で逃げ道がなくなる、これが「雪隠詰め」です。',
      },
    ],
  },
  {
    id: 'finale',
    title: '実戦にチャレンジ',
    short: 'コンピュータと一局',
    glyph: '祝',
    intro: 'おつかれさまでした！これで将棋の基本ルールはばっちりです。わからなくなったら、いつでもこのチュートリアルに戻ってこられます。',
    finale: true,
    steps: [
      {
        sfen: 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1',
        task: '「易しい」コンピュータと対局してみよう。最初の一手は「▲７六歩」か「▲２六歩」が定番です。',
        goal: { kind: 'read' },
        hint: '下のボタンから対局を始めましょう。',
        success: '',
      },
    ],
  },
];

export function toIndex(square: Sq): number {
  return sq(square[0], square[1]);
}

export function lessonById(id: string): Lesson | undefined {
  return LESSONS.find((lesson) => lesson.id === id);
}

/** 目標マス（リング表示） */
export function markSquares(step: Step): number[] {
  if (step.marks) return step.marks.map(toIndex);
  if (step.goal.kind === 'move') return [toIndex(step.goal.to)];
  return [];
}

/** 指した手がそのステップの目標を満たすか。after は playMove の結果。 */
export function goalMet(goal: Goal, before: State, move: Move, after: PlayedGame): boolean {
  switch (goal.kind) {
    case 'read':
    case 'tap':
      return false;
    case 'move': {
      if (move.to !== toIndex(goal.to)) return false;
      if (goal.from && move.from !== toIndex(goal.from)) return false;
      if (goal.drop && (move.from !== null || move.piece !== goal.drop)) return false;
      if (goal.promote !== undefined && move.promote !== goal.promote) return false;
      if (goal.capture && !move.capture) return false;
      if (goal.mate && after.result?.kind !== 'checkmate') return false;
      return true;
    }
    case 'check':
      return isGivingCheck(after);
    case 'mate':
      return after.result?.kind === 'checkmate';
    case 'escape': {
      void before;
      switch (goal.how) {
        case 'king':
          return move.piece === 'king';
        case 'capture':
          return move.capture !== null;
        case 'block-move':
          return move.from !== null && move.piece !== 'king' && move.capture === null;
        case 'block-drop':
          return move.from === null;
        default:
          return false;
      }
    }
    default:
      return false;
  }
}

function isGivingCheck(after: PlayedGame): boolean {
  return after.deliveredCheck[after.deliveredCheck.length - 1] ?? false;
}
