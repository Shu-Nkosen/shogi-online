let enabled = typeof localStorage === 'undefined' || localStorage.getItem('shogi.sound') !== '0';
let context: AudioContext | null = null;

export function soundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(value: boolean): void {
  enabled = value;
  localStorage.setItem('shogi.sound', value ? '1' : '0');
}

export function unlockAudio(): void {
  const audio = getAudio();
  if (audio?.state === 'suspended') void audio.resume();
}

function getAudio(): AudioContext | null {
  if (!enabled || typeof AudioContext === 'undefined') return null;
  if (!context) context = new AudioContext();
  if (context.state === 'suspended') void context.resume();
  return context;
}

export function playWood(): void {
  const audio = getAudio();
  if (!audio) return;
  const now = audio.currentTime;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(210, now);
  osc.frequency.exponentialRampToValueAtTime(80, now + 0.07);
  gain.gain.setValueAtTime(0.06, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start(now);
  osc.stop(now + 0.1);
}

export function playPromote(): void {
  const audio = getAudio();
  if (!audio) return;
  const now = audio.currentTime;
  const master = audio.createGain();
  master.gain.value = 0.85;
  master.connect(audio.destination);
  [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((freq, index) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = index % 2 === 0 ? 'triangle' : 'sine';
    osc.frequency.value = freq;
    const start = now + index * 0.048;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.07, start + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.72);
    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + 0.75);
  });
  const length = Math.floor(audio.sampleRate * 0.18);
  const buffer = audio.createBuffer(1, length, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
  }
  const noise = audio.createBufferSource();
  noise.buffer = buffer;
  const filter = audio.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 1400;
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.18, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  noise.start(now);
}

export interface SoundHandle {
  stop: () => void;
}

const SILENT: SoundHandle = { stop: () => undefined };

