// Animation - Composition

import { CompositionType, minValue, TweenType } from '../core/consts';
import {
  cloneArray,
  addChild,
  removeChild,
  forEachChildren,
  round,
  isUnd,
} from '../core/helpers';
import { sanitizePropertyName } from '../core/styles';
import { engine } from '../engine/engine';
import { additive, addAdditiveAnimation } from './additive';
import type {
  TweenReplaceLookups,
  TweenAdditiveLookups,
  TweenPropertySiblings,
  Tween,
  Target,
  TargetsArray,
  Renderable,
} from '../types';

// Forward declaration for JSAnimation type to avoid circular imports
interface JSAnimation extends Renderable {
  _head: Tween | null;
  _tail: Tween | null;
  id: string | number;
  iterationCount: number;
  duration: number;
  iterationDuration: number;
  parent: Renderable | null;
}

const lookups = {
  _rep: new WeakMap() as TweenReplaceLookups,
  _add: new Map() as TweenAdditiveLookups,
};

export function getTweenSiblings(target: Target, property: string, lookup: '_rep' | '_add' = '_rep'): TweenPropertySiblings {
  const lookupMap = lookups[lookup] as Map<Target, Record<string, TweenPropertySiblings>> | WeakMap<Target, Record<string, TweenPropertySiblings>>;
  let targetLookup = lookupMap.get(target);
  if (!targetLookup) {
    targetLookup = {};
    lookupMap.set(target, targetLookup);
  }
  return targetLookup[property] ? targetLookup[property] : targetLookup[property] = {
    _head: null,
    _tail: null,
  };
}

function addTweenSortMethod(p: Tween, c: Tween): boolean {
  return p._isOverridden === 1 || p._absoluteStartTime > c._absoluteStartTime;
}

export function overrideTween(tween: Tween): void {
  tween._isOverlapped = 1;
  tween._isOverridden = 1;
  tween._changeDuration = minValue;
  tween._currentTime = minValue;
}

export function composeTween(tween: Tween, siblings: TweenPropertySiblings): Tween {
  const tweenCompositionType = tween._composition;

  // Handle replaced tweens
  if (tweenCompositionType === CompositionType.replace) {
    const tweenAbsStartTime = tween._absoluteStartTime;

    addChild(siblings, tween, addTweenSortMethod, '_prevRep', '_nextRep');

    const prevSibling = tween._prevRep;

    // Update the previous siblings for composition replace tweens
    if (prevSibling) {
      const prevParent = prevSibling.parent as JSAnimation;
      const prevAbsEndTime = prevSibling._absoluteStartTime + prevSibling._changeDuration;

      // Handle looped animations tween
      if (
        // Check if the previous tween is from a different animation
        (tween.parent as JSAnimation).id !== prevParent.id &&
        // Check if the animation has loops
        prevParent.iterationCount > 1 &&
        // Check if _absoluteChangeEndTime of last loop overlaps the current tween
        prevAbsEndTime + (prevParent.duration - prevParent.iterationDuration) > tweenAbsStartTime
      ) {
        // TODO: Find a way to only override the iterations overlapping with the tween
        overrideTween(prevSibling);

        let prevPrevSibling = prevSibling._prevRep;

        // If the tween was part of a set of keyframes, override its siblings
        while (prevPrevSibling && (prevPrevSibling.parent as JSAnimation).id === prevParent.id) {
          overrideTween(prevPrevSibling);
          prevPrevSibling = prevPrevSibling._prevRep;
        }
      }

      const absoluteUpdateStartTime = tweenAbsStartTime - tween._delay;

      if (prevAbsEndTime > absoluteUpdateStartTime) {
        const prevChangeStartTime = prevSibling._startTime;
        const prevTLOffset = prevAbsEndTime - (prevChangeStartTime + prevSibling._updateDuration);
        // Rounding is necessary here to minimize floating point errors when working in seconds
        const updatedPrevChangeDuration = round(absoluteUpdateStartTime - prevTLOffset - prevChangeStartTime, 12);

        prevSibling._changeDuration = updatedPrevChangeDuration;
        prevSibling._currentTime = updatedPrevChangeDuration;
        prevSibling._isOverlapped = 1;

        // Override the previous tween if its new _changeDuration is lower than minValue
        if (updatedPrevChangeDuration < minValue) {
          overrideTween(prevSibling);
        }
      }

      // Pause (and cancel) the parent if it only contains overlapped tweens
      let pausePrevParentAnimation = true;

      forEachChildren(prevParent, (t: Tween) => {
        if (!t._isOverlapped) pausePrevParentAnimation = false;
      });

      if (pausePrevParentAnimation) {
        const prevParentTL = prevParent.parent as Renderable | null;
        if (prevParentTL) {
          let pausePrevParentTL = true;
          forEachChildren(prevParentTL, (a: JSAnimation) => {
            if (a !== prevParent) {
              forEachChildren(a, (t: Tween) => {
                if (!t._isOverlapped) pausePrevParentTL = false;
              });
            }
          });
          if (pausePrevParentTL) {
            prevParentTL.cancel();
          }
        } else {
          prevParent.cancel();
        }
      }
    }

  // Handle additive tweens composition
  } else if (tweenCompositionType === CompositionType.blend) {
    const additiveTweenSiblings = getTweenSiblings(tween.target, tween.property, '_add');
    const additiveAnimation = addAdditiveAnimation(lookups._add);

    let lookupTween = additiveTweenSiblings._head;

    if (!lookupTween) {
      lookupTween = { ...tween } as Tween;
      lookupTween._composition = CompositionType.replace;
      lookupTween._updateDuration = minValue;
      lookupTween._startTime = 0;
      lookupTween._numbers = cloneArray(tween._fromNumbers);
      lookupTween._number = 0;
      lookupTween._next = null;
      lookupTween._prev = null;
      addChild(additiveTweenSiblings, lookupTween);
      addChild(additiveAnimation, lookupTween);
    }

    // Convert the values of TO to FROM and set TO to 0
    const toNumber = tween._toNumber;
    tween._fromNumber = lookupTween._fromNumber - toNumber;
    tween._toNumber = 0;
    tween._numbers = cloneArray(tween._fromNumbers);
    tween._number = 0;
    lookupTween._fromNumber = toNumber;

    if (tween._toNumbers) {
      const toNumbers = cloneArray(tween._toNumbers);
      if (toNumbers) {
        toNumbers.forEach((value, i) => {
          tween._fromNumbers![i] = lookupTween!._fromNumbers![i] - value;
          tween._toNumbers![i] = 0;
        });
      }
      lookupTween._fromNumbers = toNumbers;
    }

    addChild(additiveTweenSiblings, tween, undefined, '_prevAdd', '_nextAdd');
  }

  return tween;
}

