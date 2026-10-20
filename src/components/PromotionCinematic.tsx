import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { startPromotionSound } from '../audio.ts';
import {
  clamp01,
  easeInCubic,
  easeInOutCubic,
  easeOutBack,
  easeOutCubic,
  hapticPattern,
  lerp,
  mulberry32,
  span,
  timelineFor,
  type Timeline,
} from '../fx/timeline.ts';
import type { Color, Move, PieceType } from '../engine/types.ts';
import { Koma, SsjAura } from './Koma.tsx';

interface PromotionCinematicProps {
  move: Move;
  color: Color;
  /** 盤上で駒が逆さまに見えるか（後手の駒を先手側から見ている等） */
  invert: boolean;
  /** 着地するマスの要素（位置と大きさを測る） */
  square: HTMLElement | null;
  duration: number;
  calm: boolean;
  onDone: () => void;
}

const FROM_NAME: Record<PieceType, string> = {
  pawn: '歩兵',
  lance: '香車',
  knight: '桂馬',
  silver: '銀将',
  gold: '金将',
  bishop: '角行',
  rook: '飛車',
  king: '玉将',
};
const TO_NAME: Record<PieceType, string> = {
  pawn: 'と金',
  lance: '成香',
  knight: '成桂',
  silver: '成銀',
  gold: '金将',
  bishop: '龍馬',
  rook: '龍王',
  king: '玉将',
};

interface Gather {
  born: number;
  life: number;
  angle: number;
  dist: number;
  len: number;
  hue: number;
}
interface Spark {
  born: number;
  life: number;
  vx: number;
  vy: number;
  drag: number;
  size: number;
  hue: number;
  light: number;
}
interface Debris {
  born: number;
  vx: number;
  vy: number;
  spin: number;
  w: number;
  h: number;
  shade: number;
}
interface Ring {
  born: number;
  life: number;
  radius: number;
  width: number;
  color: string;
}
interface Confetti {
  born: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  sway: number;
  phase: number;
  spin: number;
  w: number;
  h: number;
  color: string;
}

const CONFETTI = ['#ffd54a', '#ff3b3b', '#fff6dc', '#ffb020', '#36c27a', '#ff7eb6', '#7fd3ff'];

