// Core - Render

import { globals } from './globals';
import {
  TweenType,
  ValueType,
  TickMode,
  CompositionType,
  emptyString,
  transformsFragmentStrings,
  transformsSymbol,
  minValue,
} from './consts';
import { now, clamp, round, lerp, forEachChildren } from './helpers';
import type { Tickable, Renderable, Tween, DOMTarget, Target } from '../types';

interface RenderableTickable extends Tickable {
  _ease?: (t: number) => number;
  _iterationTime?: number;
  iterationDuration: number;
  iterationCount: number;
  _currentIteration: number;
  _offset: number;
  _speed: number;
  backwards: boolean;
  onBegin: (self: unknown) => void;
  onLoop: (self: unknown) => void;
  onBeforeUpdate: (self: unknown) => void;
  onUpdate: (self: unknown) => void;
  onComplete: (self: unknown) => void;
  onRender: (self: unknown) => void;
  computeDeltaTime: (time: number) => number;
  _resolve: (self: unknown) => void;
  parent?: RenderableTickable;
}

interface TimelineTickable extends RenderableTickable {
  _hasChildren: true;
  _fps: number;
  requestTick: (time: number) => TickMode;
}

export const render = (
  tickable: RenderableTickable,
  time: number,
  muteCallbacks: number,
  internalRender: number,
  tickMode: TickMode
): number => {
  const parent = tickable.parent;
  const duration = tickable.duration;
  const completed = tickable.completed;
  const iterationDuration = tickable.iterationDuration;
  const iterationCount = tickable.iterationCount;
  const _currentIteration = tickable._currentIteration;
  const _loopDelay = tickable._loopDelay;
  const _reversed = tickable._reversed ? 1 : 0;
  const _alternate = tickable._alternate ? 1 : 0;
  const _hasChildren = tickable._hasChildren;
  const tickableDelay = tickable._delay;
  const tickablePrevAbsoluteTime = tickable._currentTime;

  const tickableEndTime = tickableDelay + iterationDuration;
  const tickableAbsoluteTime = time - tickableDelay;
  const tickablePrevTime = clamp(tickablePrevAbsoluteTime, -tickableDelay, duration);
  const tickableCurrentTime = clamp(tickableAbsoluteTime, -tickableDelay, duration);
  const deltaTime = tickableAbsoluteTime - tickablePrevAbsoluteTime;
  const isCurrentTimeAboveZero = tickableCurrentTime > 0;
  const isCurrentTimeEqualOrAboveDuration = tickableCurrentTime >= duration;
  const isSetter = duration <= minValue;
  const forcedTick = tickMode === TickMode.FORCE;

  let isOdd = 0;
  let iterationElapsedTime = tickableAbsoluteTime;
  let hasRendered = 0;

  if (iterationCount > 1) {
    const currentIteration = ~~(tickableCurrentTime / (iterationDuration + (isCurrentTimeEqualOrAboveDuration ? 0 : _loopDelay)));
    tickable._currentIteration = clamp(currentIteration, 0, iterationCount);
    if (isCurrentTimeEqualOrAboveDuration) tickable._currentIteration--;
    isOdd = tickable._currentIteration % 2;
    iterationElapsedTime = tickableCurrentTime % (iterationDuration + _loopDelay) || 0;
  }

  const isReversed = _reversed ^ (_alternate && isOdd);
  const _ease = tickable._ease;
  let iterationTime = isCurrentTimeEqualOrAboveDuration
    ? isReversed ? 0 : duration
    : isReversed
      ? iterationDuration - iterationElapsedTime
      : iterationElapsedTime;
  if (_ease) iterationTime = iterationDuration * _ease(iterationTime / iterationDuration) || 0;
  const isRunningBackwards = (parent ? parent.backwards : tickableAbsoluteTime < tickablePrevAbsoluteTime)
    ? !isReversed
    : !!isReversed;

  tickable._currentTime = tickableAbsoluteTime;
  tickable._iterationTime = iterationTime;
  tickable.backwards = isRunningBackwards;

  if (isCurrentTimeAboveZero && !tickable.began) {
    tickable.began = true;
    if (!muteCallbacks && !(parent && (isRunningBackwards || !parent.began))) {
      tickable.onBegin(tickable);
    }
  } else if (tickableAbsoluteTime <= 0) {
    tickable.began = false;
  }

  if (!muteCallbacks && !_hasChildren && isCurrentTimeAboveZero && tickable._currentIteration !== _currentIteration) {
    tickable.onLoop(tickable);
  }

  if (
    forcedTick ||
    (tickMode === TickMode.AUTO && (
      (time >= tickableDelay && time <= tickableEndTime) ||
      (time <= tickableDelay && tickablePrevTime > tickableDelay) ||
      (time >= tickableEndTime && tickablePrevTime !== duration)
    )) ||
    (iterationTime >= tickableEndTime && tickablePrevTime !== duration) ||
    (iterationTime <= tickableDelay && tickablePrevTime > 0) ||
    (time <= tickablePrevTime && tickablePrevTime === duration && completed) ||
    (isCurrentTimeEqualOrAboveDuration && !completed && isSetter)
  ) {
    if (isCurrentTimeAboveZero) {
      tickable.computeDeltaTime(tickablePrevTime);
      if (!muteCallbacks) tickable.onBeforeUpdate(tickable);
    }

    if (!_hasChildren) {
      const forcedRender = forcedTick || (isRunningBackwards ? deltaTime * -1 : deltaTime) >= globals.tickThreshold;
      const absoluteTime = tickable._offset + (parent ? parent._offset : 0) + tickableDelay + iterationTime;

      let tween = tickable._head as Tween | null;
      let tweenTarget: Target;
      let tweenStyle: CSSStyleDeclaration;
      let tweenTargetTransforms: Target | undefined;
      let tweenTargetTransformsProperties: Record<string, string | number>;
      let tweenTransformsNeedUpdate = 0;

      while (tween) {
        const tweenComposition = tween._composition;
        const tweenCurrentTime = tween._currentTime;
        const tweenChangeDuration = tween._changeDuration;
        const tweenAbsEndTime = tween._absoluteStartTime + tween._changeDuration;
        const tweenNextRep = tween._nextRep;
        const tweenPrevRep = tween._prevRep;
        const tweenHasComposition = tweenComposition !== CompositionType.none;

        if (
          (forcedRender || (
            (tweenCurrentTime !== tweenChangeDuration || absoluteTime <= tweenAbsEndTime + (tweenNextRep ? tweenNextRep._delay : 0)) &&
            (tweenCurrentTime !== 0 || absoluteTime >= tween._absoluteStartTime)
          )) &&
          (!tweenHasComposition || (
            !tween._isOverridden &&
            (!tween._isOverlapped || absoluteTime <= tweenAbsEndTime) &&
            (!tweenNextRep || (tweenNextRep._isOverridden || absoluteTime <= tweenNextRep._absoluteStartTime)) &&
            (!tweenPrevRep || (tweenPrevRep._isOverridden || absoluteTime >= (tweenPrevRep._absoluteStartTime + tweenPrevRep._changeDuration) + tween._delay))
          ))
        ) {
          const tweenNewTime = tween._currentTime = clamp(iterationTime - tween._startTime, 0, tweenChangeDuration);
          const tweenProgress = tween._ease(tweenNewTime / tween._updateDuration);
          const tweenModifier = tween._modifier;
          const tweenValueType = tween._valueType;
          const tweenType = tween._tweenType;
          const tweenIsObject = tweenType === TweenType.OBJECT;
          const tweenIsNumber = tweenValueType === ValueType.NUMBER;
          const tweenPrecision = (tweenIsNumber && tweenIsObject) || tweenProgress === 0 || tweenProgress === 1 ? -1 : globals.precision;

          let value: string | number;
          let number: number = 0;

          if (tweenIsNumber) {
            value = number = tweenModifier(round(lerp(tween._fromNumber, tween._toNumber, tweenProgress), tweenPrecision)) as number;
          } else if (tweenValueType === ValueType.UNIT) {
            number = tweenModifier(round(lerp(tween._fromNumber, tween._toNumber, tweenProgress), tweenPrecision)) as number;
            value = `${number}${tween._unit}`;
          } else if (tweenValueType === ValueType.COLOR) {
            const fn = tween._fromNumbers;
            const tn = tween._toNumbers;
            const r = round(clamp(tweenModifier(lerp(fn[0], tn[0], tweenProgress)) as number, 0, 255), 0);
            const g = round(clamp(tweenModifier(lerp(fn[1], tn[1], tweenProgress)) as number, 0, 255), 0);
            const b = round(clamp(tweenModifier(lerp(fn[2], tn[2], tweenProgress)) as number, 0, 255), 0);
            const a = clamp(tweenModifier(round(lerp(fn[3], tn[3], tweenProgress), tweenPrecision)) as number, 0, 1);
            value = `rgba(${r},${g},${b},${a})`;
            if (tweenHasComposition) {
              const ns = tween._numbers;
              ns[0] = r;
              ns[1] = g;
              ns[2] = b;
              ns[3] = a;
            }
          } else if (tweenValueType === ValueType.COMPLEX) {
            value = tween._strings[0];
            for (let j = 0, l = tween._toNumbers.length; j < l; j++) {
              const n = tweenModifier(round(lerp(tween._fromNumbers[j], tween._toNumbers[j], tweenProgress), tweenPrecision)) as number;
              const s = tween._strings[j + 1];
              value += `${s ? n + s : n}`;
              if (tweenHasComposition) {
                tween._numbers[j] = n;
              }
            }
          } else {
            value = 0;
          }

          if (tweenHasComposition) {
            tween._number = number;
          }

          if (!internalRender && tweenComposition !== CompositionType.blend) {
            const tweenProperty = tween.property;
            tweenTarget = tween.target;

            if (tweenIsObject) {
              (tweenTarget as Record<string, unknown>)[tweenProperty] = value;
            } else if (tweenType === TweenType.ATTRIBUTE) {
              (tweenTarget as DOMTarget).setAttribute(tweenProperty, value as string);
            } else {
              tweenStyle = (tweenTarget as DOMTarget).style;
              if (tweenType === TweenType.TRANSFORM) {
                if (tweenTarget !== tweenTargetTransforms) {
                  tweenTargetTransforms = tweenTarget;
                  tweenTargetTransformsProperties = (tweenTarget as unknown as Record<symbol, Record<string, string | number>>)[transformsSymbol];
                }
                tweenTargetTransformsProperties[tweenProperty] = value;
                tweenTransformsNeedUpdate = 1;
              } else if (tweenType === TweenType.CSS) {
                (tweenStyle as unknown as Record<string, unknown>)[tweenProperty] = value;
              } else if (tweenType === TweenType.CSS_VAR) {
                tweenStyle.setProperty(tweenProperty, value as string);
              }
            }

            if (isCurrentTimeAboveZero) hasRendered = 1;
          } else {
            tween._value = value;
          }
        }

        if (tweenTransformsNeedUpdate && tween._renderTransforms) {
          let str = emptyString;
          for (const key in tweenTargetTransformsProperties!) {
            str += `${(transformsFragmentStrings as Record<string, string>)[key]}${tweenTargetTransformsProperties![key]}) `;
          }
          tweenStyle!.transform = str;
          tweenTransformsNeedUpdate = 0;
        }

        tween = tween._next;
      }

      if (!muteCallbacks && hasRendered) {
        tickable.onRender(tickable);
      }
    }

    if (!muteCallbacks && isCurrentTimeAboveZero) {
      tickable.onUpdate(tickable);
    }
  }

  if (parent && isSetter) {
    if (!muteCallbacks && (
      (parent.began && !isRunningBackwards && tickableAbsoluteTime > 0 && !completed) ||
      (isRunningBackwards && tickableAbsoluteTime <= minValue && completed)
    )) {
      tickable.onComplete(tickable);
      tickable.completed = !isRunningBackwards;
    }
  } else if (isCurrentTimeAboveZero && isCurrentTimeEqualOrAboveDuration) {
    if (iterationCount === Infinity) {
      tickable._startTime += tickable.duration;
    } else if (tickable._currentIteration >= iterationCount - 1) {
      tickable.paused = true;
      if (!completed && !_hasChildren) {
        tickable.completed = true;
        if (!muteCallbacks && !(parent && (isRunningBackwards || !parent.began))) {
          tickable.onComplete(tickable);
          tickable._resolve(tickable);
        }
      }
    }
  } else {
    tickable.completed = false;
  }

  return hasRendered;
};

