// Timer - Timer class

import {
  minValue,
  CompositionType,
  TickMode,
  noop,
  maxValue,
} from '../core/consts';
import {
  now,
  isUnd,
  addChild,
  forEachChildren,
  clampInfinity,
  round,
  normalizeTime,
  isFnc,
  clamp,
  floor,
} from '../core/helpers';
import { scope, globals, devTools } from '../core/globals';
import { setValue } from '../core/values';
import { tick } from '../core/render';
import { composeTween, getTweenSiblings, removeTweenSliblings } from '../animation/composition';
import { Clock } from '../core/clock';
import { engine } from '../engine/engine';
import type {
  Callback,
  TimerParams,
  Renderable,
  Tween,
} from '../types';

// Forward declaration for ScrollObserver to avoid circular imports
interface ScrollObserver {
  linked?: Timer | null;
  link(timer: Timer): void;
  revert(): void;
}

// Forward declaration for Timeline to avoid circular imports
interface Timeline extends Timer {
  defaults: TimerParams;
}

function resetTimerProperties(timer: Timer): Timer {
  timer.paused = true;
  timer.began = false;
  timer.completed = false;
  return timer;
}

function reviveTimer(timer: Timer): Timer {
  if (!timer._cancelled) return timer;
  if (timer._hasChildren) {
    forEachChildren(timer, reviveTimer);
  } else {
    forEachChildren(timer, (tween: Tween) => {
      if (tween._composition !== CompositionType.none) {
        composeTween(tween, getTweenSiblings(tween.target, tween.property));
      }
    });
  }
  timer._cancelled = 0;
  return timer;
}

let timerId = 0;

/**
 * Base class used to create Timers, Animations and Timelines
 */
export class Timer extends Clock {
  id: string | number;
  parent: Timeline | null;
  duration: number;
  backwards: boolean = false;
  paused: boolean = true;
  began: boolean = false;
  completed: boolean = false;
  onBegin: Callback<this>;
  onBeforeUpdate: Callback<this>;
  onUpdate: Callback<this>;
  onLoop: Callback<this>;
  onPause: Callback<this>;
  onComplete: Callback<this>;
  iterationDuration: number;
  iterationCount: number;
  _autoplay: boolean | ScrollObserver;
  _offset: number;
  _delay: number;
  _loopDelay: number;
  _iterationTime: number = 0;
  _currentIteration: number = 0;
  _resolve: () => void = noop;
  _running: boolean = false;
  _reversed: number;
  _reverse: number;
  _cancelled: number = 0;
  _alternate: boolean;
  _prev: Renderable | null = null;
  _next: Renderable | null = null;

