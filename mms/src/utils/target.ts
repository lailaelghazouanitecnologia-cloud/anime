// Utils - Target

import { globals } from '../core/globals';
import { minValue, CompositionType, ValueType } from '../core/consts';
import { isUnd, round } from '../core/helpers';
import { parseTargets, registerTargets } from '../core/targets';
import { sanitizePropertyName } from '../core/styles';
import {
  setValue,
  getTweenType,
  getOriginalAnimatableValue,
  decomposeRawValue,
  decomposedOriginalValue,
} from '../core/values';
import { convertValueUnit } from '../core/units';
import { removeTargetsFromRenderable } from '../animation/composition';
import { JSAnimation } from '../animation/animation';
import type {
  Renderable,
  DOMTargetSelector,
  JSTargetsParam,
  DOMTargetsParam,
  TargetsParam,
  DOMTarget,
  AnimationParams,
  TargetsArray,
} from '../types';

export { registerTargets as $ };
export { cleanInlineStyles } from '../core/styles';

export function get(targetSelector: DOMTargetSelector, propName: string): string | undefined;
export function get(targetSelector: JSTargetsParam, propName: string): number | string | undefined;
export function get(targetSelector: DOMTargetsParam, propName: string, unit: string): string | undefined;
export function get(targetSelector: TargetsParam, propName: string, unit: boolean): number | undefined;
export function get(targetSelector: TargetsParam, propName: string, unit?: string | boolean): string | number | undefined {
  const targets = registerTargets(targetSelector);
  if (!targets.length) return;
  const [target] = targets;
  const tweenType = getTweenType(target, propName);
  const normalizePropName = sanitizePropertyName(propName, target, tweenType);
  const originalValue = getOriginalAnimatableValue(target, normalizePropName!);
  if (isUnd(unit)) {
    return originalValue as string | number;
  } else {
    decomposeRawValue(originalValue, decomposedOriginalValue);
    if (decomposedOriginalValue.t === ValueType.NUMBER || decomposedOriginalValue.t === ValueType.UNIT) {
      if (unit === false) {
        return decomposedOriginalValue.n;
      } else {
        const convertedValue = convertValueUnit(target as DOMTarget, decomposedOriginalValue, unit as string, false);
        return `${round(convertedValue.n, globals.precision)}${convertedValue.u}`;
      }
    }
  }
}

export function set(targets: TargetsParam, parameters: AnimationParams): JSAnimation | undefined {
  if (isUnd(parameters)) return;
  parameters.duration = minValue;
  parameters.composition = setValue(parameters.composition, CompositionType.none) as CompositionType;
  return new JSAnimation(targets, parameters, null, 0, true).resume() as JSAnimation;
}

export function remove(targets: TargetsParam, renderable?: Renderable, propertyName?: string): TargetsArray {
  const targetsArray = parseTargets(targets);
  // Note: WAAPI removal would be handled here if waapi module is ported
  removeTargetsFromRenderable(targetsArray, renderable, propertyName);
  return targetsArray;
}