export const tick = (
  tickable: RenderableTickable,
  time: number,
  muteCallbacks: number,
  internalRender: number,
  tickMode: TickMode
): void => {
  const _currentIteration = tickable._currentIteration;
  render(tickable, time, muteCallbacks, internalRender, tickMode);

  if (tickable._hasChildren) {
    const tl = tickable as TimelineTickable;
    const tlIsRunningBackwards = tl.backwards;
    const tlChildrenTime = internalRender ? time : tl._iterationTime!;
    const tlCildrenTickTime = now();

    let tlChildrenHasRendered = 0;
    let tlChildrenHaveCompleted = true;

    if (!internalRender && tl._currentIteration !== _currentIteration) {
      const tlIterationDuration = tl.iterationDuration;
      forEachChildren(tl as unknown as { _head: Renderable | null; _tail: Renderable | null }, (child) => {
        const c = child as RenderableTickable;
        if (!tlIsRunningBackwards) {
          if (!c.completed && !c.backwards && c._currentTime < c.iterationDuration) {
            render(c, tlIterationDuration, muteCallbacks, 1, TickMode.FORCE);
          }
          c.began = false;
          c.completed = false;
        } else {
          const childDuration = c.duration;
          const childStartTime = c._offset + c._delay;
          const childEndTime = childStartTime + childDuration;
          if (!muteCallbacks && childDuration <= minValue && (!childStartTime || childEndTime === tlIterationDuration)) {
            c.onComplete(c);
          }
        }
      });
      if (!muteCallbacks) tl.onLoop(tl);
    }

    forEachChildren(tl as unknown as { _head: Renderable | null; _tail: Renderable | null }, (child) => {
      const c = child as RenderableTickable & { _fps: number; requestTick: (time: number) => TickMode };
      const childTime = round((tlChildrenTime - c._offset) * c._speed, 12);
      const childTickMode = c._fps < tl._fps ? c.requestTick(tlCildrenTickTime) : tickMode;
      tlChildrenHasRendered += render(c, childTime, muteCallbacks, internalRender, childTickMode);
      if (!c.completed && tlChildrenHaveCompleted) tlChildrenHaveCompleted = false;
    }, tlIsRunningBackwards);

    if (!muteCallbacks && tlChildrenHasRendered) tl.onRender(tl);

    if ((tlChildrenHaveCompleted || tlIsRunningBackwards) && tl._currentTime >= tl.duration) {
      tl.paused = true;
      if (!tl.completed) {
        tl.completed = true;
        if (!muteCallbacks) {
          tl.onComplete(tl);
          tl._resolve(tl);
        }
      }
    }
  }
};
