// Easings - Cubic Bezier

import { abs } from '../../core/helpers';
import { none } from '../none';
import type { EasingFunction } from '../../types';

/**
 * Cubic Bezier solver adapted from https://github.com/gre/bezier-easing
 * (c) 2014 Gaëtan Renaudeau
 */

const calcBezier = (aT: number, aA1: number, aA2: number): number =>
  ((1 - 3 * aA2 + 3 * aA1) * aT + (3 * aA2 - 6 * aA1)) * aT * aT + 3 * aA1 * aT;

const binarySubdivide = (aX: number, mX1: number, mX2: number): number => {
  let aA = 0,
    aB = 1,
    currentX: number,
    currentT: number,
    i = 0;
  do {
    currentT = aA + (aB - aA) / 2;
    currentX = calcBezier(currentT, mX1, mX2) - aX;
    if (currentX > 0) {
      aB = currentT;
    } else {
      aA = currentT;
    }
  } while (abs(currentX) > 0.0000001 && ++i < 100);
  return currentT;
};

export const cubicBezier = (
  mX1 = 0.5,
  mY1 = 0.0,
  mX2 = 0.5,
  mY2 = 1.0
): EasingFunction =>
  mX1 === mY1 && mX2 === mY2
    ? none
    : (t) => (t === 0 || t === 1 ? t : calcBezier(binarySubdivide(t, mX1, mX2), mY1, mY2));
