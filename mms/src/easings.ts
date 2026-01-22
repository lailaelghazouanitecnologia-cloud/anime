// MMS - Funciones de easing

import type { EasingFunction } from './types';

// Funciones base
const pow = Math.pow;
const sqrt = Math.sqrt;
const sin = Math.sin;
const cos = Math.cos;
const PI = Math.PI;

// Easing functions
export const linear: EasingFunction = (t) => t;

// Quad
export const easeInQuad: EasingFunction = (t) => t * t;
export const easeOutQuad: EasingFunction = (t) => t * (2 - t);
export const easeInOutQuad: EasingFunction = (t) =>
  t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

// Cubic
export const easeInCubic: EasingFunction = (t) => t * t * t;
export const easeOutCubic: EasingFunction = (t) => --t * t * t + 1;
export const easeInOutCubic: EasingFunction = (t) =>
  t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;

// Quart
export const easeInQuart: EasingFunction = (t) => t * t * t * t;
export const easeOutQuart: EasingFunction = (t) => 1 - --t * t * t * t;
export const easeInOutQuart: EasingFunction = (t) =>
  t < 0.5 ? 8 * t * t * t * t : 1 - 8 * --t * t * t * t;

// Quint
export const easeInQuint: EasingFunction = (t) => t * t * t * t * t;
export const easeOutQuint: EasingFunction = (t) => 1 + --t * t * t * t * t;
export const easeInOutQuint: EasingFunction = (t) =>
  t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * --t * t * t * t * t;

// Sine
export const easeInSine: EasingFunction = (t) => 1 - cos((t * PI) / 2);
export const easeOutSine: EasingFunction = (t) => sin((t * PI) / 2);
export const easeInOutSine: EasingFunction = (t) => -(cos(PI * t) - 1) / 2;

// Expo
export const easeInExpo: EasingFunction = (t) => (t === 0 ? 0 : pow(2, 10 * t - 10));
export const easeOutExpo: EasingFunction = (t) => (t === 1 ? 1 : 1 - pow(2, -10 * t));
export const easeInOutExpo: EasingFunction = (t) =>
  t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? pow(2, 20 * t - 10) / 2 : (2 - pow(2, -20 * t + 10)) / 2;

// Circ
export const easeInCirc: EasingFunction = (t) => 1 - sqrt(1 - t * t);
export const easeOutCirc: EasingFunction = (t) => sqrt(1 - --t * t);
export const easeInOutCirc: EasingFunction = (t) =>
  t < 0.5 ? (1 - sqrt(1 - 4 * t * t)) / 2 : (sqrt(1 - pow(-2 * t + 2, 2)) + 1) / 2;

// Back
export const easeInBack: EasingFunction = (t) => 2.70158 * t * t * t - 1.70158 * t * t;
export const easeOutBack: EasingFunction = (t) =>
  1 + 2.70158 * pow(t - 1, 3) + 1.70158 * pow(t - 1, 2);
export const easeInOutBack: EasingFunction = (t) => {
  const c = 1.70158 * 1.525;
  return t < 0.5
    ? (pow(2 * t, 2) * ((c + 1) * 2 * t - c)) / 2
    : (pow(2 * t - 2, 2) * ((c + 1) * (t * 2 - 2) + c) + 2) / 2;
};

// Elastic
export const easeInElastic: EasingFunction = (t) =>
  t === 0 ? 0 : t === 1 ? 1 : -pow(2, 10 * t - 10) * sin((t * 10 - 10.75) * ((2 * PI) / 3));
export const easeOutElastic: EasingFunction = (t) =>
  t === 0 ? 0 : t === 1 ? 1 : pow(2, -10 * t) * sin((t * 10 - 0.75) * ((2 * PI) / 3)) + 1;
export const easeInOutElastic: EasingFunction = (t) => {
  const c = (2 * PI) / 4.5;
  return t === 0
    ? 0
    : t === 1
      ? 1
      : t < 0.5
        ? -(pow(2, 20 * t - 10) * sin((20 * t - 11.125) * c)) / 2
        : (pow(2, -20 * t + 10) * sin((20 * t - 11.125) * c)) / 2 + 1;
};

// Bounce
export const easeOutBounce: EasingFunction = (t) => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
};
export const easeInBounce: EasingFunction = (t) => 1 - easeOutBounce(1 - t);
export const easeInOutBounce: EasingFunction = (t) =>
  t < 0.5 ? (1 - easeOutBounce(1 - 2 * t)) / 2 : (1 + easeOutBounce(2 * t - 1)) / 2;

// Mapa de easings por nombre
export const easings: Record<string, EasingFunction> = {
  linear,
  easeInQuad,
  easeOutQuad,
  easeInOutQuad,
  easeInCubic,
  easeOutCubic,
  easeInOutCubic,
  easeInQuart,
  easeOutQuart,
  easeInOutQuart,
  easeInQuint,
  easeOutQuint,
  easeInOutQuint,
  easeInSine,
  easeOutSine,
  easeInOutSine,
  easeInExpo,
  easeOutExpo,
  easeInOutExpo,
  easeInCirc,
  easeOutCirc,
  easeInOutCirc,
  easeInBack,
  easeOutBack,
  easeInOutBack,
  easeInElastic,
  easeOutElastic,
  easeInOutElastic,
  easeInBounce,
  easeOutBounce,
  easeInOutBounce,
};

/** Obtener función de easing por nombre o función */
export function getEasing(easing: string | EasingFunction): EasingFunction {
  if (typeof easing === 'function') return easing;
  return easings[easing] ?? linear;
}
