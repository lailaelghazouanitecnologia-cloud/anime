// Core - Styles

import {
  TweenType,
  shortTransforms,
  isDomSymbol,
  transformsSymbol,
  emptyString,
  transformsFragmentStrings,
} from './consts';
import { forEachChildren, isNil, isSvg, toLowerCase } from './helpers';
import type { Target, DOMTarget, Renderable, Tween } from '../types';

const propertyNamesCache: Record<string, string> = {};

export const sanitizePropertyName = (
  propertyName: string,
  target: Target,
  tweenType: TweenType
): string => {
  if (tweenType === TweenType.TRANSFORM) {
    const t = shortTransforms.get(propertyName);
    return t ? t : propertyName;
  } else if (
    tweenType === TweenType.CSS ||
    (tweenType === TweenType.ATTRIBUTE && isSvg(target) && propertyName in (target as DOMTarget).style)
  ) {
    const cachedPropertyName = propertyNamesCache[propertyName];
    if (cachedPropertyName) {
      return cachedPropertyName;
    } else {
      const lowerCaseName = propertyName ? toLowerCase(propertyName) : propertyName;
      propertyNamesCache[propertyName] = lowerCaseName;
      return lowerCaseName;
    }
  } else {
    return propertyName;
  }
};

interface RenderableWithChildren extends Renderable {
  _hasChildren?: boolean;
  targets?: DOMTarget[];
}

export const cleanInlineStyles = <T extends Renderable>(renderable: T): T => {
  const r = renderable as RenderableWithChildren;

  if (r._hasChildren) {
    forEachChildren(r, (child) => cleanInlineStyles(child as Renderable), true);
  } else {
    const animation = r;
    animation.pause();

    forEachChildren(animation, (tweenChild) => {
      const tween = tweenChild as unknown as Tween;
      const tweenProperty = tween.property;
      const tweenTarget = tween.target;

      if ((tweenTarget as Record<symbol, boolean>)[isDomSymbol]) {
        const targetStyle = (tweenTarget as DOMTarget).style;
        const originalInlinedValue = tween._inlineValue;
        const tweenHadNoInlineValue = isNil(originalInlinedValue) || originalInlinedValue === emptyString;

        if (tween._tweenType === TweenType.TRANSFORM) {
          const cachedTransforms = (tweenTarget as unknown as Record<symbol, Record<string, string>>)[transformsSymbol];

          if (tweenHadNoInlineValue) {
            delete cachedTransforms[tweenProperty];
          } else {
            cachedTransforms[tweenProperty] = originalInlinedValue;
          }

          if (tween._renderTransforms) {
            if (!Object.keys(cachedTransforms).length) {
              targetStyle.removeProperty('transform');
            } else {
              let str = emptyString;
              for (const key in cachedTransforms) {
                str += (transformsFragmentStrings as Record<string, string>)[key] + cachedTransforms[key] + ') ';
              }
              targetStyle.transform = str;
            }
          }
        } else {
          if (tweenHadNoInlineValue) {
            targetStyle.removeProperty(toLowerCase(tweenProperty));
          } else {
            (targetStyle as unknown as Record<string, string>)[tweenProperty] = originalInlinedValue;
          }
        }

        if (animation._tail === (tween as unknown as Renderable)) {
          r.targets?.forEach((t) => {
            if (t.getAttribute && t.getAttribute('style') === emptyString) {
              t.removeAttribute('style');
            }
          });
        }
      }
    });
  }

  return renderable;
};
