// Core - Values

import {
  shortTransforms,
  validTransforms,
  TweenType,
  ValueType,
  digitWithExponentRgx,
  unitsExecRgx,
  isDomSymbol,
  isSvgSymbol,
  proxyTargetSymbol,
  cssVarPrefix,
  cssVariableMatchRgx,
  emptyString,
} from './consts';
import {
  stringStartsWith,
  cloneArray,
  isFnc,
  isUnd,
  isCol,
  isValidSVGAttribute,
  isStr,
} from './helpers';
import { parseInlineTransforms } from './transforms';
import { convertColorStringValuesToRgbaArray } from './colors';
import type { Target, DOMTarget, Tween, TweenPropValue, TweenDecomposedValue } from '../types';

export const setValue = <T, D>(targetValue: T | undefined, defaultValue: D): T | D => {
  return isUnd(targetValue) ? defaultValue : targetValue;
};

export const getFunctionValue = (
  value: TweenPropValue,
  target: Target,
  index: number,
  total: number,
  store?: { func?: () => unknown }
): unknown => {
  let func: (() => unknown) | undefined;

  if (isFnc(value)) {
    func = () => {
      const computed = (value as Function)(target, index, total);
      return !isNaN(+computed) ? +computed : computed || 0;
    };
  } else if (isStr(value) && stringStartsWith(value, cssVarPrefix)) {
    func = () => {
      const match = value.match(cssVariableMatchRgx);
      if (!match) return 0;
      const cssVarName = match[1];
      const fallbackValue = match[2];
      let computed = getComputedStyle(target as HTMLElement)?.getPropertyValue(cssVarName);
      if ((!computed || computed.trim() === emptyString) && fallbackValue) {
        computed = fallbackValue.trim();
      }
      return computed || 0;
    };
  } else {
    return value;
  }

  if (store) store.func = func;
  return func();
};

export const getTweenType = (target: Target, prop: string): TweenType => {
  const targetWithSymbols = target as Target & Record<symbol, boolean>;

  return !targetWithSymbols[isDomSymbol]
    ? TweenType.OBJECT
    : targetWithSymbols[isSvgSymbol] && isValidSVGAttribute(target, prop)
      ? TweenType.ATTRIBUTE
      : validTransforms.includes(prop as (typeof validTransforms)[number]) || shortTransforms.get(prop)
        ? TweenType.TRANSFORM
        : stringStartsWith(prop, '--')
          ? TweenType.CSS_VAR
          : prop in (target as DOMTarget).style
            ? TweenType.CSS
            : prop in target
              ? TweenType.OBJECT
              : TweenType.ATTRIBUTE;
};

const getCSSValue = (
  target: DOMTarget,
  propName: string,
  animationInlineStyles?: Record<string, string>
): string => {
  const inlineStyles = (target.style as unknown as Record<string, string>)[propName];
  if (inlineStyles && animationInlineStyles) {
    animationInlineStyles[propName] = inlineStyles;
  }
  const proxyTarget = (target as unknown as Record<symbol, DOMTarget>)[proxyTargetSymbol];
  const value = inlineStyles || getComputedStyle(proxyTarget || target).getPropertyValue(propName);
  return value === 'auto' ? '0' : value;
};

export const getOriginalAnimatableValue = (
  target: Target,
  propName: string,
  tweenType?: TweenType,
  animationInlineStyles?: Record<string, string>
): string | number => {
  const type = !isUnd(tweenType) ? tweenType : getTweenType(target, propName);

  return type === TweenType.OBJECT
    ? (target as Record<string, unknown>)[propName] as string | number || 0
    : type === TweenType.ATTRIBUTE
      ? (target as DOMTarget).getAttribute(propName) || ''
      : type === TweenType.TRANSFORM
        ? parseInlineTransforms(target as DOMTarget, propName, animationInlineStyles)
        : type === TweenType.CSS_VAR
          ? getCSSValue(target as DOMTarget, propName, animationInlineStyles).trimStart()
          : getCSSValue(target as DOMTarget, propName, animationInlineStyles);
};

export const getRelativeValue = (x: number, y: number, operator: string): number => {
  return operator === '-' ? x - y : operator === '+' ? x + y : x * y;
};

export const createDecomposedValueTargetObject = (): TweenDecomposedValue => {
  return {
    t: ValueType.NUMBER,
    n: 0,
    u: '',
    o: '',
    d: [],
    s: [],
  };
};

export const decomposeRawValue = (
  rawValue: string | number,
  targetObject: TweenDecomposedValue
): TweenDecomposedValue => {
  targetObject.t = ValueType.NUMBER;
  targetObject.n = 0;
  targetObject.u = '';
  targetObject.o = '';
  targetObject.d = [];
  targetObject.s = [];

  if (!rawValue) return targetObject;

  const num = +rawValue;
  if (!isNaN(num)) {
    targetObject.n = num;
    return targetObject;
  } else {
    let str = rawValue as string;

    if (str[1] === '=') {
      targetObject.o = str[0];
      str = str.slice(2);
    }

    const unitMatch = str.includes(' ') ? null : unitsExecRgx.exec(str);
    if (unitMatch) {
      targetObject.t = ValueType.UNIT;
      targetObject.n = +unitMatch[1];
      targetObject.u = unitMatch[2];
      return targetObject;
    } else if (targetObject.o) {
      targetObject.n = +str;
      return targetObject;
    } else if (isCol(str)) {
      targetObject.t = ValueType.COLOR;
      targetObject.d = convertColorStringValuesToRgbaArray(str);
      return targetObject;
    } else {
      const matchedNumbers = str.match(digitWithExponentRgx);
      targetObject.t = ValueType.COMPLEX;
      targetObject.d = matchedNumbers ? matchedNumbers.map(Number) : [];
      targetObject.s = str.split(digitWithExponentRgx) || [];
      return targetObject;
    }
  }
};

export const decomposeTweenValue = (
  tween: Tween,
  targetObject: TweenDecomposedValue
): TweenDecomposedValue => {
  targetObject.t = tween._valueType;
  targetObject.n = tween._toNumber;
  targetObject.u = tween._unit;
  targetObject.o = '';
  targetObject.d = cloneArray(tween._toNumbers);
  targetObject.s = cloneArray(tween._strings);
  return targetObject;
};

export const decomposedOriginalValue = createDecomposedValueTargetObject();
