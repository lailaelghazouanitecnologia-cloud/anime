// Core - Helpers

import { isBrowser, lowerCaseRgx, hexTestRgx, maxValue, minValue } from './consts';
import { globals } from './globals';
import type { Target, DOMTarget, Renderable } from '../types';

// Strings

export const toLowerCase = (str: string): string =>
  str.replace(lowerCaseRgx, '$1-$2').toLowerCase();

export const stringStartsWith = (str: string, sub: string): boolean =>
  str.indexOf(sub) === 0;

// Note: Date.now is used instead of performance.now since it is precise enough
export const now = Date.now;

// Type checkers

export const isArr = Array.isArray;
export const isObj = (a: unknown): a is Record<string, unknown> =>
  a !== null && typeof a === 'object' && a.constructor === Object;
export const isNum = (a: unknown): a is number =>
  typeof a === 'number' && !isNaN(a);
export const isStr = (a: unknown): a is string => typeof a === 'string';
export const isFnc = (a: unknown): a is Function => typeof a === 'function';
export const isUnd = (a: unknown): a is undefined => typeof a === 'undefined';
export const isNil = (a: unknown): a is null | undefined =>
  isUnd(a) || a === null;
export const isSvg = (a: unknown): a is SVGElement =>
  isBrowser && a instanceof SVGElement;
export const isHex = (a: string): boolean => hexTestRgx.test(a);
export const isRgb = (a: string): boolean =>
  stringStartsWith(a, 'rgb') && a[a.length - 1] === ')';
export const isHsl = (a: string): boolean =>
  stringStartsWith(a, 'hsl') && a[a.length - 1] === ')';
export const isCol = (a: string): boolean => isHex(a) || isRgb(a) || isHsl(a);
export const isKey = (a: string): boolean =>
  !Object.prototype.hasOwnProperty.call(globals.defaults, a);

// SVG

const svgCssReservedProperties = ['opacity', 'rotate', 'overflow', 'color'];

export const isValidSVGAttribute = (el: Target, propertyName: string): boolean => {
  if (svgCssReservedProperties.includes(propertyName)) return false;
  const domEl = el as DOMTarget;
  if (domEl.getAttribute?.(propertyName) || propertyName in el) {
    if (propertyName === 'scale') {
      const elParentNode = domEl.parentNode as SVGGeometryElement | null;
      return elParentNode?.tagName === 'filter';
    }
    return true;
  }
  return false;
};

// Number

export const parseNumber = (str: number | string): number =>
  isStr(str) ? parseFloat(str) : str;

// Math

export const pow = Math.pow;
export const sqrt = Math.sqrt;
export const sin = Math.sin;
export const cos = Math.cos;
export const abs = Math.abs;
export const exp = Math.exp;
export const ceil = Math.ceil;
export const floor = Math.floor;
export const asin = Math.asin;
export const max = Math.max;
export const atan2 = Math.atan2;
export const PI = Math.PI;
export const _round = Math.round;

export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;

const powCache: Record<number, number> = {};

export const round = (v: number, decimalLength: number): number => {
  if (decimalLength < 0) return v;
  if (!decimalLength) return _round(v);
  let p = powCache[decimalLength];
  if (!p) p = powCache[decimalLength] = 10 ** decimalLength;
  return _round(v * p) / p;
};

export const snap = (v: number, increment: number | number[]): number =>
  isArr(increment)
    ? increment.reduce((closest, cv) =>
        abs(cv - v) < abs(closest - v) ? cv : closest
      )
    : increment
      ? _round(v / increment) * increment
      : v;

export const lerp = (start: number, end: number, factor: number): number =>
  start + (end - start) * factor;

export const clampInfinity = (v: number): number =>
  v === Infinity ? maxValue : v === -Infinity ? -maxValue : v;

export const normalizeTime = (v: number): number =>
  v <= minValue ? minValue : clampInfinity(round(v, 11));

// Arrays

export const cloneArray = <T>(a: T[]): T[] => (isArr(a) ? [...a] : a);

// Objects

export const mergeObjects = <T extends object, U extends object>(
  o1: T,
  o2: U
): T & U => {
  const merged = { ...o1 } as T & U;
  for (const p in o2) {
    const o1p = (o1 as T & U)[p as keyof (T & U)];
    (merged as Record<string, unknown>)[p] = isUnd(o1p) ? o2[p] : o1p;
  }
  return merged;
};

// Linked lists

export interface LinkedListParent {
  _head: Renderable | null;
  _tail: Renderable | null;
}

export interface LinkedListChild {
  _prev: Renderable | null;
  _next: Renderable | null;
  [key: string]: unknown;
}

export const forEachChildren = (
  parent: LinkedListParent,
  callback: (child: Renderable) => void,
  reverse?: boolean,
  prevProp = '_prev',
  nextProp = '_next'
): void => {
  let next = parent._head as LinkedListChild | null;
  let adjustedNextProp = nextProp;
  if (reverse) {
    next = parent._tail as LinkedListChild | null;
    adjustedNextProp = prevProp;
  }
  while (next) {
    const currentNext = next[adjustedNextProp] as LinkedListChild | null;
    callback(next as Renderable);
    next = currentNext;
  }
};

export const removeChild = (
  parent: LinkedListParent,
  child: LinkedListChild,
  prevProp = '_prev',
  nextProp = '_next'
): void => {
  const prev = child[prevProp] as LinkedListChild | null;
  const next = child[nextProp] as LinkedListChild | null;
  if (prev) prev[nextProp] = next;
  else parent._head = next as Renderable | null;
  if (next) next[prevProp] = prev;
  else parent._tail = prev as Renderable | null;
  child[prevProp] = null;
  child[nextProp] = null;
};

export const addChild = (
  parent: LinkedListParent,
  child: LinkedListChild,
  sortMethod?: (a: LinkedListChild, b: LinkedListChild) => boolean,
  prevProp = '_prev',
  nextProp = '_next'
): void => {
  let prev = parent._tail as LinkedListChild | null;
  while (prev && sortMethod && sortMethod(prev, child)) prev = prev[prevProp] as LinkedListChild | null;
  const next = prev ? (prev[nextProp] as LinkedListChild | null) : (parent._head as LinkedListChild | null);
  if (prev) prev[nextProp] = child;
  else parent._head = child as Renderable;
  if (next) next[prevProp] = child;
  else parent._tail = child as Renderable;
  child[prevProp] = prev;
  child[nextProp] = next;
};
