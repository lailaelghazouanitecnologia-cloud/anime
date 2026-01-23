// WAAPI - Composition

import { addChild, removeChild } from '../core/helpers';
import type { DOMTarget } from '../types';

// Forward declare WAAPIAnimation
interface WAAPIAnimation {
  _speed: number;
  paused: boolean;
  persist: boolean;
  duration: number;
  controlAnimation: globalThis.Animation | null;
  animations: globalThis.Animation[];
  _completed: number;
  completed: boolean;
  muteCallbacks: boolean;
  onComplete: (self: WAAPIAnimation) => void;
  _resolve: (self: WAAPIAnimation) => void;
}

interface WAAPILookup {
  parent: WAAPIAnimation;
  animation: globalThis.Animation;
  $el: DOMTarget;
  property: string;
  _next: WAAPILookup | null;
  _prev: WAAPILookup | null;
}

interface WAAPILookupList {
  _head: WAAPILookup | null;
  _tail: WAAPILookup | null;
}

const WAAPIAnimationsLookups: WAAPILookupList = {
  _head: null,
  _tail: null,
};

/**
 * Remove a WAAPI animation from the lookup list
 */
export function removeWAAPIAnimation(
  $el: DOMTarget,
  property?: string,
  parent?: WAAPIAnimation
): globalThis.Animation | undefined {
  let nextLookup = WAAPIAnimationsLookups._head;
  let anim: globalThis.Animation | undefined;

  while (nextLookup) {
    const next = nextLookup._next;
    const matchTarget = nextLookup.$el === $el;
    const matchProperty = !property || nextLookup.property === property;
    const matchParent = !parent || nextLookup.parent === parent;

    if (matchTarget && matchProperty && matchParent) {
      anim = nextLookup.animation;
      try { anim.commitStyles(); } catch {}
      anim.cancel();
      removeChild(WAAPIAnimationsLookups, nextLookup);

      const lookupParent = nextLookup.parent;
      if (lookupParent) {
        lookupParent._completed++;
        if (lookupParent.animations.length === lookupParent._completed) {
          lookupParent.completed = true;
          lookupParent.paused = true;
          if (!lookupParent.muteCallbacks) {
            lookupParent.onComplete(lookupParent);
            lookupParent._resolve(lookupParent);
          }
        }
      }
    }
    nextLookup = next;
  }
  return anim;
}

/**
 * Add a WAAPI animation to the lookup list
 */
export function addWAAPIAnimation(
  parent: WAAPIAnimation,
  $el: DOMTarget,
  property: string,
  keyframes: PropertyIndexedKeyframes,
  params: KeyframeAnimationOptions
): globalThis.Animation {
  const animation = ($el as Element).animate(keyframes, params);
  const animTotalDuration = (params.delay as number || 0) + (+(params.duration || 0) * (params.iterations || 1));

  animation.playbackRate = parent._speed;
  if (parent.paused) animation.pause();

  if (parent.duration < animTotalDuration) {
    parent.duration = animTotalDuration;
    parent.controlAnimation = animation;
  }

  parent.animations.push(animation);
  removeWAAPIAnimation($el, property);

  addChild(WAAPIAnimationsLookups, {
    parent,
    animation,
    $el,
    property,
    _next: null,
    _prev: null
  });

  const handleRemove = () => { removeWAAPIAnimation($el, property, parent); };
  animation.oncancel = handleRemove;
  animation.onremove = handleRemove;

  if (!parent.persist) {
    animation.onfinish = handleRemove;
  }

  return animation;
}
