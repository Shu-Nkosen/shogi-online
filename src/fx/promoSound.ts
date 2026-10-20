/**
 * 成り演出の効果音エンジン（すべて Web Audio で合成。音源ファイルは使わない）。
 *
 * どの BaseAudioContext にも予約できるので、実機では AudioContext、
 * 書き出し・確認では OfflineAudioContext に同じ音を描ける。
 * 時刻はすべて演出タイムライン（秒）で指定し、映像の衝撃コマと同じ瞬間に鳴る。
 */

export interface PromoSoundTimes {
  lift: number;
  chargeEnd: number;
  impact: number;
  flash: number;
  flipEnd: number;
  kanji: number;
  slam: number;
  sub: number;
  confettiEnd: number;
  climaxEnd: number;
  settle: number;
  land: number;
  end: number;
}

export interface ScheduledSound {
  /** 予約を止める。fade 秒かけて絞ってから切る（スキップ時）。 */
  stop: (fade?: number) => void;
  /** 残響まで含めて鳴り終わる時刻（演出の秒） */
  tailEnd: number;
}

interface Options {
  /** これより前（コンテキスト時刻）に始まる音は鳴らさない。途中から再生するとき用 */
  cutoff?: number;
  seed?: number;
  volume?: number;
}

const FLOOR = 0.0001;

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function softClipCurve(amount: number): Float32Array<ArrayBuffer> {
  const n = 2048;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i += 1) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
  }
  return curve;
}

/** ホール風の残響（ノイズを指数減衰させたインパルス応答を生成） */
function makeImpulse(ctx: BaseAudioContext, seconds: number, decay: number, rand: () => number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch += 1) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i += 1) {
      const t = i / ctx.sampleRate;
      const early = t < 0.09 && rand() < 0.012 ? (rand() * 2 - 1) * 1.6 : 0;
      data[i] = ((rand() * 2 - 1) * Math.exp(-t * decay) + early * Math.exp(-t * 20)) * (t < 0.006 ? t / 0.006 : 1);
    }
  }
  return buffer;
}

function makeNoise(ctx: BaseAudioContext, seconds: number, rand: () => number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = rand() * 2 - 1;
  return buffer;
}

const C3 = 130.81;
const note = (semitones: number) => C3 * 2 ** (semitones / 12);

