// Engine - Main animation engine

import { defaults, globals, globalVersions } from '../core/globals';
import { TickMode, isBrowser, K, doc } from '../core/consts';
import { now, forEachChildren, removeChild } from '../core/helpers';
import { Clock } from '../core/clock';
import { tick } from '../core/render';
import type { DefaultsParams, Tickable } from '../types';

// Additive update function - will be set by additive module to avoid circular import
export let additiveUpdate: () => void = () => {};
export function setAdditiveUpdate(fn: () => void): void {
  additiveUpdate = fn;
}

const engineTickMethod = isBrowser ? requestAnimationFrame : setImmediate;
const engineCancelMethod = isBrowser ? cancelAnimationFrame : clearImmediate;

class Engine extends Clock {
  useDefaultMainLoop: boolean = true;
  pauseOnDocumentHidden: boolean = true;
  defaults: DefaultsParams = defaults;
  paused: boolean = true;
  reqId: number | NodeJS.Immediate = 0;

  constructor(initTime?: number) {
    super(initTime);
  }

  update(): void {
    const time = this._currentTime = now();
    if (this.requestTick(time)) {
      this.computeDeltaTime(time);
      const engineSpeed = this._speed;
      const engineFps = this._fps;
      let activeTickable = this._head as Tickable | null;
      while (activeTickable) {
        const nextTickable = activeTickable._next as Tickable | null;
        if (!activeTickable.paused) {
          tick(
            activeTickable,
            (time - activeTickable._startTime) * activeTickable._speed * engineSpeed,
            0, // !muteCallbacks
            0, // !internalRender
            activeTickable._fps < engineFps ? activeTickable.requestTick(time) : TickMode.AUTO
          );
        } else {
          removeChild(this, activeTickable);
          this._hasChildren = !!this._tail;
          activeTickable._running = false;
          if (activeTickable.completed && !activeTickable._cancelled) {
            activeTickable.cancel();
          }
        }
        activeTickable = nextTickable;
      }
      additiveUpdate();
    }
  }

  wake(): this {
    if (this.useDefaultMainLoop && !this.reqId) {
      this.requestTick(now());
      this.reqId = engineTickMethod(tickEngine);
    }
    return this;
  }

  pause(): this | undefined {
    if (!this.reqId) return;
    this.paused = true;
    return killEngine();
  }

  resume(): this | undefined {
    if (!this.paused) return;
    this.paused = false;
    forEachChildren(this, (child: Tickable) => child.resetTime());
    return this.wake();
  }

  get speed(): number {
    return this._speed * (globals.timeScale === 1 ? 1 : K);
  }

  set speed(playbackRate: number) {
    this._speed = playbackRate * globals.timeScale;
    forEachChildren(this, (child: Tickable) => { child.speed = child._speed; });
  }

  get timeUnit(): 'ms' | 's' {
    return globals.timeScale === 1 ? 'ms' : 's';
  }

  set timeUnit(unit: 'ms' | 's') {
    const secondsScale = 0.001;
    const isSecond = unit === 's';
    const newScale = isSecond ? secondsScale : 1;
    if (globals.timeScale !== newScale) {
      globals.timeScale = newScale;
      globals.tickThreshold = 200 * newScale;
      const scaleFactor = isSecond ? secondsScale : K;
      (this.defaults.duration as number) *= scaleFactor;
      this._speed *= scaleFactor;
    }
  }

  get precision(): number {
    return globals.precision;
  }

  set precision(precision: number) {
    globals.precision = precision;
  }
}

export const engine: Engine = (() => {
  const eng = new Engine(now());
  if (isBrowser) {
    globalVersions.engine = eng;
    doc!.addEventListener('visibilitychange', () => {
      if (!eng.pauseOnDocumentHidden) return;
      doc!.hidden ? eng.pause() : eng.resume();
    });
  }
  return eng;
})();

const tickEngine = (): void => {
  if (engine._head) {
    engine.reqId = engineTickMethod(tickEngine);
    engine.update();
  } else {
    engine.reqId = 0;
  }
};

const killEngine = (): Engine => {
  engineCancelMethod(engine.reqId as NodeJS.Immediate & number);
  engine.reqId = 0;
  return engine;
};
