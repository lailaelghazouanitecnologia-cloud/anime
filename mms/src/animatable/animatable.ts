// Animatable - Animatable class

import { CompositionType, noop } from '../core/consts';
import { scope } from '../core/globals';
import {
  isKey,
  isObj,
  isStr,
  isUnd,
  mergeObjects,
  forEachChildren,
  isArr,
  stringStartsWith,
} from '../core/helpers';
import { JSAnimation } from '../animation/animation';
import { parseEase } from '../easings/eases/parser';
import type {
  TargetsParam,
  AnimatableParams,
  AnimationParams,
  TweenParamsOptions,
  Tween,
  AnimatableProperty,
  AnimatableObject,
  TargetsArray,
  EasingParam,
} from '../types';

export class Animatable {
  targets: TargetsArray = [];
  animations: Record<string, JSAnimation> = {};
  callbacks: JSAnimation | null = null;
  [key: string]: unknown;

  constructor(targets: TargetsParam, parameters: AnimatableParams) {
    if (scope.current) scope.current.register(this);

    const beginHandler = () => {
      if ((this.callbacks as JSAnimation & { completed?: boolean })?.completed) {
        this.callbacks!.reset();
      }
      this.callbacks!.play();
    };

    const pauseHandler = () => {
      if ((this.callbacks as JSAnimation & { completed?: boolean })?.completed) return;
      let paused = true;
      for (const name in this.animations) {
        const anim = this.animations[name];
        if (!anim.paused && paused) {
          paused = false;
          break;
        }
      }
      if (paused) {
        this.callbacks!.complete();
      }
    };

    const globalParams: AnimationParams = {
      onBegin: beginHandler,
      onComplete: pauseHandler,
      onPause: pauseHandler,
    };

    const callbacksAnimationParams: AnimationParams = { v: 1, autoplay: false } as AnimationParams;
    const properties: Record<string, unknown> = {};

    if (isUnd(targets) || isUnd(parameters)) return;

    for (const propName in parameters) {
      const paramValue = (parameters as Record<string, unknown>)[propName];
      if (isKey(propName)) {
        properties[propName] = paramValue;
      } else if (stringStartsWith(propName, 'on')) {
        (callbacksAnimationParams as Record<string, unknown>)[propName] = paramValue;
      } else {
        (globalParams as Record<string, unknown>)[propName] = paramValue;
      }
    }

    this.callbacks = new JSAnimation({ v: 0 } as TargetsParam, callbacksAnimationParams);

    for (const propName in properties) {
      const propValue = properties[propName];
      const isObjValue = isObj(propValue);
      const propParams: TweenParamsOptions & Record<string, unknown> = {};
      let to = '+=0';

      if (isObjValue) {
        const unit = (propValue as { unit?: string }).unit;
        if (isStr(unit)) to += unit;
      } else {
        propParams.duration = propValue as number;
      }

      propParams[propName] = isObjValue ? mergeObjects({ to }, propValue as object) : to;
      const animParams = mergeObjects(globalParams, propParams) as AnimationParams;
      animParams.composition = CompositionType.replace;
      animParams.autoplay = false;

      const animation = this.animations[propName] = new JSAnimation(targets, animParams, null, 0, false).init() as JSAnimation;
      if (!this.targets.length) this.targets.push(...animation.targets);

      const animatableProperty: AnimatableProperty = (to?: number | number[], duration?: number, ease?: EasingParam) => {
        const tween = animation._head as Tween | null;
        if (isUnd(to) && tween) {
          const numbers = tween._numbers;
          if (numbers && numbers.length) {
            return numbers;
          } else {
            return tween._modifier!(tween._number);
          }
        } else {
          forEachChildren(animation, (tween: Tween) => {
            if (isArr(to)) {
              for (let i = 0, l = (to as number[]).length; i < l; i++) {
                if (!isUnd(tween._numbers![i])) {
                  tween._fromNumbers![i] = tween._modifier!(tween._numbers![i]) as number;
                  tween._toNumbers![i] = (to as number[])[i];
                }
              }
            } else {
              tween._fromNumber = tween._modifier!(tween._number) as number;
              tween._toNumber = to as number;
            }
            if (!isUnd(ease)) tween._ease = parseEase(ease!);
            tween._currentTime = 0;
          });
          if (!isUnd(duration)) animation.stretch(duration!);
          animation.reset(true).resume();
          return this;
        }
      };

      this[propName] = animatableProperty;
    }
  }

  revert(): this {
    for (const propName in this.animations) {
      this[propName] = noop;
      this.animations[propName].revert();
    }
    this.animations = {};
    this.targets.length = 0;
    if (this.callbacks) this.callbacks.revert();
    return this;
  }
}

export function createAnimatable(targets: TargetsParam, parameters: AnimatableParams): AnimatableObject {
  return new Animatable(targets, parameters) as AnimatableObject;
}