  constructor(parameters: TimerParams = {}, parent: Timeline | null = null, parentPosition: number = 0) {
    super(0);

    ++timerId;

    const {
      id,
      delay,
      duration,
      reversed,
      alternate,
      loop,
      loopDelay,
      autoplay,
      frameRate,
      playbackRate,
      onComplete,
      onLoop,
      onPause,
      onBegin,
      onBeforeUpdate,
      onUpdate,
    } = parameters;

    if (scope.current) scope.current.register(this);

    const timerInitTime = parent ? 0 : engine._lastTickTime;
    const timerDefaults = parent ? parent.defaults : globals.defaults;
    const timerDelay = isFnc(delay) || isUnd(delay) ? timerDefaults.delay as number : +delay!;
    const timerDuration = isFnc(duration) || isUnd(duration) ? Infinity : +duration!;
    const timerLoop = setValue(loop, timerDefaults.loop);
    const timerLoopDelay = setValue(loopDelay, timerDefaults.loopDelay);
    let timerIterationCount = timerLoop === true ||
                              timerLoop === Infinity ||
                              (timerLoop as number) < 0 ? Infinity :
                              (timerLoop as number) + 1;

    if (devTools) {
      const isInfinite = timerIterationCount === Infinity;
      const registered = devTools.register(this, parameters, isInfinite);
      if (registered && isInfinite) {
        const minIterations = alternate ? 2 : 1;
        const iterations = parent ? devTools.maxNestedInfiniteLoops : devTools.maxInfiniteLoops;
        timerIterationCount = Math.max(iterations, minIterations);
      }
    }

    let offsetPosition = 0;

    if (parent) {
      offsetPosition = parentPosition;
    } else {
      // Make sure to tick the engine once if not currently running to get up to date engine._lastTickTime
      if (!engine.reqId) engine.requestTick(now());
      // Make sure to scale the offset position with globals.timeScale to properly handle seconds unit
      offsetPosition = (engine._lastTickTime - engine._startTime) * globals.timeScale;
    }

    // Timer's parameters
    this.id = !isUnd(id) ? id! : timerId;
    this.parent = parent;
    this.duration = clampInfinity(((timerDuration + timerLoopDelay) * timerIterationCount) - timerLoopDelay) || minValue;
    this.onBegin = onBegin || timerDefaults.onBegin!;
    this.onBeforeUpdate = onBeforeUpdate || timerDefaults.onBeforeUpdate!;
    this.onUpdate = onUpdate || timerDefaults.onUpdate!;
    this.onLoop = onLoop || timerDefaults.onLoop!;
    this.onPause = onPause || timerDefaults.onPause!;
    this.onComplete = onComplete || timerDefaults.onComplete!;
    this.iterationDuration = timerDuration;
    this.iterationCount = timerIterationCount;
    this._autoplay = parent ? false : setValue(autoplay, timerDefaults.autoplay);
    this._offset = offsetPosition;
    this._delay = timerDelay;
    this._loopDelay = timerLoopDelay;
    this._reversed = +setValue(reversed, timerDefaults.reversed);
    this._reverse = this._reversed;
    this._alternate = setValue(alternate, timerDefaults.alternate);

    // Clock's parameters
    this._lastTickTime = timerInitTime;
    this._startTime = timerInitTime;
    this._lastTime = timerInitTime;
    this._fps = setValue(frameRate, timerDefaults.frameRate);
    this._speed = setValue(playbackRate, timerDefaults.playbackRate);
  }

  get cancelled(): boolean {
    return !!this._cancelled;
  }

  set cancelled(cancelled: boolean) {
    cancelled ? this.cancel() : this.reset(true).play();
  }

  get currentTime(): number {
    return clamp(round(this._currentTime, globals.precision), -this._delay, this.duration);
  }

  set currentTime(time: number) {
    const paused = this.paused;
    this.pause().seek(+time);
    if (!paused) this.resume();
  }

  get iterationCurrentTime(): number {
    return clamp(round(this._iterationTime, globals.precision), 0, this.iterationDuration);
  }

  set iterationCurrentTime(time: number) {
    this.currentTime = (this.iterationDuration * this._currentIteration) + time;
  }

  get progress(): number {
    return clamp(round(this._currentTime / this.duration, 10), 0, 1);
  }

  set progress(progress: number) {
    this.currentTime = this.duration * progress;
  }

  get iterationProgress(): number {
    return clamp(round(this._iterationTime / this.iterationDuration, 10), 0, 1);
  }

  set iterationProgress(progress: number) {
    const iterationDuration = this.iterationDuration;
    this.currentTime = (iterationDuration * this._currentIteration) + (iterationDuration * progress);
  }

  get currentIteration(): number {
    return this._currentIteration;
  }

  set currentIteration(iterationCount: number) {
    this.currentTime = (this.iterationDuration * clamp(+iterationCount, 0, this.iterationCount - 1));
  }

  get reversed(): boolean {
    return !!this._reversed;
  }

  set reversed(reverse: boolean) {
    reverse ? this.reverse() : this.play();
  }

  get speed(): number {
    return super.speed;
  }

  set speed(playbackRate: number) {
    super.speed = playbackRate;
    this.resetTime();
  }

  reset(softReset: boolean = false): this {
    reviveTimer(this);
    if (this._reversed && !this._reverse) this.reversed = false;
    this._iterationTime = this.iterationDuration;
    tick(this, 0, 1, ~~softReset, TickMode.FORCE);
    resetTimerProperties(this);
    if (this._hasChildren) {
      forEachChildren(this, resetTimerProperties);
    }
    return this;
  }

