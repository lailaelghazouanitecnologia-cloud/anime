// Easings - Spring

import { K, minValue, noop } from '../../core/consts';
import { globals } from '../../core/globals';
import { isUnd, round, clamp, sqrt, exp, cos, sin, abs, pow, PI } from '../../core/helpers';
import { setValue } from '../../core/values';
import type { EasingFunction, SpringParams, Callback, JSAnimation } from '../../types';

/**
 * Spring easing solver adapted from https://webkit.org/demos/spring/spring.js
 * (c) 2016 Webkit - Apple Inc
 */

const maxSpringParamValue = K * 10;

export class Spring {
  timeStep = 0.02;
  restThreshold = 0.0005;
  restDuration = 200;
  maxDuration = 60000;
  maxRestSteps: number;
  maxIterations: number;
  bn: number;
  pd: number;
  m: number;
  s: number;
  d: number;
  v: number;
  w0 = 0;
  zeta = 0;
  wd = 0;
  b = 0;
  completed = false;
  solverDuration = 0;
  settlingDuration = 0;
  parent: JSAnimation | null = null;
  onComplete: Callback<JSAnimation>;
  ease: EasingFunction;

  constructor(parameters: SpringParams = {}) {
    const hasBounceOrDuration = !isUnd(parameters.bounce) || !isUnd(parameters.duration);

    this.maxRestSteps = this.restDuration / this.timeStep / K;
    this.maxIterations = this.maxDuration / this.timeStep / K;
    this.bn = clamp(setValue(parameters.bounce, 0.5), -1, 1);
    this.pd = clamp(setValue(parameters.duration, 628), 10 * globals.timeScale, maxSpringParamValue * globals.timeScale);
    this.m = clamp(setValue(parameters.mass, 1), 1, maxSpringParamValue);
    this.s = clamp(setValue(parameters.stiffness, 100), minValue, maxSpringParamValue);
    this.d = clamp(setValue(parameters.damping, 10), minValue, maxSpringParamValue);
    this.v = clamp(setValue(parameters.velocity, 0), -maxSpringParamValue, maxSpringParamValue);
    this.onComplete = parameters.onComplete || (noop as Callback<JSAnimation>);

    if (hasBounceOrDuration) this.calculateSDFromBD();
    this.compute();

    this.ease = (t: number): number => {
      const currentTime = t * this.settlingDuration;
      const completed = this.completed;
      const perceivedTime = this.pd;

      if (currentTime >= perceivedTime && !completed) {
        this.completed = true;
        this.onComplete(this.parent!);
      }
      if (currentTime < perceivedTime && completed) {
        this.completed = false;
      }

      return t === 0 || t === 1 ? t : this.solve(t * this.solverDuration);
    };
  }

  solve(time: number): number {
    const { zeta, w0, wd, b } = this;
    let t = time;

    if (zeta < 1) {
      t = exp(-t * zeta * w0) * (1 * cos(wd * t) + b * sin(wd * t));
    } else if (zeta === 1) {
      t = (1 + b * t) * exp(-t * w0);
    } else {
      t = ((1 + b) * exp((-zeta * w0 + wd) * t) + (1 - b) * exp((-zeta * w0 - wd) * t)) / 2;
    }

    return 1 - t;
  }

  calculateSDFromBD(): void {
    const pds = globals.timeScale === 1 ? this.pd / K : this.pd;
    this.m = 1;
    this.v = 0;
    this.s = pow((2 * PI) / pds, 2);

    if (this.bn >= 0) {
      this.d = ((1 - this.bn) * 4 * PI) / pds;
    } else {
      this.d = (4 * PI) / (pds * (1 + this.bn));
    }

    this.s = round(clamp(this.s, minValue, maxSpringParamValue), 3);
    this.d = round(clamp(this.d, minValue, 300), 3);
  }

  calculateBDFromSD(): void {
    const pds = (2 * PI) / sqrt(this.s);
    this.pd = pds * (globals.timeScale === 1 ? K : 1);
    const zeta = this.d / (2 * sqrt(this.s));

    if (zeta <= 1) {
      this.bn = 1 - (this.d * pds) / (4 * PI);
    } else {
      this.bn = (4 * PI) / (this.d * pds) - 1;
    }

    this.bn = round(clamp(this.bn, -1, 1), 3);
    this.pd = round(clamp(this.pd, 10 * globals.timeScale, maxSpringParamValue * globals.timeScale), 3);
  }

  compute(): void {
    const { maxRestSteps, maxIterations, restThreshold, timeStep, m, d, s, v } = this;
    const w0 = (this.w0 = clamp(sqrt(s / m), minValue, K));
    const bouncedZeta = (this.zeta = d / (2 * sqrt(s * m)));

    if (bouncedZeta < 1) {
      this.wd = w0 * sqrt(1 - bouncedZeta * bouncedZeta);
      this.b = (bouncedZeta * w0 + -v) / this.wd;
    } else if (bouncedZeta === 1) {
      this.wd = 0;
      this.b = -v + w0;
    } else {
      this.wd = w0 * sqrt(bouncedZeta * bouncedZeta - 1);
      this.b = (bouncedZeta * w0 + -v) / this.wd;
    }

    let solverTime = 0;
    let restSteps = 0;
    let iterations = 0;

    while (restSteps <= maxRestSteps && iterations <= maxIterations) {
      if (abs(1 - this.solve(solverTime)) < restThreshold) {
        restSteps++;
      } else {
        restSteps = 0;
      }
      this.solverDuration = solverTime;
      solverTime += timeStep;
      iterations++;
    }

    this.settlingDuration = round(this.solverDuration * K, 0) * globals.timeScale;
  }

  get bounce(): number {
    return this.bn;
  }

  set bounce(v: number) {
    this.bn = clamp(setValue(v, 1), -1, 1);
    this.calculateSDFromBD();
    this.compute();
  }

  get duration(): number {
    return this.pd;
  }

  set duration(v: number) {
    this.pd = clamp(setValue(v, 1), 10 * globals.timeScale, maxSpringParamValue * globals.timeScale);
    this.calculateSDFromBD();
    this.compute();
  }

  get stiffness(): number {
    return this.s;
  }

  set stiffness(v: number) {
    this.s = clamp(setValue(v, 100), minValue, maxSpringParamValue);
    this.calculateBDFromSD();
    this.compute();
  }

  get damping(): number {
    return this.d;
  }

  set damping(v: number) {
    this.d = clamp(setValue(v, 10), minValue, maxSpringParamValue);
    this.calculateBDFromSD();
    this.compute();
  }

  get mass(): number {
    return this.m;
  }

  set mass(v: number) {
    this.m = clamp(setValue(v, 1), 1, maxSpringParamValue);
    this.compute();
  }

  get velocity(): number {
    return this.v;
  }

  set velocity(v: number) {
    this.v = clamp(setValue(v, 0), -maxSpringParamValue, maxSpringParamValue);
    this.compute();
  }
}

export const spring = (parameters?: SpringParams): Spring => new Spring(parameters);

/** @deprecated createSpring() is deprecated use spring() instead */
export const createSpring = (parameters?: SpringParams): Spring => {
  console.warn('createSpring() is deprecated use spring() instead');
  return new Spring(parameters);
};
