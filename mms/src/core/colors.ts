// Core - Colores

import { rgbExecRgx, rgbaExecRgx, hslExecRgx, hslaExecRgx } from './consts';
import { round, isRgb, isHex, isHsl, isUnd } from './helpers';
import type { ColorArray } from '../types';

/**
 * RGB / RGBA Color value string -> RGBA values array
 */
const rgbToRgba = (rgbValue: string): ColorArray => {
  const rgba = rgbExecRgx.exec(rgbValue) || rgbaExecRgx.exec(rgbValue);
  if (!rgba) return [0, 0, 0, 1];
  const a = !isUnd(rgba[4]) ? +rgba[4] : 1;
  return [+rgba[1], +rgba[2], +rgba[3], a];
};

/**
 * HEX3 / HEX3A / HEX6 / HEX6A Color value string -> RGBA values array
 */
const hexToRgba = (hexValue: string): ColorArray => {
  const hexLength = hexValue.length;
  const isShort = hexLength === 4 || hexLength === 5;
  return [
    +('0x' + hexValue[1] + hexValue[isShort ? 1 : 2]),
    +('0x' + hexValue[isShort ? 2 : 3] + hexValue[isShort ? 2 : 4]),
    +('0x' + hexValue[isShort ? 3 : 5] + hexValue[isShort ? 3 : 6]),
    hexLength === 5 || hexLength === 9
      ? +(
          +('0x' + hexValue[isShort ? 4 : 7] + hexValue[isShort ? 4 : 8]) / 255
        ).toFixed(3)
      : 1,
  ];
};

/**
 * Helper for HSL to RGB conversion
 */
const hue2rgb = (p: number, q: number, t: number): number => {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  return t < 1 / 6
    ? p + (q - p) * 6 * t
    : t < 1 / 2
      ? q
      : t < 2 / 3
        ? p + (q - p) * (2 / 3 - t) * 6
        : p;
};

/**
 * HSL / HSLA Color value string -> RGBA values array
 */
const hslToRgba = (hslValue: string): ColorArray => {
  const hsla = hslExecRgx.exec(hslValue) || hslaExecRgx.exec(hslValue);
  if (!hsla) return [0, 0, 0, 1];
  const h = +hsla[1] / 360;
  const s = +hsla[2] / 100;
  const l = +hsla[3] / 100;
  const a = !isUnd(hsla[4]) ? +hsla[4] : 1;
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = round(hue2rgb(p, q, h + 1 / 3) * 255, 0);
    g = round(hue2rgb(p, q, h) * 255, 0);
    b = round(hue2rgb(p, q, h - 1 / 3) * 255, 0);
  }
  return [r, g, b, a];
};

/**
 * All in one color converter that converts a color string value into an array of RGBA values
 */
export const convertColorStringValuesToRgbaArray = (colorString: string): ColorArray => {
  return isRgb(colorString)
    ? rgbToRgba(colorString)
    : isHex(colorString)
      ? hexToRgba(colorString)
      : isHsl(colorString)
        ? hslToRgba(colorString)
        : [0, 0, 0, 1];
};
