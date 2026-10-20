import { describe, expect, it } from 'vitest';
import { schedulePromoSound } from './promoSound.ts';
import { CALM_TIMELINE, FULL_TIMELINE, SHORT_TIMELINE } from './timeline.ts';

/** Web Audio の最小モック：音源がいつ鳴り始めるかと、音量の予約を記録する */
function mockContext() {
  const starts: { kind: string; at: number }[] = [];
  const param = (value = 0) => ({
    value,
    setValueAtTime: () => undefined,
    linearRampToValueAtTime: () => undefined,
    exponentialRampToValueAtTime: (v: number) => {
      if (!(v > 0)) throw new RangeError('exponential ramp to non-positive value');
    },
    cancelScheduledValues: () => undefined,
  });
  const node = () => ({ connect: () => undefined, disconnect: () => undefined });
  const source = (kind: string) => ({
    ...node(),
    type: '',
    loop: false,
    buffer: null,
    frequency: param(440),
    detune: param(),
    start: (at: number) => void starts.push({ kind, at }),
    stop: () => undefined,
  });
  const ctx = {
    sampleRate: 8000,
    currentTime: 0,
    createGain: () => ({ ...node(), gain: param(1) }),
    createDynamicsCompressor: () => ({ ...node(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }),
    createConvolver: () => ({ ...node(), buffer: null }),
    createDelay: () => ({ ...node(), delayTime: param() }),
    createStereoPanner: () => ({ ...node(), pan: param() }),
    createBiquadFilter: () => ({ ...node(), type: '', frequency: param(), Q: param() }),
    createWaveShaper: () => ({ ...node(), curve: null, oversample: 'none' }),
    createOscillator: () => source('osc'),
    createBufferSource: () => source('buffer'),
    createBuffer: (channels: number, length: number) => ({ getChannelData: () => new Float32Array(length), numberOfChannels: channels, length }),
  };
  return { ctx: ctx as unknown as BaseAudioContext, starts };
}

describe('promotion sound', () => {
  const base = 5;
  const run = (tl = FULL_TIMELINE, calm = false, cutoff?: number) => {
    const { ctx, starts } = mockContext();
    const handle = schedulePromoSound(ctx, {} as AudioNode, tl, calm, base, { cutoff });
    return { starts: starts.map((s) => s.at - base), handle };
  };
  const has = (starts: number[], t: number) => starts.some((s) => Math.abs(s - t) < 1e-6);

  it('hits land exactly on the visual impact frames', () => {
    const { starts } = run();
    for (const key of ['impact', 'flash', 'slam', 'sub', 'land'] as const) expect(has(starts, FULL_TIMELINE[key])).toBe(true);
  });

  it('leaves a moment of silence right before the explosion', () => {
    const { starts } = run();
    const gap = starts.filter((s) => s > FULL_TIMELINE.impact - 0.07 && s < FULL_TIMELINE.impact - 1e-6);
    expect(gap).toEqual([]);
  });

  it('works for the short and calm versions too', () => {
    const short = run(SHORT_TIMELINE).starts;
    expect(has(short, SHORT_TIMELINE.flash) && has(short, SHORT_TIMELINE.slam)).toBe(true);
    const calm = run(CALM_TIMELINE, true);
    expect(calm.starts.length).toBeGreaterThan(5);
    expect(calm.starts.every((s) => s >= 0 && s <= CALM_TIMELINE.end + 0.5)).toBe(true);
  });

  it('skips sounds that are already in the past when audio starts late', () => {
    const { starts } = run(FULL_TIMELINE, false, base + 4);
    expect(starts.every((s) => s >= 4 - 1e-3)).toBe(true);
    expect(has(starts, FULL_TIMELINE.slam)).toBe(true);
    expect(has(starts, FULL_TIMELINE.flash)).toBe(false);
  });

  it('can be stopped at any time', () => {
    const { handle } = run();
    expect(() => handle.stop(0.2)).not.toThrow();
    expect(handle.tailEnd).toBeGreaterThan(FULL_TIMELINE.end);
  });
});
