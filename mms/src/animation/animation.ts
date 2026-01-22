// Animation - JSAnimation class

import {
  K,
  minValue,
  TweenType,
  ValueType,
  CompositionType,
  isDomSymbol,
} from '../core/consts';
import {
  mergeObjects,
  cloneArray,
  isArr,
  isObj,
  isUnd,
  isKey,
  addChild,
  forEachChildren,
  clampInfinity,
  normalizeTime,
  isNum,
  round,
  isNil,
  isFnc,
  isStr,
} from '../core/helpers';
import { globals } from '../core/globals';
import { registerTargets } from '../core/targets';
import {
  getRelativeValue,
  getFunctionValue,
  getOriginalAnimatableValue,
  getTweenType,
  setValue,
  decomposeRawValue,
  decomposeTweenValue,
  decomposedOriginalValue,
  createDecomposedValueTargetObject,
} from '../core/values';
import { sanitizePropertyName, cleanInlineStyles } from '../core/styles';
import { convertValueUnit } from '../core/units';
import { parseEase } from '../easings/eases/parser';
import { Timer } from '../timer/timer';
import { composeTween, getTweenSiblings, overrideTween } from './composition';
import { additive } from './additive';
import type {
  Tween,
  TweenKeyValue,
  TweenParamsOptions,
  TweenValues,
  DurationKeyframes,
  PercentageKeyframes,
  AnimationParams,
  TweenPropValue,
  ArraySyntaxValue,
  TargetsParam,
  TimerParams,
  TweenParamValue,
  DOMTarget,
  TargetsArray,
  Callback,
  EasingFunction,
  TweenDecomposedValue,
} from '../types';
import type { Spring } from '../easings/spring';

// Forward declaration for Timeline type to avoid circular imports
interface Timeline extends Timer {
  defaults: TimerParams;
  _offset: number;
}

// Defines decomposed values target objects only once and mutate their properties later to avoid GC
const fromTargetObject = createDecomposedValueTargetObject();
const toTargetObject = createDecomposedValueTargetObject();
const inlineStylesStore: Record<string, string | null> = {};
const toFunctionStore: { func: (() => TweenParamValue) | null } = { func: null };
const fromFunctionStore: { func: (() => TweenParamValue) | null } = { func: null };
const keyframesTargetArray: [TweenKeyValue | TweenParamValue | null] = [null];
const fastSetValuesArray: [TweenParamValue | null, TweenParamValue | null] = [null, null];
const keyObjectTarget: TweenKeyValue = { to: null };

let tweenId = 0;
let JSAnimationId = 0;
let keyframes: Array<TweenKeyValue | TweenParamValue>;
let key: TweenParamsOptions & TweenValues;

function generateKeyframes(keyframes: DurationKeyframes | PercentageKeyframes, parameters: AnimationParams): AnimationParams {
  const properties: AnimationParams = {};
  if (isArr(keyframes)) {
    const propertyNames = ([] as string[]).concat(...(keyframes as DurationKeyframes).map(key => Object.keys(key))).filter(isKey);
    for (let i = 0, l = propertyNames.length; i < l; i++) {
      const propName = propertyNames[i];
      const propArray = (keyframes as DurationKeyframes).map(key => {
        const newKey: TweenKeyValue = {};
        for (const p in key) {
          const keyValue = key[p as keyof typeof key] as TweenPropValue;
          if (isKey(p)) {
            if (p === propName) {
              newKey.to = keyValue;
            }
          } else {
            (newKey as Record<string, unknown>)[p] = keyValue;
          }
        }
        return newKey;
      });
      (properties as Record<string, ArraySyntaxValue>)[propName] = propArray as ArraySyntaxValue;
    }
  } else {
    const totalDuration = setValue(parameters.duration, globals.defaults.duration) as number;
    const keys = Object.keys(keyframes)
      .map(key => ({ o: parseFloat(key) / 100, p: (keyframes as PercentageKeyframes)[key] }))
      .sort((a, b) => a.o - b.o);
    keys.forEach(key => {
      const offset = key.o;
      const prop = key.p;
      for (const name in prop) {
        if (isKey(name)) {
          let propArray = (properties as Record<string, TweenKeyValue[]>)[name];
          if (!propArray) propArray = (properties as Record<string, TweenKeyValue[]>)[name] = [];
          const duration = offset * totalDuration;
          const length = propArray.length;
          const prevKey = propArray[length - 1];
          const keyObj: TweenKeyValue = { to: prop[name] };
          let durProgress = 0;
          for (let i = 0; i < length; i++) {
            durProgress += propArray[i].duration as number;
          }
          if (length === 1) {
            keyObj.from = prevKey.to;
          }
          if (prop.ease) {
            keyObj.ease = prop.ease;
          }
          keyObj.duration = duration - (length ? durProgress : 0);
          propArray.push(keyObj);
        }
      }
    });

    for (const name in properties) {
      const propArray = (properties as Record<string, TweenKeyValue[]>)[name];
      let prevEase: TweenKeyValue['ease'];
      for (let i = 0, l = propArray.length; i < l; i++) {
        const prop = propArray[i];
        const currentEase = prop.ease;
        prop.ease = prevEase ? prevEase : undefined;
        prevEase = currentEase;
      }
      if (!propArray[0].duration) {
        propArray.shift();
      }
    }
  }

  return properties;
}

