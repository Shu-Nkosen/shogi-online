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