  init(internalRender: boolean = false): this {
    this.fps = this._fps;
    this.speed = this._speed;
    if (!internalRender && this._hasChildren) {
      tick(this, this.duration, 1, ~~internalRender, TickMode.FORCE);
    }
    this.reset(internalRender);
    const autoplay = this._autoplay;
    if (autoplay === true) {
      this.resume();
    } else if (autoplay && !isUnd((autoplay as ScrollObserver).linked)) {
      (autoplay as ScrollObserver).link(this);
    }
    return this;
  }

  resetTime(): this {
    const timeScale = 1 / (this._speed * engine._speed);
    this._startTime = now() - (this._currentTime + this._delay) * timeScale;
    return this;
  }

  pause(): this {
    if (this.paused) return this;
    this.paused = true;
    this.onPause(this);
    return this;
  }

  resume(): this {
    if (!this.paused) return this;
    this.paused = false;
    if (this.duration <= minValue && !this._hasChildren) {
      tick(this, minValue, 0, 0, TickMode.FORCE);
    } else {
      if (!this._running) {
        addChild(engine, this);
        engine._hasChildren = true;
        this._running = true;
      }
      this.resetTime();
      this._startTime -= 12;
      engine.wake();
    }
    return this;
  }

  restart(): this {
    return this.reset().resume();
  }

  seek(time: number, muteCallbacks: boolean | number = 0, internalRender: boolean | number = 0): this {
    reviveTimer(this);
    this.completed = false;
    const isPaused = this.paused;
    this.paused = true;
    tick(this, time + this._delay, ~~muteCallbacks, ~~internalRender, TickMode.AUTO);
    return isPaused ? this : this.resume();
  }

  alternate(): this {
    const reversed = this._reversed;
    const count = this.iterationCount;
    const duration = this.iterationDuration;
    const iterations = count === Infinity ? floor(maxValue / duration) : count;
    this._reversed = +(this._alternate && !(iterations % 2) ? reversed : !reversed);
    if (count === Infinity) {
      this.iterationProgress = this._reversed ? 1 - this.iterationProgress : this.iterationProgress;
    } else {
      this.seek((duration * iterations) - this._currentTime);
    }
    this.resetTime();
    return this;
  }

  play(): this {
    if (this._reversed) this.alternate();
    return this.resume();
  }

  reverse(): this {
    if (!this._reversed) this.alternate();
    return this.resume();
  }

  cancel(): this {
    if (this._hasChildren) {
      forEachChildren(this, (child: Renderable) => child.cancel(), true);
    } else {
      forEachChildren(this, removeTweenSliblings);
    }
    this._cancelled = 1;
    return this.pause();
  }

  stretch(newDuration: number): this {
    const currentDuration = this.duration;
    const normlizedDuration = normalizeTime(newDuration);
    if (currentDuration === normlizedDuration) return this;
    const timeScale = newDuration / currentDuration;
    const isSetter = newDuration <= minValue;
    this.duration = isSetter ? minValue : normlizedDuration;
    this.iterationDuration = isSetter ? minValue : normalizeTime(this.iterationDuration * timeScale);
    this._offset *= timeScale;
    this._delay *= timeScale;
    this._loopDelay *= timeScale;
    return this;
  }

  revert(): this {
    tick(this, 0, 1, 0, TickMode.AUTO);
    const ap = this._autoplay as ScrollObserver;
    if (ap && ap.linked && ap.linked === this) ap.revert();
    return this.cancel();
  }

  complete(muteCallbacks: boolean | number = 0): this {
    return this.seek(this.duration, muteCallbacks).cancel();
  }

  then<T extends this & { then: null }>(callback: Callback<T> = noop as Callback<T>): Promise<this> {
    const then = this.then;
    const onResolve = () => {
      this.then = null as unknown as typeof this.then;
      callback(this as unknown as T);
      this.then = then;
      this._resolve = noop;
    };
    return new Promise(r => {
      this._resolve = () => r(onResolve());
      if (this.completed) this._resolve();
      return this;
    });
  }
}

export function createTimer(parameters?: TimerParams): Timer {
  return new Timer(parameters, null, 0).init();
}