export class JSAnimation extends Timer {
  targets: TargetsArray;
  onRender: Callback<this>;
  _ease: EasingFunction | null;

  constructor(
    targets: TargetsParam,
    parameters: AnimationParams,
    parent?: Timeline | null,
    parentPosition?: number,
    fastSet: boolean = false,
    index: number = 0,
    length: number = 0
  ) {
    super(parameters as TimerParams, parent as Timeline | null, parentPosition);

    ++JSAnimationId;

    const parsedTargets = registerTargets(targets);
    const targetsLength = parsedTargets.length;

    // If the parameters object contains a "keyframes" property, convert all the keyframes values to regular properties
    const kfParams = parameters.keyframes;
    const params = kfParams ? mergeObjects(generateKeyframes(kfParams as DurationKeyframes, parameters), parameters) as AnimationParams : parameters;

    const {
      id,
      delay,
      duration,
      ease,
      playbackEase,
      modifier,
      composition,
      onRender,
    } = params;

    const animDefaults = parent ? parent.defaults : globals.defaults;
    const animEase = setValue(ease, animDefaults.ease);
    const animPlaybackEase = setValue(playbackEase, animDefaults.playbackEase);
    const parsedAnimPlaybackEase = animPlaybackEase ? parseEase(animPlaybackEase) : null;
    const hasSpring = !isUnd((animEase as Spring)?.ease);
    const tEasing = hasSpring ? (animEase as Spring).ease : setValue(ease, parsedAnimPlaybackEase ? 'linear' : animDefaults.ease);
    const tDuration = hasSpring ? (animEase as Spring).settlingDuration : setValue(duration, animDefaults.duration);
    const tDelay = setValue(delay, animDefaults.delay);
    const tModifier = modifier || animDefaults.modifier;
    const tComposition = isUnd(composition) && targetsLength >= K ? CompositionType.none : !isUnd(composition) ? composition : animDefaults.composition;
    const absoluteOffsetTime = this._offset + (parent ? parent._offset : 0);
    if (hasSpring) (animEase as Spring).parent = this;

    let iterationDuration = NaN;
    let iterationDelay = NaN;
    let animationAnimationLength = 0;
    let shouldTriggerRender = 0;

    for (let targetIndex = 0; targetIndex < targetsLength; targetIndex++) {
      const target = parsedTargets[targetIndex];
      const ti = index || targetIndex;
      const tl = length || targetsLength;

      let lastTransformGroupIndex = NaN;
      let lastTransformGroupLength = NaN;

      for (const p in params) {
        if (isKey(p)) {
          const tweenType = getTweenType(target, p);
          const propName = sanitizePropertyName(p, target, tweenType);

          let propValue = (params as Record<string, unknown>)[p];
          const isPropValueArray = isArr(propValue);

          if (fastSet && !isPropValueArray) {
            fastSetValuesArray[0] = propValue as TweenParamValue;
            fastSetValuesArray[1] = propValue as TweenParamValue;
            propValue = fastSetValuesArray;
          }

          if (isPropValueArray) {
            const arrayLength = (propValue as unknown[]).length;
            const isNotObjectValue = !isObj((propValue as unknown[])[0]);
            if (arrayLength === 2 && isNotObjectValue) {
              keyObjectTarget.to = propValue as TweenParamValue;
              keyframesTargetArray[0] = keyObjectTarget;
              keyframes = keyframesTargetArray as Array<TweenKeyValue>;
            } else if (arrayLength > 2 && isNotObjectValue) {
              keyframes = [];
              (propValue as number[]).forEach((v, i) => {
                if (!i) {
                  fastSetValuesArray[0] = v;
                } else if (i === 1) {
                  fastSetValuesArray[1] = v;
                  keyframes.push(fastSetValuesArray as unknown as TweenParamValue);
                } else {
                  keyframes.push(v);
                }
              });
            } else {
              keyframes = propValue as Array<TweenKeyValue>;
            }
          } else {
            keyframesTargetArray[0] = propValue as TweenParamValue;
            keyframes = keyframesTargetArray as Array<TweenParamValue>;
          }

          let siblings: ReturnType<typeof getTweenSiblings> | null = null;
          let prevTween: Tween | null = null;
          let firstTweenChangeStartTime = NaN;
          let lastTweenChangeEndTime = 0;
          let tweenIndex = 0;

          for (let l = keyframes.length; tweenIndex < l; tweenIndex++) {
            const keyframe = keyframes[tweenIndex];

            if (isObj(keyframe)) {
              key = keyframe as TweenParamsOptions & TweenValues;
            } else {
              keyObjectTarget.to = keyframe as TweenParamValue;
              key = keyObjectTarget as TweenParamsOptions & TweenValues;
            }

            toFunctionStore.func = null;
            fromFunctionStore.func = null;

            const computedToValue = getFunctionValue(key.to, target, ti, tl, toFunctionStore);

            let tweenToValue: TweenParamValue;
            if (isObj(computedToValue) && !isUnd((computedToValue as TweenKeyValue).to)) {
              key = computedToValue as TweenParamsOptions & TweenValues;
              tweenToValue = (computedToValue as TweenKeyValue).to as TweenParamValue;
            } else {
              tweenToValue = computedToValue as TweenParamValue;
            }
            const tweenFromValue = getFunctionValue(key.from, target, ti, tl);
            const easeToParse = key.ease || tEasing;

            const easeFunctionResult = getFunctionValue(easeToParse, target, ti, tl);
            const keyEasing = isFnc(easeFunctionResult) || isStr(easeFunctionResult) ? easeFunctionResult : easeToParse;

            const keyHasSpring = !isUnd(keyEasing) && !isUnd((keyEasing as Spring)?.ease);
            const tweenEasing = keyHasSpring ? (keyEasing as Spring).ease : keyEasing;
            const tweenDuration = keyHasSpring ? (keyEasing as Spring).settlingDuration : getFunctionValue(setValue(key.duration, (l > 1 ? getFunctionValue(tDuration, target, ti, tl) as number / l : tDuration)), target, ti, tl);
            const tweenDelay = getFunctionValue(setValue(key.delay, (!tweenIndex ? tDelay : 0)), target, ti, tl);
            const computedComposition = getFunctionValue(setValue(key.composition, tComposition), target, ti, tl);
            const tweenComposition = isNum(computedComposition) ? computedComposition as CompositionType : CompositionType[computedComposition as keyof typeof CompositionType];
            const tweenModifier = key.modifier || tModifier;
            const hasFromvalue = !isUnd(tweenFromValue);
            const hasToValue = !isUnd(tweenToValue);
            const isFromToArray = isArr(tweenToValue);
            const isFromToValue = isFromToArray || (hasFromvalue && hasToValue);
            const tweenStartTime = prevTween ? lastTweenChangeEndTime + (tweenDelay as number) : (tweenDelay as number);
            const absoluteStartTime = round(absoluteOffsetTime + tweenStartTime, 12);

            if (!shouldTriggerRender && (hasFromvalue || isFromToArray)) shouldTriggerRender = 1;

            let prevSibling: Tween | null = prevTween;

            if (tweenComposition !== CompositionType.none) {
              if (!siblings) siblings = getTweenSiblings(target, propName!);
              let nextSibling = siblings._head;
              while (nextSibling && !nextSibling._isOverridden && nextSibling._absoluteStartTime <= absoluteStartTime) {
                prevSibling = nextSibling;
                nextSibling = nextSibling._nextRep;
                if (nextSibling && nextSibling._absoluteStartTime >= absoluteStartTime) {
                  while (nextSibling) {
                    overrideTween(nextSibling);
                    nextSibling = nextSibling._nextRep;
                  }
                }
              }
            }

            // Decompose values
            if (isFromToValue) {
              decomposeRawValue(isFromToArray ? getFunctionValue((tweenToValue as unknown[])[0], target, ti, tl, fromFunctionStore) : tweenFromValue, fromTargetObject);
              decomposeRawValue(isFromToArray ? getFunctionValue((tweenToValue as unknown[])[1], target, ti, tl, toFunctionStore) : tweenToValue, toTargetObject);
              const originalValue = getOriginalAnimatableValue(target, propName!, tweenType, inlineStylesStore);
              if (fromTargetObject.t === ValueType.NUMBER) {
                if (prevSibling) {
                  if (prevSibling._valueType === ValueType.UNIT) {
                    fromTargetObject.t = ValueType.UNIT;
                    fromTargetObject.u = prevSibling._unit;
                  }
                } else {
                  decomposeRawValue(originalValue, decomposedOriginalValue);
                  if (decomposedOriginalValue.t === ValueType.UNIT) {
                    fromTargetObject.t = ValueType.UNIT;
                    fromTargetObject.u = decomposedOriginalValue.u;
                  }
                }
              }
            } else {
              if (hasToValue) {
                decomposeRawValue(tweenToValue, toTargetObject);
              } else {
                if (prevTween) {
                  decomposeTweenValue(prevTween, toTargetObject);
                } else {
                  decomposeRawValue(parent && prevSibling && (prevSibling.parent as JSAnimation).parent === parent ? prevSibling._value :
                    getOriginalAnimatableValue(target, propName!, tweenType, inlineStylesStore), toTargetObject);
                }
              }
              if (hasFromvalue) {
                decomposeRawValue(tweenFromValue, fromTargetObject);
              } else {
                if (prevTween) {
                  decomposeTweenValue(prevTween, fromTargetObject);
                } else {
                  decomposeRawValue(parent && prevSibling && (prevSibling.parent as JSAnimation).parent === parent ? prevSibling._value :
                    getOriginalAnimatableValue(target, propName!, tweenType, inlineStylesStore), fromTargetObject);
                }
              }
            }

            // Apply operators
            if (fromTargetObject.o) {
              fromTargetObject.n = getRelativeValue(
                !prevSibling ? decomposeRawValue(
                  getOriginalAnimatableValue(target, propName!, tweenType, inlineStylesStore),
                  decomposedOriginalValue
                ).n : prevSibling._toNumber,
                fromTargetObject.n,
                fromTargetObject.o
              );
            }

            if (toTargetObject.o) {
              toTargetObject.n = getRelativeValue(fromTargetObject.n, toTargetObject.n, toTargetObject.o);
            }

            // Values homogenization in cases of type difference between "from" and "to"
            if (fromTargetObject.t !== toTargetObject.t) {
              if (fromTargetObject.t === ValueType.COMPLEX || toTargetObject.t === ValueType.COMPLEX) {
                const complexValue = fromTargetObject.t === ValueType.COMPLEX ? fromTargetObject : toTargetObject;
                const notComplexValue = fromTargetObject.t === ValueType.COMPLEX ? toTargetObject : fromTargetObject;
                notComplexValue.t = ValueType.COMPLEX;
                notComplexValue.s = cloneArray(complexValue.s);
                notComplexValue.d = complexValue.d!.map(() => notComplexValue.n);
              } else if (fromTargetObject.t === ValueType.UNIT || toTargetObject.t === ValueType.UNIT) {
                const unitValue = fromTargetObject.t === ValueType.UNIT ? fromTargetObject : toTargetObject;
                const notUnitValue = fromTargetObject.t === ValueType.UNIT ? toTargetObject : fromTargetObject;
                notUnitValue.t = ValueType.UNIT;
                notUnitValue.u = unitValue.u;
              } else if (fromTargetObject.t === ValueType.COLOR || toTargetObject.t === ValueType.COLOR) {
                const colorValue = fromTargetObject.t === ValueType.COLOR ? fromTargetObject : toTargetObject;
                const notColorValue = fromTargetObject.t === ValueType.COLOR ? toTargetObject : fromTargetObject;
                notColorValue.t = ValueType.COLOR;
                notColorValue.s = colorValue.s;
                notColorValue.d = [0, 0, 0, 1];
              }
            }

            // Unit conversion
            if (fromTargetObject.u !== toTargetObject.u) {
              let valueToConvert = toTargetObject.u ? fromTargetObject : toTargetObject;
              valueToConvert = convertValueUnit(target as DOMTarget, valueToConvert, toTargetObject.u ? toTargetObject.u : fromTargetObject.u!, false);
            }

            // Fill in non existing complex values
            if (toTargetObject.d && fromTargetObject.d && (toTargetObject.d.length !== fromTargetObject.d.length)) {
              const longestValue = fromTargetObject.d.length > toTargetObject.d.length ? fromTargetObject : toTargetObject;
              const shortestValue = longestValue === fromTargetObject ? toTargetObject : fromTargetObject;
              shortestValue.d = longestValue.d.map((_, i) => isUnd(shortestValue.d![i]) ? 0 : shortestValue.d![i]);
              shortestValue.s = cloneArray(longestValue.s);
            }

            // Tween factory
            const tweenUpdateDuration = round(+(tweenDuration as number) || minValue, 12);
            let inlineValue = inlineStylesStore[propName!];
            if (!isNil(inlineValue)) inlineStylesStore[propName!] = null;

            const tween: Tween = {
              parent: this,
              id: tweenId++,
              property: propName!,
              target: target,
              _value: null,
              _toFunc: toFunctionStore.func,
              _fromFunc: fromFunctionStore.func,
              _ease: parseEase(tweenEasing as Parameters<typeof parseEase>[0]),
              _fromNumbers: cloneArray(fromTargetObject.d),
              _toNumbers: cloneArray(toTargetObject.d),
              _strings: cloneArray(toTargetObject.s),
              _fromNumber: fromTargetObject.n,
              _toNumber: toTargetObject.n,
              _numbers: cloneArray(fromTargetObject.d),
              _number: fromTargetObject.n,
              _unit: toTargetObject.u,
              _modifier: tweenModifier as Tween['_modifier'],
              _currentTime: 0,
              _startTime: tweenStartTime,
              _delay: +(tweenDelay as number),
              _updateDuration: tweenUpdateDuration,
              _changeDuration: tweenUpdateDuration,
              _absoluteStartTime: absoluteStartTime,
              _tweenType: tweenType,
              _valueType: toTargetObject.t,
              _composition: tweenComposition,
              _isOverlapped: 0,
              _isOverridden: 0,
              _renderTransforms: 0,
              _inlineValue: inlineValue,
              _prevRep: null,
              _nextRep: null,
              _prevAdd: null,
              _nextAdd: null,
              _prev: null,
              _next: null,
            };

            if (tweenComposition !== CompositionType.none) {
              composeTween(tween, siblings!);
            }

            if (isNaN(firstTweenChangeStartTime)) {
              firstTweenChangeStartTime = tween._startTime;
            }
            lastTweenChangeEndTime = round(tweenStartTime + tweenUpdateDuration, 12);
            prevTween = tween;
            animationAnimationLength++;

            addChild(this, tween);
          }

          // Update animation timings with the added tweens properties
          if (isNaN(iterationDelay) || firstTweenChangeStartTime < iterationDelay) {
            iterationDelay = firstTweenChangeStartTime;
          }

          if (isNaN(iterationDuration) || lastTweenChangeEndTime > iterationDuration) {
            iterationDuration = lastTweenChangeEndTime;
          }

          if (tweenType === TweenType.TRANSFORM) {
            lastTransformGroupIndex = animationAnimationLength - tweenIndex;
            lastTransformGroupLength = animationAnimationLength;
          }
        }
      }

      // Set _renderTransforms to last transform property to correctly render the transforms list
      if (!isNaN(lastTransformGroupIndex)) {
        let i = 0;
        forEachChildren(this, (tween: Tween) => {
          if (i >= lastTransformGroupIndex && i < lastTransformGroupLength) {
            tween._renderTransforms = 1;
            if (tween._composition === CompositionType.blend) {
              forEachChildren(additive.animation!, (additiveTween: Tween) => {
                if (additiveTween.id === tween.id) {
                  additiveTween._renderTransforms = 1;
                }
              });
            }
          }
          i++;
        });
      }
    }

    if (!targetsLength) {
      console.warn(`No target found. Make sure the element you're trying to animate is accessible before creating your animation.`);
    }

    if (iterationDelay) {
      forEachChildren(this, (tween: Tween) => {
        if (!(tween._startTime - tween._delay)) {
          tween._delay -= iterationDelay;
        }
        tween._startTime -= iterationDelay;
      });
      iterationDuration -= iterationDelay;
    } else {
      iterationDelay = 0;
    }

    if (!iterationDuration) {
      iterationDuration = minValue;
      this.iterationCount = 0;
    }

    this.targets = parsedTargets;
    this.id = !isUnd(id) ? id! : JSAnimationId;
    this.duration = iterationDuration === minValue ? minValue : clampInfinity(((iterationDuration + this._loopDelay) * this.iterationCount) - this._loopDelay) || minValue;
    this.onRender = onRender || animDefaults.onRender!;
    this._ease = parsedAnimPlaybackEase;
    this._delay = iterationDelay;
    this.iterationDuration = iterationDuration;

    if (!this._autoplay && shouldTriggerRender) this.onRender(this);
  }

