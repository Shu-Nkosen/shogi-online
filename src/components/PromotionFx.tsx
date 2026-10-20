import { useMemo } from 'react';
import type { Color, Move } from '../engine/types.ts';
import { Koma } from './Koma.tsx';

interface PromotionFxProps {
  move: Move;
  color: Color;
  invert: boolean;
  onDone: () => void;
}

export function PromotionFx({ move, color, invert, onDone }: PromotionFxProps) {
  const particles = useMemo(
    () =>
      Array.from({ length: 42 }, (_, index) => {
        const angle = (Math.PI * 2 * index) / 42 + (index % 5) * 0.15;
        const distance = 28 + (index % 6) * 16;
        return {
          id: index,
          dx: Math.cos(angle) * distance,
          dy: Math.sin(angle) * distance - 8,
          delay: 0.12 + (index % 9) * 0.03,
          size: 7 + (index % 4) * 3.2,
          kind: index % 3,
        };
      }),
    [],
  );

  return (
    <div className={cnInvert(invert)}>
      <div className="flare" aria-hidden="true" />
      <div className="burst" aria-hidden="true">
        <span className="halo" />
        <span className="shock" />
        <span className="shock delay" />
        <span className="flash" />
        {particles.map((particle) => (
          <i
            key={particle.id}
            className={particle.kind === 0 ? 'spark' : particle.kind === 1 ? 'petal' : 'mote'}
            style={{
              ['--dx' as string]: `${particle.dx}px`,
              ['--dy' as string]: `${particle.dy}px`,
              ['--delay' as string]: `${particle.delay}s`,
              ['--size' as string]: `${particle.size}px`,
            }}
          />
        ))}
      </div>
      <div className="flip-scene">
        <div
          className="flipper"
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget && event.animationName.includes('koma-flip')) onDone();
          }}
        >
          <div className="face front">
            <Koma type={move.piece} color={color} promoted={move.alreadyPromoted} />
          </div>
          <div className="face back">
            <Koma type={move.piece} color={color} promoted />
          </div>
        </div>
      </div>
    </div>
  );
}

function cnInvert(invert: boolean): string {
  return invert ? 'promo-anchor is-inverted' : 'promo-anchor';
}
