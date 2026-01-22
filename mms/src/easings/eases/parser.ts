// Easings - Parser

import { minValue, emptyString } from '../../core/consts';
import { isStr, isFnc, clamp, sqrt, cos, sin, asin, PI, pow, stringStartsWith } from '../../core/helpers';
import { none } from '../none';
import type { EasingFunction, EasingParam, PowerEasing, BackEasing, ElasticEasing } from '../../types';

type EasingFunctionWithParams = PowerEasing | BackEasing | ElasticEasing;

export const easeInPower: PowerEasing = (p = 1.68) => (t) => pow(t, +p);

type EaseType = (easeIn: EasingFunction) => EasingFunction;

export const easeTypes: Record<string, EaseType> = {
  in: (easeIn) => (t) => easeIn(t),
  out: (easeIn) => (t) => 1 - easeIn(1 - t),
  inOut: (easeIn) => (t) => (t < 0.5 ? easeIn(t * 2) / 2 : 1 - easeIn(t * -2 + 2) / 2),
  outIn: (easeIn) => (t) => (t < 0.5 ? (1 - easeIn(1 - t * 2)) / 2 : (easeIn(t * 2 - 1) + 1) / 2),
};

const halfPI = PI / 2;
const doublePI = PI * 2;

const easeInFunctions: Record<string, EasingFunctionWithParams | EasingFunction> = {
  [emptyString]: easeInPower,
  Quad: easeInPower(2),
  Cubic: easeInPower(3),
  Quart: easeInPower(4),
  Quint: easeInPower(5),
  Sine: (t) => 1 - cos(t * halfPI),
  Circ: (t) => 1 - sqrt(1 - t * t),
  Expo: (t) => (t ? pow(2, 10 * t - 10) : 0),
  Bounce: (t) => {
    let pow2: number,
      b = 4;
    while (t < ((pow2 = pow(2, --b)) - 1) / 11);
    return 1 / pow(4, 3 - b) - 7.5625 * pow((pow2 * 3 - 2) / 22 - t, 2);
  },
  Back: ((overshoot = 1.7) => (t) => (+overshoot + 1) * t * t * t - +overshoot * t * t) as BackEasing,
  Elastic: ((amplitude = 1, period = 0.3) => {
    const a = clamp(+amplitude, 1, 10);
    const p = clamp(+period, minValue, 2);
    const s = (p / doublePI) * asin(1 / a);
    const e = doublePI / p;
    return (t) => (t === 0 || t === 1 ? t : -a * pow(2, -10 * (1 - t)) * sin((1 - t - s) * e));
  }) as ElasticEasing,
};

export interface EasesFunctions {
  linear: EasingFunction;
  none: EasingFunction;
  in: PowerEasing;
  out: PowerEasing;
  inOut: PowerEasing;
  outIn: PowerEasing;
  inQuad: EasingFunction;
  outQuad: EasingFunction;
  inOutQuad: EasingFunction;
  outInQuad: EasingFunction;
  inCubic: EasingFunction;
  outCubic: EasingFunction;
  inOutCubic: EasingFunction;
  outInCubic: EasingFunction;
  inQuart: EasingFunction;
  outQuart: EasingFunction;
  inOutQuart: EasingFunction;
  outInQuart: EasingFunction;
  inQuint: EasingFunction;
  outQuint: EasingFunction;
  inOutQuint: EasingFunction;
  outInQuint: EasingFunction;
  inSine: EasingFunction;
  outSine: EasingFunction;
  inOutSine: EasingFunction;
  outInSine: EasingFunction;
  inCirc: EasingFunction;
  outCirc: EasingFunction;
  inOutCirc: EasingFunction;
  outInCirc: EasingFunction;
  inExpo: EasingFunction;
  outExpo: EasingFunction;
  inOutExpo: EasingFunction;
  outInExpo: EasingFunction;
  inBounce: EasingFunction;
  outBounce: EasingFunction;
  inOutBounce: EasingFunction;
  outInBounce: EasingFunction;
  inBack: BackEasing;
  outBack: BackEasing;
  inOutBack: BackEasing;
  outInBack: BackEasing;
  inElastic: ElasticEasing;
  outElastic: ElasticEasing;
  inOutElastic: ElasticEasing;
  outInElastic: ElasticEasing;
  [key: string]: EasingFunction | EasingFunctionWithParams;
}

export const eases: EasesFunctions = (() => {
  const list: Record<string, EasingFunction | EasingFunctionWithParams> = { linear: none, none: none };
  for (const type in easeTypes) {
    for (const name in easeInFunctions) {
      const easeIn = easeInFunctions[name];
      const easeType = easeTypes[type];
      list[type + name] =
        name === emptyString || name === 'Back' || name === 'Elastic'
          ? ((a?: number, b?: number) => easeType((easeIn as EasingFunctionWithParams)(a, b)))
          : easeType(easeIn as EasingFunction);
    }
  }
  return list as EasesFunctions;
})();

const easesLookups: Record<string, EasingFunction> = { linear: none, none: none };

export const parseEaseString = (string: string): EasingFunction => {
  if (easesLookups[string]) return easesLookups[string];
  if (string.indexOf('(') <= -1) {
    const hasParams = easeTypes[string] || string.includes('Back') || string.includes('Elastic');
    const parsedFn = hasParams
      ? (eases[string] as EasingFunctionWithParams)()
      : (eases[string] as EasingFunction);
    return parsedFn ? (easesLookups[string] = parsedFn) : none;
  } else {
    const split = string.slice(0, -1).split('(');
    const parsedFn = eases[split[0]] as EasingFunctionWithParams;
    return parsedFn ? (easesLookups[string] = parsedFn(...split[1].split(',').map(Number))) : none;
  }
};

const deprecated = ['steps(', 'irregular(', 'linear(', 'cubicBezier('];

export const parseEase = (ease: EasingParam): EasingFunction => {
  if (isStr(ease)) {
    for (let i = 0, l = deprecated.length; i < l; i++) {
      if (stringStartsWith(ease, deprecated[i])) {
        console.warn(
          `String syntax for \`ease: "${ease}"\` has been removed from the core and replaced by importing and passing the easing function directly: \`ease: ${ease}\``
        );
        return none;
      }
    }
  }
  const easeFunc = isFnc(ease)
    ? (ease as EasingFunction)
    : isStr(ease)
      ? parseEaseString(ease)
      : none;
  return easeFunc;
};
