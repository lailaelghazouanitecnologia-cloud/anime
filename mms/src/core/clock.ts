// Core - Clock

import { K, maxFps, minValue, TickMode } from './consts';
import { defaults } from './globals';
import type { Tickable, Tween } from '../types';

/**
 * Base class to control framerate and playback rate.
 * Inherited by Engine, Timer, Animation and Timeline.
 */
export class Clock {
  deltaTime: number = 0;
  _currentTime: number;
  _lastTickTime: number;
  _startTime: number;
  _lastTime: number;
  _scheduledTime: number = 0;
  _frameDuration: number;
  _fps: number;
  _speed: number = 1;
  _hasChildren: boolean = false;
  _head: Tickable | Tween | null = null;
  _tail: Tickable | Tween | null = null;

  constructor(initTime: number = 0) {
    this._currentTime = initTime;
    this._lastTickTime = initTime;
    this._startTime = initTime;
    this._lastTime = initTime;
    this._frameDuration = K / maxFps;
    this._fps = maxFps;
  }

  get fps(): number {
    return this._fps;
  }

  set fps(frameRate: number) {
    const previousFrameDuration = this._frameDuration;
    const fr = +frameRate;
    const fps = fr < minValue ? minValue : fr;
    const frameDuration = K / fps;
    if (fps > defaults.frameRate) defaults.frameRate = fps;
    this._fps = fps;
    this._frameDuration = frameDuration;
    this._scheduledTime += frameDuration - previousFrameDuration;
  }

  get speed(): number {
    return this._speed;
  }

  set speed(playbackRate: number) {
    const pbr = +playbackRate;
    this._speed = pbr < minValue ? minValue : pbr;
  }

  requestTick(time: number): TickMode {
    const scheduledTime = this._scheduledTime;
    this._lastTickTime = time;
    if (time < scheduledTime) return TickMode.NONE;
    const frameDuration = this._frameDuration;
    const frameDelta = time - scheduledTime;
    this._scheduledTime += frameDelta < frameDuration ? frameDuration : frameDelta;
    return TickMode.AUTO;
  }

  computeDeltaTime(time: number): number {
    const delta = time - this._lastTime;
    this.deltaTime = delta;
    this._lastTime = time;
    return delta;
  }
}
