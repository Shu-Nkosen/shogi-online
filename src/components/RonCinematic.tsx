import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { startRonSound } from '../audio.ts';
import girlCutinUrl from '../assets/character/girl-cutin.webp';
import girlEyesUrl from '../assets/character/girl-eyes.webp';

/** キャラ画像を先に読み込んでデコードしておく（初登場の瞬間にカクつかないように） */
const artCache: HTMLImageElement[] = [];
export function preloadRonArt(): void {
  if (artCache.length > 0 || typeof Image === 'undefined') return;
  for (const url of [girlEyesUrl, girlCutinUrl]) {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    artCache.push(img);
    img.decode?.().catch(() => undefined);
  }
}
import type { Color, Move } from '../engine/types.ts';
import { easeInExpo, easeOutBackStrong, easeOutExpo, ronHapticPattern, type RonTimeline } from '../fx/ronTimeline.ts';
import { clamp01, createPlayhead, easeInOutCubic, easeOutBack, easeOutCubic, lerp, mulberry32, span } from '../fx/timeline.ts';
import { Koma, SsjAura } from './Koma.tsx';
import { FROM_NAME, makeGlowSprite, TO_NAME } from './PromotionCinematic.tsx';

interface RonCinematicProps {
  move: Move;
  color: Color;
  invert: boolean;
  square: HTMLElement | null;
  tl: RonTimeline;
  onDone: () => void;
}

/** 画像内の位置（0..1）。扇の中心と両目 */
const FAN = { x: 0.13, y: 0.47 };
const EYES = [
  { x: 0.41, y: 0.375 },
  { x: 0.6, y: 0.31 },
];
const GIRL_ASPECT = 864 / 1150;
const EYES_ASPECT = 16 / 9;
const BAND_ANGLE = -9;
const CONFETTI = ['#ffd54a', '#ff3b3b', '#fff6dc', '#ffb020', '#36c27a', '#ff7eb6', '#7fd3ff'];

interface Spark { born: number; life: number; vx: number; vy: number; drag: number; size: number; hue: number; light: number }
interface Ring { born: number; life: number; radius: number; width: number; color: string; at: 'piece' | 'center' | 'fan' | 'square' }
interface Star { born: number; life: number; x: number; y: number; vx: number; vy: number; size: number; spin: number; burst: boolean }
interface Confetti { born: number; x: number; y: number; vx: number; vy: number; sway: number; phase: number; spin: number; w: number; h: number; color: string }
interface Debris { born: number; vx: number; vy: number; spin: number; w: number; h: number; shade: number }
interface Streak { y: number; speed: number; len: number; phase: number; alpha: number }

