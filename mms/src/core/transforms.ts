// Core - Transforms

import { transformsExecRgx, transformsSymbol } from './consts';
import { isUnd, stringStartsWith } from './helpers';
import type { DOMTarget } from '../types';

export const parseInlineTransforms = (
  target: DOMTarget,
  propName: string,
  animationInlineStyles?: Record<string, string>
): string => {
  const inlineTransforms = (target as HTMLElement).style.transform;
  let inlinedStylesPropertyValue: string | undefined;

  if (inlineTransforms) {
    const cachedTransforms = (target as unknown as Record<symbol, Record<string, string>>)[transformsSymbol];
    let t: RegExpExecArray | null;
    while ((t = transformsExecRgx.exec(inlineTransforms))) {
      const inlinePropertyName = t[1];
      const inlinePropertyValue = t[2].slice(1, -1);
      cachedTransforms[inlinePropertyName] = inlinePropertyValue;
      if (inlinePropertyName === propName) {
        inlinedStylesPropertyValue = inlinePropertyValue;
        if (animationInlineStyles) {
          animationInlineStyles[propName] = inlinePropertyValue;
        }
      }
    }
  }

  return inlineTransforms && !isUnd(inlinedStylesPropertyValue)
    ? inlinedStylesPropertyValue!
    : stringStartsWith(propName, 'scale')
      ? '1'
      : stringStartsWith(propName, 'rotate') || stringStartsWith(propName, 'skew')
        ? '0deg'
        : '0px';
};