export function schedulePromoSound(
  ctx: BaseAudioContext,
  out: AudioNode,
  tl: PromoSoundTimes,
  calm: boolean,
  base: number,
  options: Options = {},
): ScheduledSound {
  const rand = rng(options.seed ?? 0x5eed);
  const cutoff = options.cutoff ?? -Infinity;
  const T = (s: number) => base + s;
  const ok = (s: number) => T(s) >= cutoff - 1e-4;
  const sources: AudioScheduledSourceNode[] = [];

  // ---- ミックス：バス → グルー・コンプ → リミッター → 出力、残響は送りで ----
  const master = ctx.createGain();
  master.gain.value = (options.volume ?? 1) * 0.82;
  master.connect(out);
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;
  limiter.connect(master);
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -20;
  glue.knee.value = 10;
  glue.ratio.value = 2.4;
  glue.attack.value = 0.008;
  glue.release.value = 0.22;
  const makeup = ctx.createGain();
  makeup.gain.value = 1.15;
  glue.connect(makeup);
  makeup.connect(limiter);
  const bus = ctx.createGain();
  bus.connect(glue);
  const reverb = ctx.createConvolver();
  reverb.buffer = makeImpulse(ctx, calm ? 2.6 : 3.6, calm ? 2.4 : 1.9, rand);
  const send = ctx.createGain();
  send.gain.value = 1;
  const wet = ctx.createGain();
  wet.gain.value = calm ? 0.55 : 0.42;
  send.connect(reverb);
  reverb.connect(wet);
  wet.connect(glue);
  // きらきら用のディレイ
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.19;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.38;
  const delayOut = ctx.createGain();
  delayOut.gain.value = 0.45;
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(delayOut);
  delayOut.connect(bus);
  delayOut.connect(send);

  const noiseBuf = makeNoise(ctx, 2.5, rand);

  /** 音を出す口。パン・残響送り・ディレイ送りをまとめて作る */
  const voice = (amount: { wet?: number; pan?: number; echo?: number } = {}) => {
    const g = ctx.createGain();
    let tail: AudioNode = g;
    if (amount.pan && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, amount.pan));
      g.connect(p);
      tail = p;
    }
    tail.connect(bus);
    if (amount.wet) {
      const s = ctx.createGain();
      s.gain.value = amount.wet;
      tail.connect(s);
      s.connect(send);
    }
    if (amount.echo) {
      const s = ctx.createGain();
      s.gain.value = amount.echo;
      tail.connect(s);
      s.connect(delay);
    }
    return g;
  };

  const env = (param: AudioParam, start: number, attack: number, peak: number, decay: number, curve: 'exp' | 'lin' = 'exp') => {
    param.setValueAtTime(FLOOR, T(start));
    if (curve === 'exp') param.exponentialRampToValueAtTime(Math.max(FLOOR, peak), T(start + Math.max(0.001, attack)));
    else param.linearRampToValueAtTime(peak, T(start + Math.max(0.001, attack)));
    param.exponentialRampToValueAtTime(FLOOR, T(start + attack + decay));
  };

  const osc = (type: OscillatorType, freq: number, start: number, stop: number, dest: AudioNode, detune = 0) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, T(start));
    o.detune.value = detune;
    o.connect(dest);
    o.start(T(start));
    o.stop(T(stop));
    sources.push(o);
    return o;
  };

  const noise = (start: number, stop: number, dest: AudioNode, offset = 0) => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    src.connect(dest);
    src.start(T(start), (offset + rand() * 2) % 2.4);
    src.stop(T(stop));
    sources.push(src);
    return src;
  };

  const filter = (type: BiquadFilterType, freq: number, q: number, dest: AudioNode) => {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    f.connect(dest);
    return f;
  };

  const shaper = (amount: number, dest: AudioNode) => {
    const w = ctx.createWaveShaper();
    w.curve = softClipCurve(amount);
    w.oversample = '2x';
    w.connect(dest);
    return w;
  };

  /** 低音の「ドン」：ピッチが落ちるサイン波 */
  const thump = (start: number, from: number, to: number, drop: number, peak: number, decay: number, dest: AudioNode = voice({ wet: 0.08 })) => {
    if (!ok(start)) return;
    const g = ctx.createGain();
    g.connect(dest);
    env(g.gain, start, 0.004, peak, decay);
    const o = osc('sine', from, start, start + 0.01 + decay + 0.05, g);
    o.frequency.exponentialRampToValueAtTime(to, T(start + drop));
  };

  /** 鐘・きらめき：基音＋非整数倍音 */
  const bell = (start: number, freq: number, peak: number, decay: number, pan = 0, wetAmt = 0.5, echo = 0) => {
    if (!ok(start)) return;
    const v = voice({ wet: wetAmt, pan, echo });
    for (const [mult, amp, d] of [[1, 1, 1], [2.76, 0.32, 0.45], [5.4, 0.12, 0.25], [8.93, 0.05, 0.15]] as const) {
      const g = ctx.createGain();
      g.connect(v);
      env(g.gain, start, 0.003, peak * amp, decay * d);
      osc('sine', freq * mult, start, start + decay * d + 0.05, g);
    }
  };

  /** 金管風のスタブ：のこぎり波2本＋フィルターの開き */
  const brass = (start: number, freqs: number[], peak: number, hold: number, release: number, wetAmt = 0.4) => {
    if (!ok(start)) return;
    const v = voice({ wet: wetAmt });
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 1.4;
    lp.frequency.setValueAtTime(300, T(start));
    lp.frequency.exponentialRampToValueAtTime(4600, T(start + 0.05));
    lp.frequency.exponentialRampToValueAtTime(1500, T(start + 0.5));
    lp.frequency.exponentialRampToValueAtTime(700, T(start + hold + release));
    const sat = shaper(1.6, v);
    lp.connect(sat);
    const g = ctx.createGain();
    g.connect(lp);
    g.gain.setValueAtTime(FLOOR, T(start));
    g.gain.exponentialRampToValueAtTime(peak, T(start + 0.018));
    g.gain.exponentialRampToValueAtTime(peak * 0.55, T(start + 0.25));
    g.gain.setValueAtTime(peak * 0.55, T(start + hold));
    g.gain.exponentialRampToValueAtTime(FLOOR, T(start + hold + release));
    for (const f of freqs) {
      for (const cents of [-7, 6]) {
        const o = osc('sawtooth', f * 0.985, start, start + hold + release + 0.05, g, cents);
        o.frequency.exponentialRampToValueAtTime(f, T(start + 0.045));
      }
    }
  };

  /** 合唱風パッド：のこぎり波を母音「あー」のフォルマントに通す */
  const choir = (start: number, stop: number, freqs: number[], peak: number, attack: number, release: number) => {
    if (!ok(start)) return;
    const v = voice({ wet: 0.75 });
    const g = ctx.createGain();
    g.gain.setValueAtTime(FLOOR, T(start));
    g.gain.exponentialRampToValueAtTime(peak, T(start + attack));
    g.gain.setValueAtTime(peak, T(stop));
    g.gain.exponentialRampToValueAtTime(FLOOR, T(stop + release));
    for (const [f, q, amp] of [[760, 6, 1], [1150, 7, 0.7], [2700, 9, 0.35], [380, 2, 0.4]] as const) {
      const bp = filter('bandpass', f, q, v);
      const a = ctx.createGain();
      a.gain.value = amp * 3;
      a.connect(bp);
      g.connect(a);
    }
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.2;
    const vibDepth = ctx.createGain();
    vibDepth.gain.value = 7;
    vib.connect(vibDepth);
    vib.start(T(start));
    vib.stop(T(stop + release + 0.1));
    sources.push(vib);
    for (const f of freqs) {
      for (const cents of [-11, 0, 10]) {
        const o = osc('sawtooth', f, start, stop + release + 0.1, g, cents);
        vibDepth.connect(o.detune);
      }
    }
  };

  /** ノイズの「シュッ」：帯域を動かすスイープ */
  const whoosh = (start: number, stop: number, from: number, to: number, peak: number, panFrom = 0, panTo = 0, q = 1.1) => {
    if (!ok(start)) return;
    const dest = voice({ wet: 0.35 });
    let target: AudioNode = dest;
    if (typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.setValueAtTime(panFrom, T(start));
      p.pan.linearRampToValueAtTime(panTo, T(stop));
      p.connect(dest);
      target = p;
    }
    const g = ctx.createGain();
    g.connect(target);
    const mid = start + (stop - start) * 0.62;
    g.gain.setValueAtTime(FLOOR, T(start));
    g.gain.exponentialRampToValueAtTime(peak, T(mid));
    g.gain.exponentialRampToValueAtTime(FLOOR, T(stop));
    const bp = filter('bandpass', from, q, g);
    bp.frequency.setValueAtTime(from, T(start));
    bp.frequency.exponentialRampToValueAtTime(to, T(stop));
    noise(start, stop + 0.02, bp);
  };

  let tailEnd = tl.end;

  if (calm) {
    // ---- 控えめ版：やわらかい光の音と鐘 ----
    whoosh(0, tl.flash + 0.3, 600, 4200, 0.08, -0.3, 0.3, 0.8);
    [0, 4, 7, 12, 16].forEach((st, i) => bell(tl.flash + 0.05 + i * 0.11, note(24 + st), 0.09, 1.6, (i - 2) * 0.25, 0.7));
    choir(tl.flash, tl.climaxEnd, [note(12), note(16), note(19)], 0.035, 0.5, 1.2);
    bell(tl.land, note(43), 0.06, 1.2, 0.2, 0.6);
    bell(tl.land + 0.06, note(36), 0.07, 1.4, -0.2, 0.6);
    tailEnd = tl.end + 1.6;
  } else {
    const charge0 = 0.15;
    const cut = tl.impact - 0.07; // 爆発直前の「無音の一瞬」

    // 1) 心臓の鼓動：だんだん速く、強く
    {
      let t = 0.3;
      let gap = 0.8;
      const lp = filter('lowpass', 220, 0.7, voice({ wet: 0.12 }));
      while (t < tl.impact - 0.3) {
        const k = Math.min(1, t / tl.impact);
        thump(t, 78, 36, 0.16, 0.12 + k ** 1.5 * 0.6, 0.24, lp);
        thump(t + 0.15, 70, 34, 0.14, 0.07 + k ** 1.5 * 0.38, 0.2, lp);
        t += gap;
        gap = Math.max(0.3, gap * 0.86);
      }
    }

    // 2) 地鳴りのサブベース
    if (ok(charge0)) {
      const g = ctx.createGain();
      g.connect(voice());
      g.gain.setValueAtTime(FLOOR, T(charge0));
      g.gain.exponentialRampToValueAtTime(0.3, T(cut - 0.02));
      g.gain.linearRampToValueAtTime(0, T(cut));
      osc('sine', 36, charge0, cut + 0.05, g);
      osc('sine', 43.5, charge0, cut + 0.05, g);
    }

    // 3) 歪んだライザー：デチューンしたのこぎり波＋共振フィルターの開き＋だんだん速いトレモロ
    if (ok(charge0)) {
      const v = voice({ wet: 0.3 });
      const g = ctx.createGain();
      g.connect(v);
      g.gain.setValueAtTime(FLOOR, T(charge0));
      g.gain.exponentialRampToValueAtTime(0.16, T(cut - 0.03));
      g.gain.linearRampToValueAtTime(0, T(cut));
      const trem = ctx.createGain();
      trem.gain.value = 0.6;
      trem.connect(g);
      const lfo = ctx.createOscillator();
      lfo.frequency.setValueAtTime(3, T(charge0));
      lfo.frequency.exponentialRampToValueAtTime(26, T(cut));
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = 0.4;
      lfo.connect(lfoDepth);
      lfoDepth.connect(trem.gain);
      lfo.start(T(charge0));
      lfo.stop(T(cut + 0.05));
      sources.push(lfo);
      const lp = filter('lowpass', 260, 7, trem);
      lp.frequency.setValueAtTime(260, T(charge0));
      lp.frequency.exponentialRampToValueAtTime(9500, T(cut));
      const dist = shaper(9, lp);
      for (const [mult, cents] of [[0.5, 0], [1, -14], [1, -5], [1, 5], [1, 14], [2, 3]] as const) {
        const o = osc('sawtooth', 82 * mult, charge0, cut + 0.05, dist, cents);
        o.frequency.exponentialRampToValueAtTime(1180 * mult, T(cut));
      }
    }

    // 4) ホワイトノイズの吸い込み（左右に揺れながら上へ）
    if (ok(tl.lift * 0.3)) {
      const start = tl.lift * 0.3;
      const p = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null;
      const dest = voice({ wet: 0.4 });
      if (p) p.connect(dest);
      const g = ctx.createGain();
      g.connect(p ?? dest);
      g.gain.setValueAtTime(FLOOR, T(start));
      g.gain.exponentialRampToValueAtTime(0.24, T(cut - 0.02));
      g.gain.linearRampToValueAtTime(0, T(cut));
      const bp = filter('bandpass', 350, 1.3, g);
      bp.frequency.setValueAtTime(350, T(start));
      bp.frequency.exponentialRampToValueAtTime(7800, T(cut));
      noise(start, cut + 0.05, bp);
      if (p) {
        const lfo = ctx.createOscillator();
        lfo.frequency.setValueAtTime(0.6, T(start));
        lfo.frequency.linearRampToValueAtTime(5, T(cut));
        const d = ctx.createGain();
        d.gain.value = 0.7;
        lfo.connect(d);
        d.connect(p.pan);
        lfo.start(T(start));
        lfo.stop(T(cut + 0.05));
        sources.push(lfo);
      }
    }

    // 5) 電撃のパチパチ（稲妻に合わせてだんだん密に）
    for (let i = 0; i < 30; i += 1) {
      const t = tl.lift * 0.6 + (cut - 0.05 - tl.lift * 0.6) * Math.sqrt(rand());
      if (!ok(t)) continue;
      const len = 0.015 + rand() * 0.05;
      const g = ctx.createGain();
      g.connect(voice({ wet: 0.25, pan: rand() * 1.6 - 0.8 }));
      env(g.gain, t, 0.002, 0.25 + rand() * 0.3, len);
      noise(t, t + len + 0.02, filter('highpass', 2600 + rand() * 3000, 0.9, g));
    }

    // 6) 衝撃コマ（白黒の明滅）と同時に「バチッ」
    if (ok(tl.impact)) {
      const g = ctx.createGain();
      g.connect(voice({ wet: 0.5 }));
      env(g.gain, tl.impact, 0.001, 0.9, 0.14);
      noise(tl.impact, tl.impact + 0.2, filter('highpass', 1400, 0.8, g));
      thump(tl.impact, 2400, 180, 0.03, 0.5, 0.05);
    }

    // 7) 白い閃光と同時に大爆発：サブベースの急降下＋キック＋爆風ノイズ＋歪み
    if (ok(tl.flash)) {
      const boomBus = voice({ wet: 0.55 });
      const sub = ctx.createGain();
      sub.connect(filter('lowpass', 900, 0.7, shaper(3, boomBus)));
      env(sub.gain, tl.flash, 0.004, 1, 2.4);
      const o = osc('sine', 165, tl.flash, tl.flash + 2.6, sub);
      o.frequency.exponentialRampToValueAtTime(27, T(tl.flash + 1.5));
      thump(tl.flash, 230, 44, 0.12, 1, 0.45, boomBus);
      const blast = ctx.createGain();
      blast.connect(boomBus);
      env(blast.gain, tl.flash, 0.006, 0.85, 2.6);
      const lp = filter('lowpass', 9000, 0.6, blast);
      lp.frequency.setValueAtTime(9000, T(tl.flash));
      lp.frequency.exponentialRampToValueAtTime(260, T(tl.flash + 1.9));
      noise(tl.flash, tl.flash + 2.8, lp);
      const crunch = ctx.createGain();
      crunch.connect(shaper(6, boomBus));
      env(crunch.gain, tl.flash, 0.003, 0.5, 0.5);
      noise(tl.flash, tl.flash + 0.6, filter('bandpass', 850, 0.8, crunch));
    }

    // 8) 裏返りの「ヒュン」
    whoosh(tl.flash + 0.04, tl.flipEnd + 0.15, 2600, 500, 0.28, -0.7, 0.7);

    // 9) 「成」が迫ってくる吸い込み → 叩きつけ
    whoosh(tl.kanji - 0.05, tl.slam + 0.005, 500, 5200, 0.3, 0, 0, 1.4);
    if (ok(tl.slam)) {
      const taiko = voice({ wet: 0.5 });
      thump(tl.slam, 120, 52, 0.24, 1, 0.75, taiko);
      thump(tl.slam, 64, 40, 0.3, 0.7, 1.1, taiko);
      const skin = ctx.createGain();
      skin.connect(taiko);
      env(skin.gain, tl.slam, 0.002, 0.55, 0.22);
      noise(tl.slam, tl.slam + 0.3, filter('lowpass', 700, 0.8, skin));
      // シンバル
      const cym = ctx.createGain();
      cym.connect(voice({ wet: 0.6, pan: 0.15 }));
      env(cym.gain, tl.slam, 0.003, 0.32, 2.2);
      noise(tl.slam, tl.slam + 2.4, filter('highpass', 5200, 0.7, cym));
      // 金属の響き
      for (const [f, a] of [[540, 0.05], [807, 0.04], [1203, 0.035], [1711, 0.025]] as const) {
        const g = ctx.createGain();
        g.connect(voice({ wet: 0.6 }));
        env(g.gain, tl.slam, 0.002, a, 1.2);
        osc('square', f, tl.slam, tl.slam + 1.3, g);
      }
    }
    // 10) 勝利の金管スタブ（ハ長調）
    brass(tl.slam, [note(0), note(7), note(12), note(16), note(19), note(24)], 0.11, 0.55, 1.3, 0.45);

    // 11) 合唱のふくらみ：I → IV → I
    choir(tl.slam + 0.05, tl.sub - 0.1, [note(12), note(16), note(19), note(24)], 0.03, 0.9, 0.6);
    choir(tl.sub - 0.15, tl.climaxEnd + 0.1, [note(17), note(21), note(24), note(29)], 0.032, 0.35, 0.7);
    choir(tl.settle, tl.end - 0.1, [note(12), note(16), note(19), note(28)], 0.024, 0.8, 1.6);

    // 12) きらきらのアルペジオ（ペンタトニックを上下、ディレイ付き）
    {
      const scale = [24, 26, 28, 31, 33, 36, 38, 40, 43, 45, 48];
      const step = 0.085;
      const startA = tl.slam + 0.22;
      const stopA = tl.confettiEnd;
      const count = Math.max(0, Math.floor((stopA - startA) / step));
      for (let i = 0; i < count; i += 1) {
        const cycle = scale.length * 2 - 2;
        const k = i % cycle;
        const idx = k < scale.length ? k : cycle - k;
        bell(startA + i * step, note(scale[idx]!), 0.05 + 0.03 * (idx / scale.length), 0.7, i % 2 ? 0.55 : -0.55, 0.45, 0.35);
      }
    }

    // 13) 名前が出る瞬間に2発目のスタブ（ヘ長調）＋上昇グリッサンド
    brass(tl.sub, [note(5), note(12), note(17), note(21), note(24)], 0.085, 0.35, 1.0, 0.5);
    [0, 2, 4, 7, 9, 12, 14, 16].forEach((st, i) => bell(tl.sub + i * 0.035, note(36 + st), 0.04, 0.6, (i / 7) * 1.2 - 0.6, 0.5, 0.25));

    // 14) 盤へ戻る「ヒュー」
    whoosh(tl.settle + 0.1, tl.land, 3200, 420, 0.22, 0.5, -0.2);

    // 15) 着地：木の「カッ」＋「チャリーン」
    if (ok(tl.land)) {
      const wood = ctx.createGain();
      wood.connect(voice({ wet: 0.2 }));
      env(wood.gain, tl.land, 0.001, 0.8, 0.05);
      noise(tl.land, tl.land + 0.08, filter('bandpass', 2300, 3.2, wood));
      thump(tl.land, 1900, 700, 0.012, 0.35, 0.03);
      thump(tl.land, 110, 48, 0.12, 0.6, 0.2);
    }
    bell(tl.land + 0.035, note(40), 0.12, 1.4, -0.25, 0.55, 0.3);
    bell(tl.land + 0.1, note(47), 0.11, 1.6, 0.25, 0.55, 0.3);
    bell(tl.land + 0.17, note(52), 0.07, 1.8, 0, 0.6, 0.3);
    tailEnd = tl.end + 2.2;
  }

  return {
    tailEnd,
    stop: (fade = 0.18) => {
      const now = ctx.currentTime;
      try {
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(master.gain.value, now);
        master.gain.linearRampToValueAtTime(0, now + fade);
      } catch {
        // 既に止まっている
      }
      for (const src of sources) {
        try {
          src.stop(now + fade + 0.02);
        } catch {
          // 開始前や停止済み
        }
      }
    },
  };
}

/** 確認・書き出し用：演出全体の音を OfflineAudioContext で描く */
export async function renderPromoSound(tl: PromoSoundTimes, calm: boolean, sampleRate = 44100): Promise<AudioBuffer> {
  const seconds = tl.end + (calm ? 1.8 : 2.4);
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  schedulePromoSound(ctx, ctx.destination, tl, calm, 0);
  return ctx.startRendering();
}

/** AudioBuffer → 16bit WAV */
export function encodeWav(buffer: AudioBuffer): ArrayBuffer {
  const channels = buffer.numberOfChannels;
  const length = buffer.length;
  const out = new ArrayBuffer(44 + length * channels * 2);
  const view = new DataView(out);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, 'RIFF');
  view.setUint32(4, 36 + length * channels * 2, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, length * channels * 2, true);
  const data = Array.from({ length: channels }, (_, ch) => buffer.getChannelData(ch));
  let offset = 44;
  for (let i = 0; i < length; i += 1) {
    for (let ch = 0; ch < channels; ch += 1) {
      const v = Math.max(-1, Math.min(1, data[ch]![i]!));
      view.setInt16(offset, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      offset += 2;
    }
  }
  return out;
}
