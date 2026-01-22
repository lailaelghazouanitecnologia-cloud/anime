// Utils - Number

import { lerp } from '../core/helpers';

export { snap, clamp, round, lerp } from '../core/helpers';

/**
 * Rounds a number to fixed decimal places
 */
export function roundPad(v: number | string, decimalLength: number): string {
  return (+v).toFixed(decimalLength);
}

/**
 * Pads the start of a value with a string
 */
export function padStart(v: number, totalLength: number, padString: string): string {
  return `${v}`.padStart(totalLength, padString);
}

/**
 * Pads the end of a value with a string
 */
export function padEnd(v: number, totalLength: number, padString: string): string {
  return `${v}`.padEnd(totalLength, padString);
}

/**
 * Wraps a value within a range
 */
export function wrap(v: number, min: number, max: number): number {
  return (((v - min) % (max - min) + (max - min)) % (max - min)) + min;
}

/**
 * Maps a value from one range to another
 */
export function mapRange(value: number, inLow: number, inHigh: number, outLow: number, outHigh: number): number {
  return outLow + ((value - inLow) / (inHigh - inLow)) * (outHigh - outLow);
}

/**
 * Converts degrees to radians
 */
export function degToRad(degrees: number): number {
  return degrees * Math.PI / 180;
}

/**
 * Converts radians to degrees
 */
export function radToDeg(radians: number): number {
  return radians * 180 / Math.PI;
}

/**
 * Frame rate independent damped lerp
 */
export function damp(start: number, end: number, deltaTime: number, factor: number): number {
  return !factor ? start : factor === 1 ? end : lerp(start, end, 1 - Math.exp(-factor * deltaTime * 0.1));
}
