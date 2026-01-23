// SVG - Drawable

import { K, proxyTargetSymbol } from '../core/consts';
import { sqrt, isFnc } from '../core/helpers';
import { parseTargets } from '../core/targets';
import type { TargetsParam, DrawableSVGGeometry } from '../types';

/**
 * Get scale factor from SVG element's CTM
 */
function getScaleFactor($el?: SVGGeometryElement): number {
  let scaleFactor = 1;
  if ($el && $el.getCTM) {
    const ctm = $el.getCTM();
    if (ctm) {
      const scaleX = sqrt(ctm.a * ctm.a + ctm.b * ctm.b);
      const scaleY = sqrt(ctm.c * ctm.c + ctm.d * ctm.d);
      scaleFactor = (scaleX + scaleY) / 2;
    }
  }
  return scaleFactor;
}

/**
 * Creates a proxy that wraps an SVGGeometryElement and adds drawing functionality
 */
function createDrawableProxy($el: SVGGeometryElement, start: number, end: number): DrawableSVGGeometry {
  const pathLength = K;
  const computedStyles = getComputedStyle($el);
  const strokeLineCap = computedStyles.strokeLinecap;
  const $scalled = (computedStyles as CSSStyleDeclaration & { vectorEffect?: string }).vectorEffect === 'non-scaling-stroke' ? $el : null;
  let currentCap = strokeLineCap;

  const proxy = new Proxy($el, {
    get(target, property) {
      const value = (target as unknown as Record<string | symbol, unknown>)[property];
      if (property === proxyTargetSymbol) return target;
      if (property === 'setAttribute') {
        return (...args: [string, string]) => {
          if (args[0] === 'draw') {
            const value = args[1];
            const values = value.split(' ');
            const v1 = +values[0];
            const v2 = +values[1];
            const scaleFactor = getScaleFactor($scalled ?? undefined);
            const os = v1 * -pathLength * scaleFactor;
            const d1 = (v2 * pathLength * scaleFactor) + os;
            const d2 = (pathLength * scaleFactor +
                      ((v1 === 0 && v2 === 1) || (v1 === 1 && v2 === 0) ? 0 : 10 * scaleFactor) - d1);
            if (strokeLineCap !== 'butt') {
              const newCap = v1 === v2 ? 'butt' : strokeLineCap;
              if (currentCap !== newCap) {
                target.style.strokeLinecap = `${newCap}`;
                currentCap = newCap;
              }
            }
            target.setAttribute('stroke-dashoffset', `${os}`);
            target.setAttribute('stroke-dasharray', `${d1} ${d2}`);
          }
          return Reflect.apply(value as Function, target, args);
        };
      }

      if (isFnc(value)) {
        return (...args: unknown[]) => Reflect.apply(value as Function, target, args);
      } else {
        return value;
      }
    }
  });

  if ($el.getAttribute('pathLength') !== `${pathLength}`) {
    $el.setAttribute('pathLength', `${pathLength}`);
    (proxy as unknown as SVGGeometryElement).setAttribute('draw', `${start} ${end}`);
  }

  return proxy as unknown as DrawableSVGGeometry;
}

/**
 * Creates drawable proxies for multiple SVG elements
 */
export function createDrawable(selector: TargetsParam, start: number = 0, end: number = 0): DrawableSVGGeometry[] {
  const els = parseTargets(selector);
  return els.map($el => createDrawableProxy($el as SVGGeometryElement, start, end));
}
