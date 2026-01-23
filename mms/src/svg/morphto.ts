// SVG - Morph To

import { morphPointsSymbol } from '../core/consts';
import { round } from '../core/helpers';
import { getPath } from './helpers';
import type { TargetsParam, FunctionValue } from '../types';

/**
 * Create morph animation between two SVG paths
 */
export function morphTo(path2: TargetsParam, precision: number = 0.33): FunctionValue {
  return ($path1: Element) => {
    const tagName1 = ($path1.tagName || '').toLowerCase();
    if (!tagName1.match(/^(path|polygon|polyline)$/)) {
      throw new Error(`Can't morph a <${$path1.tagName}> SVG element. Use <path>, <polygon> or <polyline>.`);
    }

    const $path2 = getPath(path2) as SVGGeometryElement;
    if (!$path2) {
      throw new Error("Can't morph to an invalid target. 'path2' must resolve to an existing <path>, <polygon> or <polyline> SVG element.");
    }

    const tagName2 = ($path2.tagName || '').toLowerCase();
    if (!tagName2.match(/^(path|polygon|polyline)$/)) {
      throw new Error(`Can't morph a <${$path2.tagName}> SVG element. Use <path>, <polygon> or <polyline>.`);
    }

    const isPath = $path1.tagName === 'path';
    const separator = isPath ? ' ' : ',';
    const previousPoints = ($path1 as Element & { [morphPointsSymbol]?: string })[morphPointsSymbol];
    if (previousPoints) $path1.setAttribute(isPath ? 'd' : 'points', previousPoints);

    let v1 = '', v2 = '';

    if (!precision) {
      v1 = $path1.getAttribute(isPath ? 'd' : 'points') || '';
      v2 = $path2.getAttribute(isPath ? 'd' : 'points') || '';
    } else {
      const length1 = ($path1 as SVGGeometryElement).getTotalLength();
      const length2 = $path2.getTotalLength();
      const maxPoints = Math.max(Math.ceil(length1 * precision), Math.ceil(length2 * precision));
      for (let i = 0; i < maxPoints; i++) {
        const t = i / (maxPoints - 1);
        const pointOnPath1 = ($path1 as SVGGeometryElement).getPointAtLength(length1 * t);
        const pointOnPath2 = $path2.getPointAtLength(length2 * t);
        const prefix = isPath ? (i === 0 ? 'M' : 'L') : '';
        v1 += prefix + round(pointOnPath1.x, 3) + separator + pointOnPath1.y + ' ';
        v2 += prefix + round(pointOnPath2.x, 3) + separator + pointOnPath2.y + ' ';
      }
    }

    ($path1 as Element & { [morphPointsSymbol]?: string })[morphPointsSymbol] = v2;

    return [v1, v2];
  };
}