function buildParticles(seed: number, tl: Timeline, calm: boolean, lite: boolean, viewport: { w: number; h: number }) {
  const rand = mulberry32(seed);
  const k = calm ? 0.12 : lite ? 0.5 : 1;
  const diag = Math.hypot(viewport.w, viewport.h);
  const scale = tl.end / 10;
  const gather: Gather[] = [];
  const gatherStart = tl.lift * 0.3;
  for (let i = 0; i < Math.round(260 * k); i += 1) {
    const life = (0.55 + rand() * 0.6) * Math.max(0.4, scale);
    const born = gatherStart + rand() * Math.max(0.01, tl.chargeEnd - gatherStart - life * 0.6);
    gather.push({ born, life, angle: rand() * Math.PI * 2, dist: diag * (0.28 + rand() * 0.4), len: 20 + rand() * 70, hue: rand() < 0.2 ? 200 : 40 + rand() * 18 });
  }
  const sparks: Spark[] = [];
  for (let i = 0; i < Math.round(520 * k); i += 1) {
    const angle = rand() * Math.PI * 2;
    const speed = (calm ? 120 : 380) + rand() ** 0.6 * (calm ? 240 : 1500);
    sparks.push({
      born: tl.flash + rand() * 0.35 * scale + (i % 7 === 0 ? (tl.slam - tl.flash) : 0),
      life: (1.1 + rand() * 1.5) * Math.max(0.45, scale),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - (calm ? 40 : 160),
      drag: 1.6 + rand() * 1.8,
      size: 1.2 + rand() * 3.2,
      hue: rand() < 0.12 ? 0 : 36 + rand() * 22,
      light: 55 + rand() * 40,
    });
  }
  const debris: Debris[] = [];
  if (!calm) {
    for (let i = 0; i < Math.round(60 * k); i += 1) {
      const angle = -Math.PI / 2 + (rand() - 0.5) * Math.PI * 1.6;
      const speed = 380 + rand() * 900;
      debris.push({ born: tl.flash, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, spin: (rand() - 0.5) * 24, w: 4 + rand() * 12, h: 2 + rand() * 5, shade: 0.6 + rand() * 0.4 });
    }
  }
  const rings: Ring[] = calm
    ? [{ born: tl.flash, life: 0.8, radius: 220, width: 3, color: '255,220,140' }]
    : [
        { born: tl.flash, life: 0.85 * Math.max(0.5, scale), radius: diag * 0.55, width: 14, color: '255,255,255' },
        { born: tl.flash + 0.1 * scale, life: 1.0 * Math.max(0.5, scale), radius: diag * 0.48, width: 9, color: '255,206,80' },
        { born: tl.flash + 0.24 * scale, life: 1.1 * Math.max(0.5, scale), radius: diag * 0.42, width: 6, color: '230,40,40' },
        { born: tl.slam, life: 0.7 * Math.max(0.5, scale), radius: diag * 0.4, width: 8, color: '255,240,200' },
        { born: tl.land, life: 0.45, radius: 90, width: 3, color: '255,220,120' },
      ];
  const confetti: Confetti[] = [];
  if (!calm) {
    const count = Math.round(170 * k);
    for (let i = 0; i < count; i += 1) {
      const fromTop = i % 3 !== 0;
      confetti.push({
        born: tl.slam + (fromTop ? rand() * Math.max(0.1, tl.confettiEnd - tl.slam) : rand() * 0.08),
        x: fromTop ? rand() * viewport.w : viewport.w / 2,
        y: fromTop ? -20 - rand() * 60 : viewport.h * 0.42,
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
  }
  return { gather, sparks, debris, rings, confetti };
}

function makeGlowSprite(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,240,1)');
  grad.addColorStop(0.18, 'rgba(255,230,140,0.9)');
  grad.addColorStop(0.45, 'rgba(255,170,40,0.35)');
  grad.addColorStop(1, 'rgba(255,120,20,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return c;
}

declare global {
  interface Window {
    __promoFx?: { seek: (t: number) => void; play: () => void; duration: number };
  }
}

export function PromotionCinematic({ move, color, invert, square, duration, calm, onDone }: PromotionCinematicProps) {
  const tl = useMemo(() => timelineFor(duration, calm), [duration, calm]);
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dimRef = useRef<HTMLDivElement>(null);
  const raysRef = useRef<HTMLDivElement>(null);
  const speedRef = useRef<HTMLDivElement>(null);
  const pieceRef = useRef<HTMLDivElement>(null);
  const flipRef = useRef<HTMLDivElement>(null);
  const auraRef = useRef<HTMLDivElement>(null);
  const kanjiRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const impactRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!root || !canvas || !stage) return undefined;
    const lite = matchMedia('(pointer: coarse)').matches || innerWidth < 700;
    const W = innerWidth;
    const H = innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, lite ? 1.25 : 1.75);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sprite = makeGlowSprite();
    const parts = buildParticles(move.to * 131 + move.piece.length * 17 + 7, tl, calm, lite, { w: W, h: H });
    const shell = document.querySelector<HTMLElement>('.app-shell');

    const rect = square?.getBoundingClientRect();
    const sqSize = rect ? Math.min(rect.width, rect.height) : 60;
    const sqX = rect ? rect.left + rect.width / 2 : W / 2;
    const sqY = rect ? rect.top + rect.height / 2 : H / 2;
    const big = Math.min(W * 0.42, H * 0.34, 300);
    const cx = W / 2;
    const cy = H * 0.44;
    const piece = pieceRef.current!;
    piece.style.width = `${big}px`;
    piece.style.height = `${big * 1.08}px`;
    piece.style.left = `${cx - big / 2}px`;
    piece.style.top = `${cy - (big * 1.08) / 2}px`;
    for (const el of [raysRef.current, speedRef.current, kanjiRef.current]) {
      if (el) el.style.top = `${cy}px`;
    }

    const sound = startPromotionSound(tl, calm);
    const pattern = hapticPattern(tl, calm);
    if (pattern.length && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(pattern);
      } catch {
        // 未対応
      }
    }

    const shakeAt = (t: number) => {
      if (calm) return 0;
      let a = 0;
      if (t < tl.impact) a = span(t, tl.lift * 0.6, tl.chargeEnd) ** 2 * 6;
      if (t >= tl.flash) a = Math.max(a, 18 * Math.exp(-(t - tl.flash) * 5));
      if (t >= tl.slam) a = Math.max(a, 12 * Math.exp(-(t - tl.slam) * 7));
      if (t >= tl.land) a = Math.max(a, 3 * Math.exp(-(t - tl.land) * 12));
      return a;
    };

    const bolt = (x: number, y: number, angle: number, length: number, rand: () => number, alpha: number) => {
      const segs = 7 + Math.floor(rand() * 5);
      const pts: [number, number][] = [[x, y]];
      let px = x;
      let py = y;
      for (let i = 1; i <= segs; i += 1) {
        const step = length / segs;
        const jitter = (rand() - 0.5) * length * 0.32;
        px += Math.cos(angle) * step + Math.cos(angle + Math.PI / 2) * jitter * 0.5;
        py += Math.sin(angle) * step + Math.sin(angle + Math.PI / 2) * jitter * 0.5;
        pts.push([px, py]);
      }
      for (const [w, c] of [[7, `rgba(120,170,255,${0.25 * alpha})`], [3, `rgba(190,220,255,${0.7 * alpha})`], [1.2, `rgba(255,255,255,${alpha})`]] as const) {
        ctx.beginPath();
        ctx.moveTo(pts[0]![0], pts[0]![1]);
        for (const [qx, qy] of pts.slice(1)) ctx.lineTo(qx, qy);
        ctx.lineWidth = w;
        ctx.strokeStyle = c;
        ctx.stroke();
      }
    };

    const render = (t: number) => {
      // ----- piece camera -----
      const travel = easeInOutCubic(span(t, 0, tl.lift)) * (1 - easeInOutCubic(span(t, tl.settle, tl.land)));
      const x = lerp(sqX, cx, travel);
      const y = lerp(sqY, cy, travel);
      const charge = span(t, tl.lift * 0.4, tl.chargeEnd);
      let zoom = lerp(sqSize / big, 1, travel);
      if (t < tl.flash) zoom *= lerp(1, 0.86 + 0.06 * Math.sin(t * 40) * charge, charge);
      else {
        const p = span(t, tl.flash, tl.punchEnd);
        const punch = p < 0.12 ? lerp(0.9, 1.34, p / 0.12) : lerp(1.34, 1.06, easeOutCubic((p - 0.12) / 0.88));
        zoom *= lerp(punch, 1, span(t, tl.settle, tl.land));
      }
      const jit = calm || t >= tl.impact ? 0 : charge ** 2 * 7;
      const jx = jit * Math.sin(t * 97.3);
      const jy = jit * Math.cos(t * 83.1);
      piece.style.transform = `translate3d(${x - cx + jx}px, ${y - cy + jy}px, 0) scale(${zoom})`;
      const flipP = span(t, tl.flash, tl.flipEnd);
      const rot = t < tl.flash ? Math.sin(t * 6) * 8 * charge : 180 * easeOutBack(flipP);
      flipRef.current!.style.transform = `rotateY(${rot}deg)`;
      const auraOpacity = t < tl.flash ? charge : 1 - span(t, tl.settle + (tl.land - tl.settle) * 0.4, tl.land);
      auraRef.current!.style.opacity = String(auraOpacity);
      auraRef.current!.style.transform = `scale(${t < tl.flash ? 0.7 + charge * 0.5 : 1.25})`;

      // ----- screen shake -----
      const a = shakeAt(t);
      const sx = a * (Math.sin(t * 71.7) + Math.sin(t * 131.1) * 0.5) * 0.66;
      const sy = a * (Math.cos(t * 63.3) + Math.cos(t * 117.7) * 0.5) * 0.66;
      stage.style.transform = a > 0.05 ? `translate3d(${sx}px, ${sy}px, 0)` : '';
      if (shell) shell.style.transform = a > 0.05 ? `translate3d(${sx * 0.5}px, ${sy * 0.5}px, 0)` : '';

      // ----- overlay layers -----
      const dim = Math.min(span(t, 0, tl.lift * 0.8) * (calm ? 0.55 : 0.84), 1 - span(t, tl.settle + (tl.land - tl.settle) * 0.5, tl.end));
      dimRef.current!.style.opacity = String(Math.max(0, dim));
      const rays = calm ? 0 : span(t, tl.flash, tl.flash + 0.3 * (tl.end / 10)) * (1 - span(t, tl.settle, tl.settle + (tl.land - tl.settle) * 0.6));
      raysRef.current!.style.opacity = String(rays * 0.85);
      const speedOn = !calm && t >= tl.slam - 0.03 && t < tl.climaxEnd;
      speedRef.current!.style.opacity = speedOn ? String(0.55 + 0.35 * Math.abs(Math.sin(t * 37))) : '0';
      speedRef.current!.style.transform = `translate(-50%, -50%) rotate(${Math.floor(t * 30) * 7}deg) scale(${1 + 0.04 * Math.sin(t * 50)})`;
      const flash = calm ? 0.0 : 1 - easeOutCubic(span(t, tl.flash, tl.flash + 0.75 * Math.max(0.4, tl.end / 10)));
      flashRef.current!.style.opacity = String(t >= tl.flash ? flash : 0);
      // impact frames: 黒→白→黒 の3コマ
      const impact = impactRef.current!;
      if (!calm && t >= tl.impact && t < tl.flash) {
        const frame = Math.floor(((t - tl.impact) / (tl.flash - tl.impact)) * 3);
        impact.dataset.frame = String(frame % 2);
        root.dataset.impact = String(frame % 2);
      } else {
        impact.dataset.frame = '';
        delete root.dataset.impact;
      }

      // ----- 成 slam -----
      const kanji = kanjiRef.current!;
      const star = kanji.firstElementChild as HTMLElement;
      if (t < tl.kanji || t > tl.settle + 0.4 * (tl.end / 10)) {
        kanji.style.opacity = '0';
      } else if (calm) {
        kanji.style.opacity = String(span(t, tl.kanji, tl.slam) * (1 - span(t, tl.climaxEnd, tl.settle + 0.3)));
        kanji.style.transform = 'translate(-50%, -50%) scale(1)';
      } else {
        const sc = tl.end / 10;
        const inP = span(t, tl.kanji, tl.slam);
        let s = lerp(6, 1, easeInCubic(inP));
        if (t >= tl.slam) s = 1 + 0.09 * Math.exp(-(t - tl.slam) * 9) * Math.cos((t - tl.slam) * 34);
        // 一拍おいたら、上へ飛んで小さくなり「題字」になる → 変身した駒が見える
        const rise = easeInOutCubic(span(t, tl.slam + 1.3 * sc, tl.slam + 1.8 * sc));
        const titleY = Math.min(cy - big * 0.75, Math.max(80, H * 0.13));
        s *= lerp(1, 0.36, rise);
        const out = span(t, tl.climaxEnd, tl.settle + 0.3 * sc);
        s *= 1 + out * 0.3;
        kanji.style.opacity = String(clamp01(inP * 1.6) * (1 - out));
        kanji.style.transform = `translate(-50%, calc(-50% + ${-(cy - titleY) * rise}px)) scale(${s}) rotate(${-6 + 6 * clamp01(inP)}deg)`;
        star.style.opacity = String(0.94 * (1 - rise * 0.75));
      }
      const sub = subRef.current!;
      const subP = span(t, tl.sub, tl.sub + 0.35 * Math.max(0.4, tl.end / 10));
      const subOut = span(t, tl.climaxEnd, tl.settle + 0.3 * (tl.end / 10));
      sub.style.opacity = String(easeOutCubic(subP) * (1 - subOut));
      sub.style.transform = `translate(-50%, ${lerp(28, 0, easeOutCubic(subP))}px)`;

      // ----- canvas -----
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      // glow
      let glowR = big * (0.7 + charge * 1.3);
      let glowA = 0.15 + 0.6 * charge;
      if (t >= tl.flash) {
        const p = span(t, tl.flash, tl.kanji);
        glowR = lerp(big * 4.5, big * 1.6, easeOutCubic(p));
        glowA = lerp(1, 0.55, p) * (1 - span(t, tl.settle, tl.land));
        glowA *= 0.85 + 0.15 * Math.sin(t * 9);
      }
      if (calm) glowA *= 0.5;
      ctx.globalAlpha = clamp01(glowA);
      ctx.drawImage(sprite, x - glowR, y - glowR, glowR * 2, glowR * 2);
      ctx.globalAlpha = 1;
      // energy gathering
      for (const g of parts.gather) {
        const p = (t - g.born) / g.life;
        if (p < 0 || p > 1) continue;
        const r = g.dist * (1 - easeInCubic(p)) + big * 0.25;
        const r2 = r + g.len * (1 - p) * 1.6;
        const ca = Math.cos(g.angle);
        const sa = Math.sin(g.angle);
        ctx.strokeStyle = `hsla(${g.hue}, 100%, ${g.hue > 100 ? 80 : 65}%, ${0.25 + 0.75 * p})`;
        ctx.lineWidth = 1.5 + 2.5 * p;
        ctx.beginPath();
        ctx.moveTo(x + ca * r, y + sa * r);
        ctx.lineTo(x + ca * r2, y + sa * r2);
        ctx.stroke();
      }
      // lightning
      if (!calm) {
        const charging = t >= tl.lift * 0.7 && t < tl.impact;
        const climax = t >= tl.slam && t < tl.climaxEnd;
        if (charging || climax) {
          const slot = Math.floor(t * 18);
          const rand = mulberry32(slot * 7919 + 13);
          const n = charging ? 1 + Math.floor(charge * 4) : 1;
          for (let i = 0; i < n; i += 1) {
            if (rand() > (charging ? 0.35 + charge * 0.6 : 0.4)) continue;
            const angle = rand() * Math.PI * 2;
            const start = big * zoom * (0.32 + rand() * 0.12);
            bolt(x + Math.cos(angle) * start, y + Math.sin(angle) * start, angle + (rand() - 0.5) * 0.8, big * (0.5 + rand() * 1.1), rand, charging ? 0.6 + charge * 0.4 : 0.6);
          }
        }
      }
      // shockwave rings
      for (const ring of parts.rings) {
        const p = (t - ring.born) / ring.life;
        if (p < 0 || p > 1) continue;
        const ox = ring.born >= tl.land ? sqX : ring.born >= tl.slam ? cx : x;
        const oy = ring.born >= tl.land ? sqY : ring.born >= tl.slam ? cy : y;
        ctx.strokeStyle = `rgba(${ring.color}, ${(1 - p) ** 1.5})`;
        ctx.lineWidth = ring.width * (1 - p) + 1;
        ctx.beginPath();
        ctx.arc(ox, oy, 10 + ring.radius * easeOutCubic(p), 0, Math.PI * 2);
        ctx.stroke();
      }
      // sparks (analytic: drag + gravity)
      for (const sp of parts.sparks) {
        const dt = t - sp.born;
        if (dt < 0 || dt > sp.life) continue;
        const e = Math.exp(-sp.drag * dt);
        const fx = (1 - e) / sp.drag;
        const px = cx + sp.vx * fx;
        const py = cy + sp.vy * fx + 160 * dt * dt;
        const vx = sp.vx * e;
        const vy = sp.vy * e + 320 * dt;
        const life = 1 - dt / sp.life;
        const tail = 0.035;
        ctx.strokeStyle = `hsla(${sp.hue}, 100%, ${sp.light}%, ${life})`;
        ctx.lineWidth = sp.size * (0.4 + life * 0.6);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px - vx * tail, py - vy * tail);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      // debris (wood chips)
      for (const d of parts.debris) {
        const dt = t - d.born;
        if (dt < 0 || dt > 2.4) continue;
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
      // confetti
      for (const c of parts.confetti) {
        const dt = t - c.born;
        if (dt < 0) continue;
        const fade = 1 - span(t, tl.land - 0.2, tl.end);
        if (fade <= 0) continue;
        const burst = c.vy < 0;
        const px = c.x + c.vx * (burst ? (1 - Math.exp(-2.2 * dt)) / 2.2 : dt) + Math.sin(dt * 3 + c.phase) * c.sway;
        const py = burst ? c.y + c.vy * ((1 - Math.exp(-2.6 * dt)) / 2.6) + 140 * dt * dt : c.y + c.vy * dt;
        if (py > H + 30) continue;
        const flip = Math.cos(dt * c.spin + c.phase);
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(dt * c.spin * 0.35 + c.phase);
        ctx.scale(flip, 1);
        ctx.globalAlpha = fade;
        ctx.fillStyle = c.color;
        ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    };

    let raf = 0;
    let start = performance.now();
    let paused = false;
    const finish = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      cancelAnimationFrame(raf);
      sound.stop();
      try {
        navigator.vibrate?.(0);
      } catch {
        // noop
      }
      if (shell) shell.style.transform = '';
      onDoneRef.current();
    };
    const loop = (now: number) => {
      const t = (now - start) / 1000;
      if (t >= tl.end) {
        render(tl.end);
        finish();
        return;
      }
      render(t);
      raf = requestAnimationFrame(loop);
    };
    render(0);
    raf = requestAnimationFrame(loop);

    const skip = () => finish();
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
          start = performance.now();
          raf = requestAnimationFrame(loop);
        },
      };
    }
    return () => {
      cancelAnimationFrame(raf);
      root.removeEventListener('click', skip);
      window.removeEventListener('keydown', onKey);
      sound.stop();
      if (shell) shell.style.transform = '';
      if (window.__promoFx) delete window.__promoFx;
    };
  }, []);

  return createPortal(
    <div ref={rootRef} className={calm ? 'cine is-calm' : 'cine'} role="dialog" aria-label="成りの演出（タップでスキップ）" data-testid="promo-cinematic">
      <div ref={stageRef} className="cine-stage">
      <div ref={dimRef} className="cine-dim" />
      <div ref={raysRef} className="cine-rays" />
      <div ref={speedRef} className="cine-speed" />
      <canvas ref={canvasRef} className="cine-canvas" />
      <div ref={impactRef} className="cine-impact" />
      <div ref={pieceRef} className="cine-piece">
        <div ref={auraRef} className="cine-aura">
          <SsjAura big />
        </div>
        <div className={invert ? 'cine-turn is-inverted' : 'cine-turn'}>
          <div ref={flipRef} className="cine-flipper">
            <div className="cine-face front">
              <Koma type={move.piece} color={color} promoted={move.alreadyPromoted} />
            </div>
            <div className="cine-face back">
              <Koma type={move.piece} color={color} promoted className="is-ssj" />
            </div>
          </div>
        </div>
      </div>
      <div ref={kanjiRef} className="cine-kanji" aria-hidden="true">
        <span className="cine-star" />
        <b>成</b>
      </div>
      <div ref={subRef} className="cine-sub">
        {FROM_NAME[move.piece]} <em>⟶</em> <strong>{TO_NAME[move.piece]}</strong>
      </div>
      <div ref={flashRef} className="cine-flash" />
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
