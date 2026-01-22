// MMS - Utilidades

import type { Target, FunctionValue } from './types';

interface StaggerOptions {
  start?: number;
  from?: 'first' | 'last' | 'center' | number;
  direction?: 'normal' | 'reverse';
  easing?: (t: number) => number;
  grid?: [number, number];
  axis?: 'x' | 'y';
}

/** Crear función de stagger para delays */
export function stagger(value: number, options: StaggerOptions = {}): FunctionValue {
  const { start = 0, from = 'first', direction = 'normal', easing, grid, axis } = options;

  return (_target: Target, index: number, total: number): number => {
    let fromIndex: number;

    if (typeof from === 'number') {
      fromIndex = from;
    } else if (from === 'last') {
      fromIndex = total - 1;
    } else if (from === 'center') {
      fromIndex = (total - 1) / 2;
    } else {
      fromIndex = 0;
    }

    let distance: number;

    if (grid) {
      const [cols] = grid;
      const fromX = fromIndex % cols;
      const fromY = Math.floor(fromIndex / cols);
      const x = index % cols;
      const y = Math.floor(index / cols);

      if (axis === 'x') {
        distance = Math.abs(x - fromX);
      } else if (axis === 'y') {
        distance = Math.abs(y - fromY);
      } else {
        distance = Math.sqrt(Math.pow(x - fromX, 2) + Math.pow(y - fromY, 2));
      }
    } else {
      distance = Math.abs(index - fromIndex);
    }

    let progress = distance / Math.max(total - 1, 1);

    if (direction === 'reverse') {
      progress = 1 - progress;
    }

    if (easing) {
      progress = easing(progress);
    }

    return start + value * progress * (total - 1);
  };
}

/** Generar número aleatorio entre min y max */
export function random(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/** Mapear valor de un rango a otro */
export function mapRange(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
): number {
  return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
}

/** Clampar valor entre min y max */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Lerp - interpolación lineal */
export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}
