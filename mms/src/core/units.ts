// Core - Unidades

import { doc, ValueType } from './consts';
import { isUnd, PI } from './helpers';
import type { DOMTarget, TweenDecomposedValue } from '../types';

const angleUnitsMap: Record<string, number> = { deg: 1, rad: 180 / PI, turn: 360 };
const convertedValuesCache: Record<string, number> = {};

export const convertValueUnit = (
  el: DOMTarget,
  decomposedValue: TweenDecomposedValue,
  unit: string,
  force = false
): TweenDecomposedValue => {
  const currentUnit = decomposedValue.u;
  const currentNumber = decomposedValue.n;

  if (decomposedValue.t === ValueType.UNIT && currentUnit === unit) {
    return decomposedValue;
  }

  const cachedKey = currentNumber + currentUnit + unit;
  const cached = convertedValuesCache[cachedKey];

  if (!isUnd(cached) && !force) {
    decomposedValue.n = cached;
  } else {
    let convertedValue: number;

    if (currentUnit in angleUnitsMap) {
      convertedValue = (currentNumber * angleUnitsMap[currentUnit]) / angleUnitsMap[unit];
    } else {
      const baseline = 100;
      const tempEl = el.cloneNode() as DOMTarget;
      const parentNode = el.parentNode;
      const parentEl = parentNode && parentNode !== doc ? parentNode : doc!.body;
      parentEl.appendChild(tempEl);
      const elStyle = (tempEl as HTMLElement).style;
      elStyle.width = baseline + currentUnit;
      const currentUnitWidth = (tempEl as HTMLElement).offsetWidth || baseline;
      elStyle.width = baseline + unit;
      const newUnitWidth = (tempEl as HTMLElement).offsetWidth || baseline;
      const factor = currentUnitWidth / newUnitWidth;
      parentEl.removeChild(tempEl);
      convertedValue = factor * currentNumber;
    }

    decomposedValue.n = convertedValue;
    convertedValuesCache[cachedKey] = convertedValue;
  }

  decomposedValue.t = ValueType.UNIT;
  decomposedValue.u = unit;
  return decomposedValue;
};
