// Utils - Chainable

import { noop } from '../core/consts';
import * as numberUtils from './number';

type UtilityFunction = (...args: (number | string)[]) => number | string;

interface ChainableUtil {
  (value: number | string): number | string;
  clamp: (min: number, max: number) => ChainableUtil;
  round: (decimalLength: number) => ChainableUtil;
  snap: (increment: number | number[]) => ChainableUtil;
  wrap: (min: number, max: number) => ChainableUtil;
  lerp: (start: number, end: number) => ChainableUtil;
  damp: (start: number, end: number, deltaTime: number) => ChainableUtil;
  mapRange: (inLow: number, inHigh: number, outLow: number, outHigh: number) => ChainableUtil;
  roundPad: (decimalLength: number) => ChainableUtil;
  padStart: (totalLength: number, padString: string) => ChainableUtil;
  padEnd: (totalLength: number, padString: string) => ChainableUtil;
  degToRad: () => ChainableUtil;
  radToDeg: () => ChainableUtil;
}

const chainables: Record<string, (...args: (number | string)[]) => (v: number | string) => number | string> = {};

function curry(fn: UtilityFunction, last = 0): (...args: (number | string)[]) => (v: number | string) => number | string {
  return (...args) => last ? (v) => fn(...args, v) : (v) => fn(v, ...args);
}

function chain(
  fn: (...args: (number | string)[]) => (v: number | string) => number | string
): (...args: (number | string)[]) => ChainableUtil {
  return (...args) => {
    const result = fn(...args);
    return new Proxy(noop as unknown as ChainableUtil, {
      apply: (_, __, [v]) => result(v),
      get: (_, prop: string) => chain((...nextArgs: (number | string)[]) => {
        const nextResult = chainables[prop](...nextArgs);
        return (v: number | string) => nextResult(result(v));
      }),
    }) as ChainableUtil;
  };
}

function makeChainable<T extends UtilityFunction>(
  name: string,
  fn: T,
  right = 0
): T & ((...args: Parameters<T>) => ChainableUtil) {
  const chained = (...args: Parameters<T>) => (args.length < fn.length ? chain(curry(fn, right)) : fn)(...args);
  if (!chainables[name]) chainables[name] = chained as (...args: (number | string)[]) => (v: number | string) => number | string;
  return chained as T & ((...args: Parameters<T>) => ChainableUtil);
}

export const roundPad = makeChainable('roundPad', numberUtils.roundPad);
export const padStart = makeChainable('padStart', numberUtils.padStart);
export const padEnd = makeChainable('padEnd', numberUtils.padEnd);
export const wrap = makeChainable('wrap', numberUtils.wrap);
export const mapRange = makeChainable('mapRange', numberUtils.mapRange);
export const degToRad = makeChainable('degToRad', numberUtils.degToRad);
export const radToDeg = makeChainable('radToDeg', numberUtils.radToDeg);
export const snap = makeChainable('snap', numberUtils.snap);
export const clamp = makeChainable('clamp', numberUtils.clamp);
export const round = makeChainable('round', numberUtils.round);
export const lerp = makeChainable('lerp', numberUtils.lerp, 1);
export const damp = makeChainable('damp', numberUtils.damp, 1);