export function removeTweenSliblings(tween: Tween): Tween {
  const tweenComposition = tween._composition;
  if (tweenComposition !== CompositionType.none) {
    const tweenTarget = tween.target;
    const tweenProperty = tween.property;
    const replaceTweensLookup = lookups._rep;
    const replaceTargetProps = replaceTweensLookup.get(tweenTarget);
    if (!replaceTargetProps) return tween;
    const tweenReplaceSiblings = replaceTargetProps[tweenProperty];
    removeChild(tweenReplaceSiblings, tween, '_prevRep', '_nextRep');
    if (tweenComposition === CompositionType.blend) {
      const addTweensLookup = lookups._add;
      const addTargetProps = addTweensLookup.get(tweenTarget);
      if (!addTargetProps) return tween;
      const additiveTweenSiblings = addTargetProps[tweenProperty];
      const additiveAnimation = additive.animation;
      removeChild(additiveTweenSiblings, tween, '_prevAdd', '_nextAdd');
      // If only one tween is left in the additive lookup, it's the tween lookup
      const lookupTween = additiveTweenSiblings._head;
      if (lookupTween && lookupTween === additiveTweenSiblings._tail) {
        removeChild(additiveTweenSiblings, lookupTween, '_prevAdd', '_nextAdd');
        removeChild(additiveAnimation!, lookupTween);
        let shouldClean = true;
        for (const prop in addTargetProps) {
          if (addTargetProps[prop]._head) {
            shouldClean = false;
            break;
          }
        }
        if (shouldClean) {
          addTweensLookup.delete(tweenTarget);
        }
      }
    }
  }
  return tween;
}

function removeTargetsFromJSAnimation(targetsArray: TargetsArray, animation: JSAnimation, propertyName?: string): boolean {
  let tweensMatchesTargets = false;
  forEachChildren(animation, (tween: Tween) => {
    const tweenTarget = tween.target;
    if (targetsArray.includes(tweenTarget)) {
      const tweenName = tween.property;
      const tweenType = tween._tweenType;
      const normalizePropName = sanitizePropertyName(propertyName, tweenTarget, tweenType);
      if (!normalizePropName || (normalizePropName && normalizePropName === tweenName)) {
        // Make sure to flag the previous CSS transform tween to renderTransform
        if (tween.parent._tail === tween &&
            tween._tweenType === TweenType.TRANSFORM &&
            tween._prev &&
            (tween._prev as Tween)._tweenType === TweenType.TRANSFORM
        ) {
          (tween._prev as Tween)._renderTransforms = 1;
        }
        // Removes the tween from the selected animation
        removeChild(animation, tween);
        // Detach the tween from its siblings to make sure blended tweens are correctly removed
        removeTweenSliblings(tween);
        tweensMatchesTargets = true;
      }
    }
  }, true);
  return tweensMatchesTargets;
}

export function removeTargetsFromRenderable(targetsArray: TargetsArray, renderable?: Renderable, propertyName?: string): void {
  const parent = (renderable ? renderable : engine) as Renderable & typeof engine;
  let removeMatches: boolean | undefined;
  if (parent._hasChildren) {
    let iterationDuration = 0;
    forEachChildren(parent, (child: Renderable) => {
      if (!child._hasChildren) {
        removeMatches = removeTargetsFromJSAnimation(targetsArray, child as JSAnimation, propertyName);
        // Remove the child from its parent if no tweens and no children left after the removal
        if (removeMatches && !child._head) {
          child.cancel();
          removeChild(parent, child);
        } else {
          // Calculate the new iterationDuration value to handle onComplete with last child in render()
          const childTLOffset = child._offset + child._delay;
          const childDur = childTLOffset + child.duration;
          if (childDur > iterationDuration) {
            iterationDuration = childDur;
          }
        }
      }
      // Make sure to also remove engine's children targets
      if (child._head) {
        removeTargetsFromRenderable(targetsArray, child, propertyName);
      } else {
        child._hasChildren = false;
      }
    }, true);
    // Update iterationDuration value to handle onComplete with last child in render()
    if (!isUnd((parent as Renderable).iterationDuration)) {
      (parent as Renderable).iterationDuration = iterationDuration;
    }
  } else {
    removeMatches = removeTargetsFromJSAnimation(
      targetsArray,
      parent as JSAnimation,
      propertyName
    );
  }
  if (removeMatches && !parent._head) {
    parent._hasChildren = false;
    // Cancel the parent if there are no tweens and no children left after the removal
    if ((parent as Renderable).cancel) (parent as Renderable).cancel();
  }
}