  stretch(newDuration: number): this {
    const currentDuration = this.duration;
    if (currentDuration === normalizeTime(newDuration)) return this;
    const timeScale = newDuration / currentDuration;
    forEachChildren(this, (tween: Tween) => {
      tween._updateDuration = normalizeTime(tween._updateDuration * timeScale);
      tween._changeDuration = normalizeTime(tween._changeDuration * timeScale);
      tween._currentTime *= timeScale;
      tween._startTime *= timeScale;
      tween._absoluteStartTime *= timeScale;
    });
    return super.stretch(newDuration);
  }

  refresh(): this {
    forEachChildren(this, (tween: Tween) => {
      const toFunc = tween._toFunc;
      const fromFunc = tween._fromFunc;
      if (toFunc || fromFunc) {
        if (fromFunc) {
          decomposeRawValue(fromFunc(), fromTargetObject);
          if (fromTargetObject.u !== tween._unit && (tween.target as Record<symbol, boolean>)[isDomSymbol]) {
            convertValueUnit(tween.target as DOMTarget, fromTargetObject, tween._unit!, true);
          }
          tween._fromNumbers = cloneArray(fromTargetObject.d);
          tween._fromNumber = fromTargetObject.n;
        } else if (toFunc) {
          decomposeRawValue(getOriginalAnimatableValue(tween.target, tween.property, tween._tweenType), decomposedOriginalValue);
          tween._fromNumbers = cloneArray(decomposedOriginalValue.d);
          tween._fromNumber = decomposedOriginalValue.n;
        }
        if (toFunc) {
          decomposeRawValue(toFunc(), toTargetObject);
          tween._toNumbers = cloneArray(toTargetObject.d);
          tween._strings = cloneArray(toTargetObject.s);
          tween._toNumber = toTargetObject.o ? getRelativeValue(tween._fromNumber, toTargetObject.n, toTargetObject.o) : toTargetObject.n;
        }
      }
    });
    if (this.duration === minValue) this.restart();
    return this;
  }

  revert(): this {
    super.revert();
    return cleanInlineStyles(this);
  }

  then<T extends this & { then: null }>(callback?: Callback<T>): Promise<this> {
    return super.then(callback);
  }
}

export function animate(targets: TargetsParam, parameters: AnimationParams): JSAnimation {
  return new JSAnimation(targets, parameters, null, 0, false).init() as JSAnimation;
}
