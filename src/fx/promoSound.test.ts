import { describe, expect, it } from 'vitest';
import { schedulePromoSound, scheduleRonSound } from './promoSound.ts';
import { RON_FULL, RON_SHORT } from './ronTimeline.ts';
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

describe('和了風 sound', () => {
  const base = 3;
  const run = (tl = RON_FULL, cutoff?: number) => {
    const { ctx, starts } = mockContext();
    const handle = scheduleRonSound(ctx, {} as AudioNode, tl, base, { cutoff });
    return { starts: starts.map((s) => s.at - base), handle };
  };
  const has = (starts: number[], t: number) => starts.some((s) => Math.abs(s - t) < 1e-6);

  it('hits every visual beat of the full version', () => {
    const { starts } = run();
    for (const key of ['tink', 'bandIn', 'eyesGlint', 'fanHit', 'impact', 'flash', 'slam', 'land'] as const) {
      expect([key, has(starts, RON_FULL[key])]).toEqual([key, true]);
    }
    expect(starts.every((s) => s >= 0 && s <= RON_FULL.end + 1)).toBe(true);
  });

  it('keeps the freeze nearly silent after the tink', () => {
    const { starts } = run();
    const during = starts.filter((s) => s > RON_FULL.tink + 0.05 && s < RON_FULL.slash - 0.15);
    expect(during.length).toBeLessThanOrEqual(2);
  });

  it('drops the eye close-up sounds in the short version', () => {
    const { starts } = run(RON_SHORT);
    for (const key of ['fanHit', 'impact', 'flash', 'slam', 'land'] as const) expect(has(starts, RON_SHORT[key])).toBe(true);
    expect(has(starts, RON_FULL.eyesGlint)).toBe(false);
  });

  it('skips the past when audio starts late and can be stopped', () => {
    const { starts, handle } = run(RON_FULL, base + RON_FULL.girlOut);
    expect(starts.every((s) => s >= RON_FULL.girlOut - 1e-3)).toBe(true);
    expect(has(starts, RON_FULL.slam)).toBe(true);
    expect(has(starts, RON_FULL.fanHit)).toBe(false);
    expect(() => handle.stop()).not.toThrow();
  });
});
