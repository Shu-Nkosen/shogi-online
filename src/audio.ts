import { schedulePromoSound, scheduleRonSound, warmPromoSound, type PromoSoundTimes, type RonSoundTimes, type ScheduledSound } from './fx/promoSound.ts';

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
  /** 鳴っている音を止める。skipped=true なら素早く絞る、false なら残響を自然に残す */
  stop: (skipped?: boolean) => void;
  /** 映像の 0 秒をこの分だけ遅らせると、スピーカーから出る音とぴったり合う */
  visualDelayMs: number;
}

const SILENT: SoundHandle = { stop: () => undefined, visualDelayMs: 0 };

/**
 * 成り演出の効果音を予約する（合成は fx/promoSound.ts）。
 * 映像と音は同じ瞬間を 0 秒とし、以後はどちらも実時間で進む。
 * 音声オフなら何もしない。AudioContext がまだ止まっていれば、再開した時点の位置から鳴らす。
 */
export function startPromotionSound(tl: PromoSoundTimes, calm: boolean): SoundHandle {
  return startScheduled((audio, base, cutoff) => schedulePromoSound(audio, audio.destination, tl, calm, base, { cutoff }));
}

/** 和了風の成り演出（フル／ショート）の効果音 */
export function startRonSound(tl: RonSoundTimes): SoundHandle {
  return startScheduled((audio, base, cutoff) => scheduleRonSound(audio, audio.destination, tl, base, { cutoff }));
}

function startScheduled(schedule: (audio: AudioContext, base: number, cutoff: number) => ScheduledSound): SoundHandle {
  const audio = getAudio();
  if (!audio) return SILENT;
  const lead = 0.04;
  const latency = Math.min(0.25, Math.max(0, (audio as AudioContext & { outputLatency?: number }).outputLatency || audio.baseLatency || 0));
  const startedAt = performance.now();
  const running = audio.state === 'running';
  let scheduled: ScheduledSound | null = null;
  let stopped = false;
  let audioBase = 0;
  const begin = () => {
    if (stopped || scheduled) return;
    // まだ鳴らせなかった時間ぶん進めて、映像と同じ位置から再生する
    const late = running ? 0 : (performance.now() - startedAt) / 1000;
    audioBase = audio.currentTime + (running ? lead : 0.02) - late;
    scheduled = schedule(audio, audioBase, audio.currentTime + 0.01);
  };
  if (running) begin();
  else void audio.resume().then(begin, () => undefined);
  // 予約に時間がかかった遅い端末でもずれないよう、予約後の時刻から映像の開始を決める
  // （負の値なら映像はその分だけ先へ進んだ位置から始まる）
  const visualDelayMs = running ? (audioBase - audio.currentTime + latency) * 1000 : 0;
  return {
    visualDelayMs,
    stop: (skipped = true) => {
      stopped = true;
      if (skipped) scheduled?.stop(0.2);
    },
  };
}

/**
 * iPhone などは、利用者の操作の中で AudioContext を再開し、無音を一度鳴らさないと音が出ない。
 * 最初のタップ／キー入力で一度だけ解錠する。
 */
let warmed = false;
function warmLater(audio: AudioContext): void {
  if (warmed) return;
  warmed = true;
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  const run = () => warmPromoSound(audio);
  if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 3000 });
  else window.setTimeout(run, 500);
}

export function installAudioUnlock(target: Document = document): void {
  const events = ['pointerdown', 'touchend', 'mousedown', 'keydown'] as const;
  const unlock = () => {
    const audio = getAudio();
    if (!audio) return;
    warmLater(audio);
    try {
      const buffer = audio.createBuffer(1, 1, audio.sampleRate);
      const src = audio.createBufferSource();
      src.buffer = buffer;
      src.connect(audio.destination);
      src.start(0);
    } catch {
      // noop
    }
    const done = () => {
      if (audio.state !== 'running') return;
      for (const name of events) target.removeEventListener(name, unlock, true);
    };
    if (audio.state === 'running') done();
    else void audio.resume().then(done, () => undefined);
  };
  for (const name of events) target.addEventListener(name, unlock, { capture: true, passive: true });
}