function noiseBuffer(audio: AudioContext, seconds: number): AudioBuffer {
  const length = Math.max(1, Math.floor(audio.sampleRate * seconds));
  const buffer = audio.createBuffer(1, length, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

interface PromoTimes {
  lift: number;
  chargeEnd: number;
  flash: number;
  slam: number;
  confettiEnd: number;
  climaxEnd: number;
  land: number;
  end: number;
}

/**
 * 成り演出の効果音をまとめて予約する（すべて Web Audio で合成）。
 * stop() でいつでも止められる（スキップ時）。音声オフなら何もしない。
 */
export function startPromotionSound(tl: PromoTimes, calm: boolean): SoundHandle {
  const audio = getAudio();
  if (!audio) return SILENT;
  const t0 = audio.currentTime + 0.03;
  const master = audio.createGain();
  master.gain.value = 0.9;
  const comp = audio.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 6;
  master.connect(comp);
  comp.connect(audio.destination);
  const sources: AudioScheduledSourceNode[] = [];
  const at = (s: number) => t0 + s;

  const tone = (type: OscillatorType, freq: number, start: number, length: number, peak: number, dest: AudioNode = master) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at(start));
    gain.gain.setValueAtTime(0.0001, at(start));
    gain.gain.exponentialRampToValueAtTime(peak, at(start) + Math.min(0.02, length / 4));
    gain.gain.exponentialRampToValueAtTime(0.0001, at(start + length));
    osc.connect(gain);
    gain.connect(dest);
    osc.start(at(start));
    osc.stop(at(start + length + 0.05));
    sources.push(osc);
    return osc;
  };

  const noise = (start: number, length: number, peak: number, filterType: BiquadFilterType, freq: number, q = 0.7) => {
    const src = audio.createBufferSource();
    src.buffer = noiseBuffer(audio, length + 0.05);
    const filter = audio.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(freq, at(start));
    filter.Q.value = q;
    const gain = audio.createGain();
    gain.gain.setValueAtTime(peak, at(start));
    gain.gain.exponentialRampToValueAtTime(0.0001, at(start + length));
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(at(start));
    sources.push(src);
    return { filter, gain };
  };

  if (calm) {
    [659.25, 783.99, 1046.5, 1318.5].forEach((freq, i) => tone('sine', freq, tl.flash + i * 0.07, 0.9, 0.05));
    tone('sine', 2093, tl.land, 0.5, 0.03);
  } else {
    // 1) チャージ：上がっていくうなり＋風の音
    const chargeLen = Math.max(0.2, tl.chargeEnd - 0.05);
    const lp = audio.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 8;
    lp.frequency.setValueAtTime(260, at(0));
    lp.frequency.exponentialRampToValueAtTime(5200, at(chargeLen));
    const chargeGain = audio.createGain();
    chargeGain.gain.setValueAtTime(0.0001, at(0));
    chargeGain.gain.exponentialRampToValueAtTime(0.11, at(chargeLen * 0.85));
    chargeGain.gain.setValueAtTime(0.11, at(chargeLen));
    chargeGain.gain.exponentialRampToValueAtTime(0.0001, at(chargeLen + 0.03)); // 直前で無音に
    lp.connect(chargeGain);
    chargeGain.connect(master);
    for (const [type, detune] of [['sawtooth', 0], ['sawtooth', 14], ['square', -9]] as const) {
      const osc = audio.createOscillator();
      osc.type = type;
      osc.detune.value = detune;
      osc.frequency.setValueAtTime(55, at(0));
      osc.frequency.exponentialRampToValueAtTime(880, at(chargeLen));
      osc.connect(lp);
      osc.start(at(0));
      osc.stop(at(chargeLen + 0.08));
      sources.push(osc);
    }
    const wind = noise(0, chargeLen, 0.05, 'bandpass', 300, 1.2);
    wind.gain.gain.setValueAtTime(0.01, at(0));
    wind.gain.gain.exponentialRampToValueAtTime(0.09, at(chargeLen * 0.95));
    wind.gain.gain.exponentialRampToValueAtTime(0.0001, at(chargeLen + 0.02));
    wind.filter.frequency.exponentialRampToValueAtTime(4200, at(chargeLen));
    // 2) バチバチ（稲妻）
    let s = tl.lift * 0.8;
    let step = 0.22;
    while (s < tl.chargeEnd - 0.06) {
      noise(s, 0.035 + Math.random() * 0.03, 0.18 + Math.random() * 0.12, 'highpass', 2200 + Math.random() * 2500);
      s += step * (0.5 + Math.random());
      step = Math.max(0.035, step * 0.9);
    }
    // 3) ドーン（変身）
    const boom = audio.createOscillator();
    const boomGain = audio.createGain();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(150, at(tl.flash));
    boom.frequency.exponentialRampToValueAtTime(32, at(tl.flash + 0.9));
    boomGain.gain.setValueAtTime(0.0001, at(tl.flash));
    boomGain.gain.exponentialRampToValueAtTime(0.9, at(tl.flash) + 0.012);
    boomGain.gain.exponentialRampToValueAtTime(0.0001, at(tl.flash + 1.6));
    boom.connect(boomGain);
    boomGain.connect(master);
    boom.start(at(tl.flash));
    boom.stop(at(tl.flash + 1.7));
    sources.push(boom);
    noise(tl.flash, 1.3, 0.55, 'lowpass', 1400);
    noise(tl.flash, 0.25, 0.4, 'highpass', 3000);
    tone('triangle', 1567.98, tl.flash + 0.05, 1.2, 0.05);
    // 4) 「成」がドン！（太鼓＋金属）
    const taiko = audio.createOscillator();
    const taikoGain = audio.createGain();
    taiko.type = 'sine';
    taiko.frequency.setValueAtTime(110, at(tl.slam));
    taiko.frequency.exponentialRampToValueAtTime(48, at(tl.slam + 0.35));
    taikoGain.gain.setValueAtTime(0.0001, at(tl.slam));
    taikoGain.gain.exponentialRampToValueAtTime(0.75, at(tl.slam) + 0.008);
    taikoGain.gain.exponentialRampToValueAtTime(0.0001, at(tl.slam + 0.6));
    taiko.connect(taikoGain);
    taikoGain.connect(master);
    taiko.start(at(tl.slam));
    taiko.stop(at(tl.slam + 0.7));
    sources.push(taiko);
    noise(tl.slam, 0.12, 0.35, 'bandpass', 900, 1.5);
    [523, 1307, 2146, 3011].forEach((freq) => tone('square', freq, tl.slam, 0.45, 0.018));
    // 5) キラキラ（ペンタトニックの鈴）＋和音
    const bells = [1046.5, 1174.7, 1318.5, 1568, 1760, 2093, 2349.3, 2637];
    const sparkleEnd = Math.max(tl.slam + 0.2, tl.confettiEnd);
    const count = Math.max(4, Math.round((sparkleEnd - tl.slam) * 6));
    for (let i = 0; i < count; i += 1) {
      const when = tl.slam + 0.12 + ((sparkleEnd - tl.slam) * i) / count + Math.random() * 0.05;
      tone(i % 2 ? 'sine' : 'triangle', bells[(i * 3 + 1) % bells.length]!, when, 0.5, 0.035);
    }
    for (const freq of [261.63, 329.63, 392, 523.25]) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, at(tl.slam));
      gain.gain.exponentialRampToValueAtTime(0.045, at(tl.slam + 0.4));
      gain.gain.setValueAtTime(0.045, at(tl.climaxEnd));
      gain.gain.exponentialRampToValueAtTime(0.0001, at(tl.land));
      osc.connect(gain);
      gain.connect(master);
      osc.start(at(tl.slam));
      osc.stop(at(tl.land + 0.1));
      sources.push(osc);
    }
    // 6) 着地のチーン
    tone('sine', 2093, tl.land, 0.6, 0.05);
    tone('sine', 3136, tl.land + 0.04, 0.5, 0.025);
    playWoodAt(audio, at(tl.land - 0.02), master);
  }

  let stopped = false;
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      const now = audio.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0, now + 0.06);
      window.setTimeout(() => {
        for (const source of sources) {
          try {
            source.stop();
          } catch {
            // まだ始まっていない／すでに止まっている
          }
        }
        master.disconnect();
      }, 120);
    },
  };
}

function playWoodAt(audio: AudioContext, when: number, dest: AudioNode): void {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(210, when);
  osc.frequency.exponentialRampToValueAtTime(80, when + 0.07);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(0.12, when + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.1);
  osc.connect(gain);
  gain.connect(dest);
  osc.start(when);
  osc.stop(when + 0.12);
}
