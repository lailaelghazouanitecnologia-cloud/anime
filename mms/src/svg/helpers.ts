// SVG - Helpers

import { isSvg } from '../core/helpers';
import { parseTargets } from '../core/targets';
import type { TargetsParam } from '../types';

/**
 * Get path element from selector
 */
export function getPath(path: TargetsParam): SVGGeometryElement | undefined {
  const parsedTargets = parseTargets(path);
  const $parsedSvg = parsedTargets[0] as SVGGeometryElement;
  if (!$parsedSvg || !isSvg($parsedSvg)) {
    console.warn(`${path} is not a valid SVGGeometryElement`);
    return undefined;
  }
  return $parsedSvg;
}
