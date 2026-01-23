// SVG - Motion Path

import { isSvgSymbol } from '../core/consts';
import { atan2, PI } from '../core/helpers';
import { getPath } from './helpers';
import type { TargetsParam, FunctionValue, TweenObjectValue, TweenModifier } from '../types';

/**
 * Get point on path at specific progress
 */
function getPathPoint(
  $path: SVGGeometryElement,
  totalLength: number,
  progress: number,
  lookup: number,
  shouldClamp: boolean
): DOMPoint {
  const point = progress + lookup;
  const pointOnPath = shouldClamp
    ? Math.max(0, Math.min(point, totalLength))
    : (point % totalLength + totalLength) % totalLength;
  return $path.getPointAtLength(pointOnPath);
}

/**
 * Get path progress function for specific property
 */
function getPathProgress(
  $path: SVGGeometryElement,
  pathProperty: 'x' | 'y' | 'a',
  offset: number = 0
): FunctionValue {
  return ($el: Element & { [isSvgSymbol]?: boolean }) => {
    const totalLength = +$path.getTotalLength();
    const inSvg = $el[isSvgSymbol];
    const ctm = $path.getCTM();
    const shouldClamp = offset === 0;

    const result: TweenObjectValue = {
      from: 0,
      to: totalLength,
      modifier: ((progress: number) => {
        const offsetLength = offset * totalLength;
        const newProgress = progress + offsetLength;
        if (pathProperty === 'a') {
          const p0 = getPathPoint($path, totalLength, newProgress, -1, shouldClamp);
          const p1 = getPathPoint($path, totalLength, newProgress, +1, shouldClamp);
          return atan2(p1.y - p0.y, p1.x - p0.x) * 180 / PI;
        } else {
          const p = getPathPoint($path, totalLength, newProgress, 0, shouldClamp);
          return pathProperty === 'x'
            ? inSvg || !ctm ? p.x : p.x * ctm.a + p.y * ctm.c + ctm.e
            : inSvg || !ctm ? p.y : p.x * ctm.b + p.y * ctm.d + ctm.f;
        }
      }) as TweenModifier
    };
    return result;
  };
}

export interface MotionPathResult {
  translateX: FunctionValue;
  translateY: FunctionValue;
  rotate: FunctionValue;
}

/**
 * Create motion path animation properties
 */
export function createMotionPath(path: TargetsParam, offset: number = 0): MotionPathResult | undefined {
  const $path = getPath(path);
  if (!$path) return undefined;
  return {
    translateX: getPathProgress($path, 'x', offset),
    translateY: getPathProgress($path, 'y', offset),
    rotate: getPathProgress($path, 'a', offset),
  };
}