function buildParticles(seed: number, tl: RonTimeline, lite: boolean, view: { w: number; h: number }) {
  const rand = mulberry32(seed);
  const k = lite ? 0.5 : 1;
  const diag = Math.hypot(view.w, view.h);
  const sparks: Spark[] = [];
  for (let i = 0; i < Math.round(480 * k); i += 1) {
    const angle = rand() * Math.PI * 2;
    const speed = 380 + rand() ** 0.6 * 1500;
    sparks.push({
      born: tl.flash + rand() * 0.3 + (i % 6 === 0 ? tl.slam - tl.flash : 0),
      life: 1.1 + rand() * 1.4,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 160,
      drag: 1.6 + rand() * 1.8,
      size: 1.2 + rand() * 3.2,
      hue: rand() < 0.12 ? 0 : 36 + rand() * 22,
      light: 55 + rand() * 40,
    });
  }
  const rings: Ring[] = [
    { born: tl.tink, life: 0.5, radius: 70, width: 2, color: '220,240,255', at: 'square' },
    { born: tl.fanHit, life: 0.55, radius: diag * 0.32, width: 8, color: '255,236,180', at: 'fan' },
    { born: tl.flash, life: 0.85, radius: diag * 0.55, width: 14, color: '255,255,255', at: 'center' },
    { born: tl.flash + 0.1, life: 1.0, radius: diag * 0.48, width: 9, color: '255,206,80', at: 'center' },
    { born: tl.flash + 0.24, life: 1.1, radius: diag * 0.42, width: 6, color: '230,40,40', at: 'center' },
    { born: tl.slam, life: 0.7, radius: diag * 0.4, width: 8, color: '255,240,200', at: 'center' },
    { born: tl.land, life: 0.45, radius: 90, width: 3, color: '255,220,120', at: 'square' },
  ];
  // カットインのきらきら：扇から弾ける星＋漂う星
  const stars: Star[] = [];
  for (let i = 0; i < Math.round(46 * k); i += 1) {
    const angle = rand() * Math.PI * 2;
    const speed = 260 + rand() * 900;
    stars.push({ born: tl.fanHit + rand() * 0.06, life: 0.6 + rand() * 0.7, x: 0, y: 0, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size: 6 + rand() * 14, spin: (rand() - 0.5) * 8, burst: true });
  }
  for (let i = 0; i < Math.round(34 * k); i += 1) {
    stars.push({
      born: tl.fanHit + rand() * Math.max(0.1, tl.girlOut - tl.fanHit - 0.4),
      life: 0.9 + rand() * 0.9,
      x: rand(),
      y: 0.25 + rand() * 0.7,
      vx: (rand() - 0.5) * 30,
      vy: -40 - rand() * 70,
      size: 4 + rand() * 9,
      spin: (rand() - 0.5) * 3,
      burst: false,
    });
  }
  const confetti: Confetti[] = [];
  for (let i = 0; i < Math.round(170 * k); i += 1) {
    const fromTop = i % 3 !== 0;
    confetti.push({
      born: tl.slam + (fromTop ? rand() * Math.max(0.1, tl.confettiEnd - tl.slam) : rand() * 0.08),
      x: fromTop ? rand() * view.w : view.w / 2,
      y: fromTop ? -20 - rand() * 60 : view.h * 0.42,
      vx: fromTop ? (rand() - 0.5) * 60 : (rand() - 0.5) * 1100,
      vy: fromTop ? 120 + rand() * 140 : -500 - rand() * 700,
      sway: 18 + rand() * 40,
      phase: rand() * Math.PI * 2,
      spin: 3 + rand() * 9,
      w: 6 + rand() * 8,
      h: 10 + rand() * 10,
      color: CONFETTI[i % CONFETTI.length]!,
    });
  }
  const debris: Debris[] = [];
  for (let i = 0; i < Math.round(50 * k); i += 1) {
    const angle = -Math.PI / 2 + (rand() - 0.5) * Math.PI * 1.6;
    const speed = 380 + rand() * 900;
    debris.push({ born: tl.flash, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, spin: (rand() - 0.5) * 24, w: 4 + rand() * 12, h: 2 + rand() * 5, shade: 0.6 + rand() * 0.4 });
  }
  // 帯の中を流れるスピード線（目元の速さに比例して伸び縮み）
  const streaks: Streak[] = [];
  for (let i = 0; i < Math.round(34 * k); i += 1) {
    streaks.push({ y: rand() * 2 - 1, speed: 0.6 + rand() * 0.8, len: 0.3 + rand() * 0.7, phase: rand(), alpha: 0.25 + rand() * 0.55 });
  }
  return { sparks, rings, stars, confetti, debris, streaks };
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const rr = i % 2 === 0 ? r : r * 0.18;
    const a = (i / 8) * Math.PI * 2;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

declare global {
  interface Window {
    __promoFx?: { seek: (t: number) => void; play: () => void; duration: number };
  }
}

/**
 * 雀魂の和了演出のような緩急で見せる成り演出（オリジナルの少女キャラクター付き）。
 * 状態はすべて実時間 t（秒）の関数なので、どの端末・リフレッシュレートでも同じ速さで進む。
 */
export function RonCinematic({ move, color, invert, square, tl, onDone }: RonCinematicProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const refs = {
    stage: useRef<HTMLDivElement>(null),
    dim: useRef<HTMLDivElement>(null),
    vignette: useRef<HTMLDivElement>(null),
    tink: useRef<HTMLDivElement>(null),
    panelRed: useRef<HTMLDivElement>(null),
    panelGold: useRef<HTMLDivElement>(null),
    panelBase: useRef<HTMLDivElement>(null),
    rays: useRef<HTMLDivElement>(null),
    speed: useRef<HTMLDivElement>(null),
    canvas: useRef<HTMLCanvasElement>(null),
    band: useRef<HTMLDivElement>(null),
    bandBg: useRef<HTMLDivElement>(null),
    eyes: useRef<HTMLDivElement>(null),
    eyeGhosts: useRef<HTMLDivElement>(null),
    glints: useRef<HTMLDivElement>(null),
    sheen: useRef<HTMLDivElement>(null),
    slash: useRef<HTMLDivElement>(null),
    girl: useRef<HTMLDivElement>(null),
    girlGhosts: useRef<HTMLDivElement>(null),
    bubble: useRef<HTMLDivElement>(null),
    piece: useRef<HTMLDivElement>(null),
    flip: useRef<HTMLDivElement>(null),
    aura: useRef<HTMLDivElement>(null),
    ink: useRef<HTMLDivElement>(null),
    kanji: useRef<HTMLDivElement>(null),
    sub: useRef<HTMLDivElement>(null),
    impact: useRef<HTMLDivElement>(null),
    flash: useRef<HTMLDivElement>(null),
  };
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const root = rootRef.current;
    const el = Object.fromEntries(Object.entries(refs).map(([k, r]) => [k, r.current])) as {
      [K in keyof typeof refs]: NonNullable<(typeof refs)[K]['current']>;
    };
    if (!root || Object.values(el).some((v) => !v)) return undefined;
    const lite = matchMedia('(pointer: coarse)').matches || innerWidth < 700;
    const W = innerWidth;
    const H = innerHeight;
    const portrait = H > W * 1.1;
    const dpr = Math.min(devicePixelRatio || 1, lite ? 1.25 : 1.75);
    const canvas = el.canvas;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sprite = makeGlowSprite();
    const parts = buildParticles(move.to * 131 + move.piece.length * 17 + 11, tl, lite, { w: W, h: H });
    const shell = document.querySelector<HTMLElement>('.app-shell');

    // ---- レイアウト（縦長スマホでもキャラクターが収まるように） ----
    const rect = square?.getBoundingClientRect();
    const sqSize = rect ? Math.min(rect.width, rect.height) : 60;
    const sqX = rect ? rect.left + rect.width / 2 : W / 2;
    const sqY = rect ? rect.top + rect.height / 2 : H / 2;
    const big = Math.min(W * 0.42, H * 0.34, 300);
    const cx = W / 2;
    const cy = H * 0.44;
    const piece = el.piece;
    piece.style.width = `${big}px`;
    piece.style.height = `${big * 1.08}px`;
    piece.style.left = `${cx - big / 2}px`;
    piece.style.top = `${cy - (big * 1.08) / 2}px`;
    for (const node of [el.rays, el.speed, el.kanji, el.ink]) node.style.top = `${cy}px`;

    const gw = Math.min(W * (portrait ? 1.04 : 0.62), H * 0.9 * GIRL_ASPECT);
    const gh = gw / GIRL_ASPECT;
    const girlX = portrait ? W / 2 - gw * 0.46 : W * 0.6 - gw / 2;
    const girlY = H - gh * (portrait ? 0.93 : 0.97);
    const girl = el.girl;
    girl.style.width = `${gw}px`;
    girl.style.height = `${gh}px`;
    girl.style.left = `${girlX}px`;
    girl.style.top = `${girlY}px`;
    const fanX = girlX + gw * FAN.x;
    const fanY = girlY + gh * FAN.y;
    const bubble = el.bubble;
    bubble.style.left = portrait ? `${W * 0.5}px` : `${Math.max(150, girlX + gw * 0.02)}px`;
    bubble.style.top = portrait ? `${Math.max(56, girlY - 10)}px` : `${girlY + gh * 0.12}px`;

    const bandY = H * (portrait ? 0.36 : 0.42);
    const bh = Math.min(H * (portrait ? 0.3 : 0.32), W * 0.62);
    const iw = Math.max(W * 1.15, bh * 2.6);
    const ih = iw / EYES_ASPECT;
    const band = el.band;
    band.style.top = `${bandY - bh / 2}px`;
    band.style.height = `${bh}px`;
    const eyes = el.eyes;
    eyes.style.width = `${iw}px`;
    eyes.style.height = `${ih}px`;
    eyes.style.top = `${bh / 2 - 0.35 * ih}px`;
    for (const g of Array.from(el.eyeGhosts.children) as HTMLElement[]) {
      g.style.width = eyes.style.width;
      g.style.height = eyes.style.height;
      g.style.top = eyes.style.top;
    }
    const eyesBaseX = W * 0.75 - iw * 0.5; // 帯は 150vw 幅で -25vw から始まる
    for (const [i, g] of Array.from(el.glints.children).entries()) {
      const p = EYES[i]!;
      (g as HTMLElement).style.left = `${p.x * 100}%`;
      (g as HTMLElement).style.top = `${p.y * 100}%`;
    }
    el.slash.style.top = `${bandY}px`;

    // ---- 音と振動（映像と同じ 0 秒） ----
    const sound = startRonSound(tl);
    const pattern = ronHapticPattern(tl);
    if (pattern.length) pattern[0] = (pattern[0] ?? 0) + Math.round(sound.visualDelayMs);
    try {
      if (typeof navigator.vibrate === 'function') navigator.vibrate(pattern);
    } catch {
      // 未対応
    }

    // ---- 動き（t の関数） ----
    const eyesX = (t: number) => {
      if (t < tl.eyesIn) return W * 1.1;
      if (t < tl.eyesSettle) return lerp(W * 1.1, W * 0.05, easeOutExpo(span(t, tl.eyesIn, tl.eyesSettle)));
      if (t < tl.eyesOut) return lerp(W * 0.05, -W * 0.02, easeInOutCubic(span(t, tl.eyesSettle, tl.eyesOut)));
      return lerp(-W * 0.02, -W * 1.4, easeInExpo(span(t, tl.eyesOut, tl.eyesOut + 0.14)));
    };
    const girlPose = (t: number) => {
      if (t < tl.girlIn) return { x: W * 1.05, s: 1.25, r: -5, y: 0 };
      if (t < tl.fanHit) {
        const p = easeOutBackStrong(span(t, tl.girlIn, tl.fanHit));
        return { x: lerp(W * 1.05, 0, p), s: lerp(1.25, 1, p), r: lerp(-5, 0, p), y: 0 };
      }
      const idle = t - tl.fanHit;
      const punch = 0.075 * Math.exp(-idle * 7) * Math.cos(idle * 26);
      const fy = Math.sin(idle * 2.3) * 6 * clamp01(idle * 2);
      const fr = Math.sin(idle * 1.7) * 0.7 * clamp01(idle * 2);
      if (t < tl.girlOut) return { x: -idle * 6, s: 1 + punch, r: fr, y: fy };
      const p = easeInExpo(span(t, tl.girlOut, tl.girlGone));
      return { x: lerp(-(tl.girlOut - tl.fanHit) * 6, -W * 1.3, p), s: 1 + 0.15 * p, r: fr + 6 * p, y: fy };
    };

    const shakeAt = (t: number) => {
      let a = 0;
      if (tl.eyes && t >= tl.bandIn) a = Math.max(a, 7 * Math.exp(-(t - tl.bandIn) * 14));
      if (t >= tl.fanHit) a = Math.max(a, 11 * Math.exp(-(t - tl.fanHit) * 9));
      if (t >= tl.flash) a = Math.max(a, 18 * Math.exp(-(t - tl.flash) * 5));
      if (t >= tl.slam) a = Math.max(a, 12 * Math.exp(-(t - tl.slam) * 7));
      if (t >= tl.land) a = Math.max(a, 3 * Math.exp(-(t - tl.land) * 12));
      return a;
    };

    let lastFilter = '';
    const setShell = (t: number, sx: number, sy: number) => {
      if (!shell) return;
      // 時が止まる：盤の色が抜け、ゆっくり駒に寄る → 戻るときに一瞬で色が戻る
      const drain = easeOutExpo(span(t, 0, 0.32)) * (1 - easeOutCubic(span(t, tl.snap, tl.land + 0.25)));
      const zoom = 1 + 0.06 * easeInOutCubic(span(t, 0, tl.slash)) * (1 - span(t, tl.snap, tl.land));
      const f = drain > 0.01 ? `saturate(${(1 - drain * 0.88).toFixed(2)}) brightness(${(1 - drain * 0.3).toFixed(2)})` : '';
      if (f !== lastFilter) {
        shell.style.filter = f;
        lastFilter = f;
      }
      shell.style.transformOrigin = `${sqX}px ${sqY}px`;
      shell.style.transform = zoom > 1.0005 || Math.abs(sx) > 0.05 ? `translate3d(${sx * 0.5}px, ${sy * 0.5}px, 0) scale(${zoom.toFixed(4)})` : '';
    };

    const render = (t: number) => {
      // ----- 揺れ -----
      const a = shakeAt(t);
      const sx = a * (Math.sin(t * 71.7) + Math.sin(t * 131.1) * 0.5) * 0.66;
      const sy = a * (Math.cos(t * 63.3) + Math.cos(t * 117.7) * 0.5) * 0.66;
      el.stage.style.transform = a > 0.05 ? `translate3d(${sx}px, ${sy}px, 0)` : '';
      setShell(t, sx, sy);

      // ----- 1) 静止：周囲が暗くなり、駒に光が走る -----
      // 戻りで全部が吸い込まれる（短い区間だが見える速さで加速）
      const collapse = span(t, tl.snap, tl.snap + (tl.land - tl.snap) * 0.85) ** 2.2;
      const freezeV = easeOutExpo(span(t, 0, 0.3)) * (1 - span(t, tl.slash, tl.slash + 0.1));
      el.vignette.style.opacity = String(freezeV);
      el.vignette.style.background = `radial-gradient(circle at ${sqX}px ${sqY}px, transparent ${sqSize * 0.9}px, rgba(0,0,0,0.55) ${sqSize * 3.2}px, rgba(0,0,0,0.78) 100%)`;
      const tinkP = span(t, tl.tink, tl.tink + 0.42);
      el.tink.style.opacity = tinkP > 0 && tinkP < 1 ? String(1 - tinkP) : '0';
      el.tink.style.transform = `translate(${sqX}px, ${sqY}px) translate(-50%, -50%) scale(${0.3 + easeOutExpo(tinkP) * 1.3}) rotate(${tinkP * 70}deg)`;

      // 背景の暗転（斬撃以降）
      const dim = t < tl.slash ? 0 : Math.min(1, span(t, tl.slash, tl.slash + 0.08) * 0.92) * (1 - collapse);
      el.dim.style.opacity = String(dim);

      // ----- 2) 斬撃と帯（目元） -----
      if (tl.eyes) {
        const sl = span(t, tl.slash, tl.slash + 0.09);
        const slOut = span(t, tl.slash + 0.12, tl.slash + 0.32);
        el.slash.style.opacity = sl > 0 ? String(1 - slOut) : '0';
        el.slash.style.transform = `rotate(${BAND_ANGLE}deg) scaleX(${easeOutExpo(sl)}) scaleY(${1 + 4 * (1 - slOut) * (slOut > 0 ? 1 : 0)})`;
        const open = easeOutExpo(span(t, tl.bandIn, tl.bandIn + 0.13));
        const close = easeInExpo(span(t, tl.bandOut, tl.bandOut + 0.12));
        const bandS = open * (1 - close);
        band.style.opacity = bandS > 0.001 ? '1' : '0';
        band.style.transform = `rotate(${BAND_ANGLE}deg) scaleY(${bandS})`;
        const ex = eyesX(t);
        const v = (ex - eyesX(t - 0.03)) / 0.03;
        eyes.style.transform = `translate3d(${eyesBaseX + ex}px, 0, 0) rotate(${-BAND_ANGLE}deg)`;
        const ghosts = el.eyeGhosts.children;
        const fast = clamp01((Math.abs(v) - 600) / 2600);
        for (let i = 0; i < ghosts.length; i += 1) {
          const g = ghosts[i] as HTMLElement;
          g.style.opacity = String(fast * (i === 0 ? 0.4 : 0.2));
          g.style.transform = `translate3d(${eyesBaseX + ex - v * 0.018 * (i + 1)}px, 0, 0) rotate(${-BAND_ANGLE}deg)`;
        }
        el.bandBg.style.backgroundPosition = `${-(t * 90 + (W * 1.1 - ex) * 0.6)}px 0`;
        const glint = span(t, tl.eyesGlint, tl.eyesGlint + 0.42);
        const gs = glint > 0 && glint < 1 ? Math.sin(glint * Math.PI) : 0;
        for (const g of Array.from(el.glints.children) as HTMLElement[]) {
          g.style.opacity = String(gs);
          g.style.transform = `translate(-50%, -50%) scale(${0.2 + gs * 1.3}) rotate(${glint * 120}deg)`;
        }
        const sheen = span(t, tl.eyesGlint - 0.05, tl.eyesGlint + 0.35);
        el.sheen.style.opacity = sheen > 0 && sheen < 1 ? '0.85' : '0';
        el.sheen.style.transform = `translateX(${lerp(-30, 160, easeInOutCubic(sheen))}vw) skewX(-20deg)`;
      } else {
        band.style.opacity = '0';
        el.slash.style.opacity = '0';
      }

      // ----- 3) カットイン -----
      const panelIn = easeOutExpo(span(t, tl.girlIn - 0.06, tl.girlIn + 0.2));
      const panelOut = easeInExpo(span(t, tl.girlOut, tl.girlGone));
      const panelsOn = t >= tl.girlIn - 0.06 && t < tl.girlGone + 0.02;
      el.panelBase.style.opacity = panelsOn ? String(clamp01(panelIn * 1.4) * (1 - panelOut)) : '0';
      el.panelRed.style.transform = `translate3d(${lerp(105, 0, panelIn) + lerp(0, -140, panelOut)}%, 0, 0)`;
      el.panelGold.style.transform = `translate3d(${lerp(-105, 0, panelIn) + lerp(0, 140, panelOut)}%, 0, 0)`;
      el.panelRed.style.opacity = el.panelGold.style.opacity = panelsOn ? '1' : '0';
      const pose = girlPose(t);
      const girlOn = t >= tl.girlIn - 0.02 && t < tl.girlGone + 0.02;
      girl.style.opacity = girlOn ? '1' : '0';
      girl.style.transform = `translate3d(${pose.x}px, ${pose.y}px, 0) rotate(${pose.r}deg) scale(${pose.s})`;
      const gv = (pose.x - girlPose(t - 0.03).x) / 0.03;
      const gfast = girlOn ? clamp01((Math.abs(gv) - 700) / 2600) : 0;
      const gg = el.girlGhosts.children;
      for (let i = 0; i < gg.length; i += 1) {
        const g = gg[i] as HTMLElement;
        g.style.opacity = String(gfast * (i === 0 ? 0.38 : 0.18));
        g.style.transform = `translate3d(${-gv * 0.02 * (i + 1)}px, 0, 0)`;
      }
      const bub = span(t, tl.fanHit + 0.08, tl.fanHit + 0.3);
      const bubOut = span(t, tl.girlOut - 0.08, tl.girlOut + 0.04);
      bubble.style.opacity = bub > 0 ? String(1 - bubOut) : '0';
      bubble.style.transform = `translate(-50%, -50%) scale(${easeOutBack(bub) * (1 - bubOut * 0.4)}) rotate(-4deg)`;

      // ----- 4) 叫び：駒・閃光・成 -----
      const appear = easeOutExpo(span(t, tl.girlGone - 0.04, tl.impact + 0.04));
      const travel = 1 - easeInExpo(span(t, tl.snap, tl.land));
      let x = lerp(sqX, cx, travel);
      let y = lerp(sqY, cy, travel);
      let zoom = lerp(sqSize / big, 1, travel);
      let pieceOpacity = 1;
      if (t < tl.slash) {
        // 静止中：マスの上でゆっくり大きくなる（スローモーション）
        x = sqX;
        y = sqY;
        zoom = (sqSize / big) * lerp(1, 1.55, easeInOutCubic(span(t, 0.05, tl.slash)));
      } else if (t < tl.girlGone - 0.04) {
        pieceOpacity = 0;
      } else if (t < tl.flash) {
        zoom = lerp(0.35, 0.92, appear) + 0.04 * Math.sin(t * 40);
      } else if (t < tl.snap) {
        const p = span(t, tl.flash, tl.flash + 0.62);
        zoom = p < 0.12 ? lerp(0.9, 1.34, p / 0.12) : lerp(1.34, 1.04, easeOutCubic((p - 0.12) / 0.88));
      }
      // 「成る！」が叩きつけられている間は駒を隠し、題字が上がると変身後の駒が現れる
      const hold = span(t, tl.kanji, tl.slam) * (1 - easeInOutCubic(span(t, tl.slam + 1.15, tl.slam + 1.55))) * (1 - span(t, tl.snap - 0.06, tl.snap + 0.06));
      pieceOpacity *= 1 - 0.92 * hold;
      piece.style.opacity = String(pieceOpacity);
      piece.style.transform = `translate3d(${x - cx}px, ${y - cy}px, 0) scale(${zoom})`;
      const flipP = span(t, tl.flash, tl.flipEnd);
      el.flip.style.transform = `rotateY(${t < tl.flash ? 0 : 180 * easeOutBack(flipP)}deg)`;
      el.aura.style.opacity = String(t < tl.impact ? 0 : t < tl.flash ? 0.6 : 1 - span(t, tl.land, tl.end));
      el.aura.style.transform = `scale(${t < tl.flash ? 0.8 : 1.25})`;

      const climaxOn = t >= tl.flash && t < tl.land;
      const rays = climaxOn ? span(t, tl.flash, tl.flash + 0.3) * (1 - collapse) : 0;
      el.rays.style.opacity = String(rays * 0.85);
      el.rays.style.scale = String(1 - collapse * 0.9);
      const cutSpeed = t >= tl.girlIn && t < tl.girlOut ? 0.35 : 0;
      const speedOn = t >= tl.slam - 0.03 && t < tl.climaxEnd ? 0.55 + 0.35 * Math.abs(Math.sin(t * 37)) : cutSpeed;
      el.speed.style.opacity = String(speedOn * (1 - collapse));
      el.speed.style.transform = `translate(-50%, -50%) rotate(${Math.floor(t * 30) * 7}deg) scale(${1 + 0.04 * Math.sin(t * 50)})`;
      const flash = 1 - easeOutCubic(span(t, tl.flash, tl.flash + 0.7));
      const cutFlash = tl.eyes ? 1 - easeOutCubic(span(t, tl.bandOut + 0.06, tl.bandOut + 0.3)) : 0;
      el.flash.style.opacity = String(t >= tl.flash ? flash : tl.eyes && t >= tl.bandOut + 0.06 && t < tl.girlIn + 0.3 ? cutFlash * 0.9 : 0);
      if (t >= tl.impact && t < tl.flash) {
        const frame = Math.floor(((t - tl.impact) / (tl.flash - tl.impact)) * 3) % 2;
        el.impact.dataset.frame = String(frame);
        root.dataset.impact = String(frame);
      } else {
        el.impact.dataset.frame = '';
        delete root.dataset.impact;
      }

      // 「成る！」：筆の払いが走ってから叩きつけ → 題字へ
      const ink = span(t, tl.kanji - 0.03, tl.slam);
      const inkOut = span(t, tl.slam + 1.1, tl.slam + 1.45);
      el.ink.style.opacity = ink > 0 && t < tl.land ? String((1 - inkOut) * (1 - collapse)) : '0';
      el.ink.style.transform = `translate(-50%, -50%) rotate(-12deg) scaleX(${easeOutExpo(ink) * (1 - collapse * 0.7)})`;
      const kanji = el.kanji;
      if (t < tl.kanji || t > tl.land) {
        kanji.style.opacity = '0';
      } else {
        const inP = span(t, tl.kanji, tl.slam);
        let s = lerp(5.5, 1, inP ** 3);
        if (t >= tl.slam) s = 1 + 0.1 * Math.exp(-(t - tl.slam) * 9) * Math.cos((t - tl.slam) * 34);
        const rise = easeInOutCubic(span(t, tl.slam + 1.2, tl.slam + 1.6));
        const titleY = Math.min(cy - big * 0.75, Math.max(80, H * 0.13));
        s *= lerp(1, 0.4, rise) * (1 - collapse * 0.9);
        kanji.style.opacity = String(clamp01(inP * 1.6) * (1 - collapse));
        kanji.style.transform = `translate(-50%, calc(-50% + ${-(cy - titleY) * rise}px)) scale(${s}) skewX(-6deg) rotate(${-8 + 6 * clamp01(inP)}deg)`;
      }
      const subP = span(t, tl.sub, tl.sub + 0.3);
      el.sub.style.opacity = String(easeOutCubic(subP) * (1 - span(t, tl.climaxEnd - 0.2, tl.snap)));
      el.sub.style.transform = `translate(-50%, ${lerp(28, 0, easeOutCubic(subP))}px)`;

      // ----- canvas -----
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      if (t >= tl.girlGone - 0.04 && t < tl.end) {
        let glowR = big * lerp(0.6, 1.3, appear);
        let glowA = 0.5 * appear;
        if (t >= tl.flash) {
          const p = span(t, tl.flash, tl.kanji);
          glowR = lerp(big * 4.5, big * 1.6, easeOutCubic(p)) * (1 - collapse * 0.85);
          glowA = lerp(1, 0.55, p) * (0.85 + 0.15 * Math.sin(t * 9)) * (1 - span(t, tl.land, tl.end));
        }
        ctx.globalAlpha = clamp01(glowA);
        ctx.drawImage(sprite, x - glowR, y - glowR, glowR * 2, glowR * 2);
      }
      // 帯の中のスピード線
      if (tl.eyes && t >= tl.bandIn && t < tl.bandOut + 0.12) {
        const ex = eyesX(t);
        const v = Math.abs((ex - eyesX(t - 0.03)) / 0.03);
        const speedK = clamp01(v / 3000);
        ctx.save();
        ctx.translate(W / 2, bandY);
        ctx.rotate((BAND_ANGLE * Math.PI) / 180);
        ctx.globalAlpha = 1;
        for (const s of parts.streaks) {
          const len = W * s.len * (0.08 + speedK * 0.9);
          const xx = (((s.phase - t * s.speed * (0.25 + speedK * 3)) % 1) + 1) % 1;
          const px = -W * 0.8 + xx * W * 1.6;
          ctx.strokeStyle = `rgba(255, 240, 210, ${s.alpha * (0.3 + speedK * 0.7)})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(px, (s.y * bh) / 2);
          ctx.lineTo(px + len, (s.y * bh) / 2);
          ctx.stroke();
        }
        ctx.restore();
      }
      for (const ring of parts.rings) {
        const p = (t - ring.born) / ring.life;
        if (p < 0 || p > 1) continue;
        const [ox, oy] = ring.at === 'square' ? [sqX, sqY] : ring.at === 'fan' ? [fanX + girlPose(t).x, fanY] : [cx, cy];
        ctx.globalAlpha = 1;
        ctx.strokeStyle = `rgba(${ring.color}, ${(1 - p) ** 1.5})`;
        ctx.lineWidth = ring.width * (1 - p) + 1;
        ctx.beginPath();
        ctx.arc(ox, oy, 8 + ring.radius * easeOutCubic(p), 0, Math.PI * 2);
        ctx.stroke();
      }
      // きらきら（4方向の星）
      if (t >= tl.fanHit && t < tl.girlGone + 0.3) {
        const gx = girlPose(t).x;
        for (const s of parts.stars) {
          const dt = t - s.born;
          if (dt < 0 || dt > s.life) continue;
          const life = 1 - dt / s.life;
          let px: number;
          let py: number;
          if (s.burst) {
            const e = (1 - Math.exp(-3 * dt)) / 3;
            px = fanX + gx + s.vx * e;
            py = fanY + s.vy * e;
          } else {
            px = girlX + gx + s.x * gw + s.vx * dt;
            py = girlY + s.y * gh + s.vy * dt;
          }
          const tw = 0.6 + 0.4 * Math.sin(dt * 14 + s.spin * 10);
          ctx.globalAlpha = clamp01(life * 1.4) * tw;
          ctx.fillStyle = s.burst ? '#fff6d8' : '#ffe7a0';
          drawStar(ctx, px, py, s.size * (s.burst ? 0.6 + life * 0.6 : 1), dt * s.spin);
        }
      }
      for (const sp of parts.sparks) {
        const dt = t - sp.born;
        if (dt < 0 || dt > sp.life || t > tl.land) continue;
        const e = Math.exp(-sp.drag * dt);
        const fx = (1 - e) / sp.drag;
        const px = cx + sp.vx * fx;
        const py = cy + sp.vy * fx + 160 * dt * dt;
        const vx = sp.vx * e;
        const vy = sp.vy * e + 320 * dt;
        const life = (1 - dt / sp.life) * (1 - collapse);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = `hsla(${sp.hue}, 100%, ${sp.light}%, ${life})`;
        ctx.lineWidth = sp.size * (0.4 + life * 0.6);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px - vx * 0.035, py - vy * 0.035);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      for (const d of parts.debris) {
        const dt = t - d.born;
        if (dt < 0 || dt > 2.4 || t > tl.land) continue;
        const px = cx + d.vx * dt * 0.9;
        const py = cy + d.vy * dt + 0.5 * 1100 * dt * dt;
        if (py > H + 40) continue;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(d.spin * dt);
        ctx.globalAlpha = clamp01(1.4 - dt / 1.8);
        ctx.fillStyle = `rgb(${Math.round(222 * d.shade)}, ${Math.round(176 * d.shade)}, ${Math.round(108 * d.shade)})`;
        ctx.fillRect(-d.w / 2, -d.h / 2, d.w, d.h);
        ctx.restore();
      }
      for (const c of parts.confetti) {
        const dt = t - c.born;
        if (dt < 0) continue;
        const fade = (1 - span(t, tl.climaxEnd, tl.snap + 0.05)) * (1 - collapse);
        if (fade <= 0) continue;
        const burst = c.vy < 0;
        const px = c.x + c.vx * (burst ? (1 - Math.exp(-2.2 * dt)) / 2.2 : dt) + Math.sin(dt * 3 + c.phase) * c.sway;
        const py = burst ? c.y + c.vy * ((1 - Math.exp(-2.6 * dt)) / 2.6) + 140 * dt * dt : c.y + c.vy * dt;
        if (py > H + 30) continue;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(dt * c.spin * 0.35 + c.phase);
        ctx.scale(Math.cos(dt * c.spin + c.phase), 1);
        ctx.globalAlpha = fade;
        ctx.fillStyle = c.color;
        ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    };

    let raf = 0;
    let head = createPlayhead(performance.now() + sound.visualDelayMs, tl);
    let paused = false;
    let endedNaturally = false;
    const restoreShell = () => {
      if (!shell) return;
      shell.style.transform = '';
      shell.style.filter = '';
      shell.style.transformOrigin = '';
    };
    const finish = (skipped: boolean) => {
      if (doneRef.current) return;
      doneRef.current = true;
      endedNaturally = !skipped;
      cancelAnimationFrame(raf);
      sound.stop(skipped);
      try {
        navigator.vibrate?.(0);
      } catch {
        // noop
      }
      restoreShell();
      onDoneRef.current();
    };
    const loop = () => {
      const now = performance.now();
      if (head.done(now)) {
        render(tl.end);
        finish(false);
        return;
      }
      render(head.at(now));
      raf = requestAnimationFrame(loop);
    };
    render(0);
    raf = requestAnimationFrame(loop);

    const skip = () => finish(true);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        skip();
      }
    };
    root.addEventListener('click', skip);
    window.addEventListener('keydown', onKey);
    if (new URLSearchParams(location.search).has('fxdebug')) {
      window.__promoFx = {
        duration: tl.end,
        seek: (t: number) => {
          paused = true;
          cancelAnimationFrame(raf);
          render(t);
        },
        play: () => {
          if (!paused) return;
          paused = false;
          head = createPlayhead(performance.now(), tl);
          raf = requestAnimationFrame(loop);
        },
      };
    }
    return () => {
      cancelAnimationFrame(raf);
      root.removeEventListener('click', skip);
      window.removeEventListener('keydown', onKey);
      if (!endedNaturally) sound.stop(true);
      restoreShell();
      if (window.__promoFx) delete window.__promoFx;
    };
    // 1回のマウントで1回だけ再生する（key で作り直す）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div ref={rootRef} className="cine is-ron" role="dialog" aria-label="成りの演出（タップでスキップ）" data-testid="promo-cinematic">
      <div ref={refs.stage} className="cine-stage">
        <div ref={refs.vignette} className="ron-vignette" />
        <div ref={refs.dim} className="cine-dim" />
        <div ref={refs.panelBase} className="ron-panel-base" />
        <div ref={refs.speed} className="cine-speed" />
        <div ref={refs.rays} className="cine-rays" />
        <div ref={refs.panelGold} className="ron-panel gold" />
        <div ref={refs.panelRed} className="ron-panel red" />
        <div ref={refs.band} className="ron-band">
          <div ref={refs.bandBg} className="ron-band-bg" />
          <div ref={refs.eyeGhosts} className="ron-ghosts">
            <img src={girlEyesUrl} alt="" className="ron-eyes-img ghost" draggable={false} />
            <img src={girlEyesUrl} alt="" className="ron-eyes-img ghost" draggable={false} />
          </div>
          <div ref={refs.eyes} className="ron-eyes">
            <img src={girlEyesUrl} alt="" className="ron-eyes-img" draggable={false} />
            <div ref={refs.glints} className="ron-glints">
              <i className="ron-glint" />
              <i className="ron-glint" />
            </div>
          </div>
          <div ref={refs.sheen} className="ron-sheen" />
        </div>
        <div ref={refs.slash} className="ron-slash" />
        <div ref={refs.girl} className="ron-girl">
          <div ref={refs.girlGhosts} className="ron-ghosts">
            <img src={girlCutinUrl} alt="" className="ron-girl-img ghost" draggable={false} />
            <img src={girlCutinUrl} alt="" className="ron-girl-img ghost" draggable={false} />
          </div>
          <img src={girlCutinUrl} alt="" className="ron-girl-img" draggable={false} />
        </div>
        <div ref={refs.bubble} className="ron-bubble">
          成らせてもらうよっ！
        </div>
        <canvas ref={refs.canvas} className="cine-canvas" />
        <div ref={refs.piece} className="cine-piece">
          <div ref={refs.aura} className="cine-aura">
            <SsjAura big />
          </div>
          <div className={invert ? 'cine-turn is-inverted' : 'cine-turn'}>
            <div ref={refs.flip} className="cine-flipper">
              <div className="cine-face front">
                <Koma type={move.piece} color={color} promoted={move.alreadyPromoted} />
              </div>
              <div className="cine-face back">
                <Koma type={move.piece} color={color} promoted className="is-ssj" />
              </div>
            </div>
          </div>
        </div>
        <div ref={refs.ink} className="ron-ink" />
        <div ref={refs.kanji} className="cine-kanji ron-kanji" aria-hidden="true">
          <b>成</b>
          <i>る！</i>
        </div>
        <div ref={refs.sub} className="cine-sub">
          {FROM_NAME[move.piece]} <em>⟶</em> <strong>{TO_NAME[move.piece]}</strong>
        </div>
        <div ref={refs.impact} className="cine-impact" />
        <div ref={refs.flash} className="cine-flash" />
        <div ref={refs.tink} className="ron-tink" />
      </div>
      <button
        type="button"
        className="cine-skip"
        data-testid="promo-skip"
        onClick={(event) => {
          event.stopPropagation();
          rootRef.current?.click();
        }}
      >
        スキップ ▶▶
      </button>
      <p className="cine-tip">画面をタップでスキップ</p>
    </div>,
    document.body,
  );
}
