// Animation - Additive

import { minValue, noop, ValueType, TickMode } from '../core/consts';
import { cloneArray } from '../core/helpers';
import { render } from '../core/render';
import { setAdditiveUpdate } from '../engine/engine';
import type { Tween, TweenAdditiveLookups } from '../types';

export interface AdditiveAnimation {
  duration: number;
  computeDeltaTime: () => void;
  _offset: number;
  _delay: number;
  _head: Tween | null;
  _tail: Tween | null;
}

export const additive: {
  animation: AdditiveAnimation | null;
  update: () => void;
} = {
  animation: null,
  update: noop,
};

export function addAdditiveAnimation(lookups: TweenAdditiveLookups): AdditiveAnimation {
  let animation = additive.animation;
  if (!animation) {
    animation = {
      duration: minValue,
      computeDeltaTime: noop,
      _offset: 0,
      _delay: 0,
      _head: null,
      _tail: null,
    };
    additive.animation = animation;
    additive.update = () => {
      lookups.forEach(propertyAnimation => {
        for (const propertyName in propertyAnimation) {
          const tweens = propertyAnimation[propertyName];
          const lookupTween = tweens._head;
          if (lookupTween) {
            const valueType = lookupTween._valueType;
            const additiveValues = valueType === ValueType.COMPLEX || valueType === ValueType.COLOR ? cloneArray(lookupTween._fromNumbers) : null;
            let additiveValue = lookupTween._fromNumber;
            let tween = tweens._tail;
            while (tween && tween !== lookupTween) {
              if (additiveValues) {
                for (let i = 0, l = tween._numbers!.length; i < l; i++) {
                  additiveValues[i] += tween._numbers![i];
                }
              } else {
                additiveValue += tween._number;
              }
              tween = tween._prevAdd;
            }
            lookupTween._toNumber = additiveValue;
            lookupTween._toNumbers = additiveValues;
          }
        }
      });
      // TODO: Avoid polymorphism here, ideally the additive animation should be a regular animation with a higher priority in the render loop
      render(animation as unknown as Parameters<typeof render>[0], 1, 1, 0, TickMode.FORCE);
    };
    // Register the update function with the engine
    setAdditiveUpdate(additive.update);
  }
  return animation;
}
