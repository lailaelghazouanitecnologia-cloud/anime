// Utils - Time

import { noop } from '../core/consts';
import { globals } from '../core/globals';
import { isFnc, isUnd } from '../core/helpers';
import { Timer } from '../timer/timer';
import type { Callback, Tickable } from '../types';

/**
 * Sync utility - creates a timer that completes after one time unit
 */
export function sync(callback: Callback<Timer> = noop): Timer {
  return new Timer({ duration: 1 * globals.timeScale, onComplete: callback }, null, 0).resume();
}

/**
 * Keep time utility - preserves animation state across re-creation
 */
export function keepTime<T extends (...args: unknown[]) => Tickable | (() => void)>(
  constructor: T
): (...args: Parameters<T>) => ReturnType<T> | (() => void) {
  let tracked: Tickable | undefined;
  return (...args: Parameters<T>) => {
    let currentIteration: number | undefined;
    let currentIterationProgress: number | undefined;
    let reversed: boolean | undefined;
    let alternate: boolean | undefined;
    if (tracked) {
      currentIteration = tracked.currentIteration;
      currentIterationProgress = tracked.iterationProgress;
      reversed = tracked.reversed;
      alternate = tracked._alternate;
      tracked.revert();
    }
    const cleanup = constructor(...args);
    if (cleanup && !isFnc(cleanup) && (cleanup as Tickable).revert) {
      tracked = cleanup as Tickable;
    }
    if (!isUnd(currentIterationProgress)) {
      tracked!.currentIteration = currentIteration!;
      tracked!.iterationProgress = (alternate ? !(currentIteration! % 2) ? reversed : !reversed : reversed)
        ? 1 - currentIterationProgress!
        : currentIterationProgress!;
    }
    return cleanup || noop;
  };
}
