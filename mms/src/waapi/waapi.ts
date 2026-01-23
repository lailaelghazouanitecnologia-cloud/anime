// WAAPI - Web Animations API Wrapper

import {
  isArr,
  isKey,
  isNum,
  isObj,
  isStr,
  isUnd,
  isFnc,
  stringStartsWith,
  toLowerCase,
  isNil,
  round,
} from '../core/helpers';
import { scope, globals } from '../core/globals';
import { registerTargets } from '../core/targets';
import { getFunctionValue, setValue } from '../core/values';
import {
  isBrowser,
  K,
  noop,
  emptyString,
  shortTransforms,
  transformsFragmentStrings,
  transformsSymbol,
  validTransforms,
} from '../core/consts';
import { none } from '../easings/none';
import { parseEaseString } from '../easings/parser';
import { addWAAPIAnimation } from './composition';
import type {
  DOMTarget,
  DOMTargetsArray,
  EasingFunction,
  EasingParam,
  Callback,
} from '../types';

// Forward declare Spring
interface Spring {
  ease: EasingFunction;
  settlingDuration: number;
}

// Forward declare ScrollObserver
interface ScrollObserver {
  link: (animation: WAAPIAnimation) => void;
}

// WAAPI-specific types
export type WAAPIKeyframeValue = string | number | ((el: DOMTarget, i: number, total: number) => string | number);
export type WAAPITweenValue = string | [string, string] | string[];

export interface WAAPITweenOptions {
  from?: WAAPIKeyframeValue;
  to?: WAAPIKeyframeValue;
  ease?: EasingParam;
  duration?: number | ((el: DOMTarget, i: number, total: number) => number);
  delay?: number | ((el: DOMTarget, i: number, total: number) => number);
  composition?: CompositeOperation;
}

export interface WAAPIAnimationParams {
  autoplay?: boolean | ScrollObserver;
  alternate?: boolean;
  reversed?: boolean;
  loop?: boolean | number;
  ease?: EasingParam;
  duration?: number | ((el: DOMTarget, i: number, total: number) => number);
  delay?: number | ((el: DOMTarget, i: number, total: number) => number);
  composition?: CompositeOperation;
  persist?: boolean;
  playbackRate?: number;
  onComplete?: Callback<WAAPIAnimation>;
  [key: string]: any;
}

/**
 * Converts an easing function into a valid CSS linear() timing function string
 */
function easingToLinear(fn: EasingFunction, samples: number = 100): string {
  const points: number[] = [];
  for (let i = 0; i <= samples; i++) {
    points.push(round(fn(i / samples), 4));
  }
  return `linear(${points.join(', ')})`;
}

const WAAPIEasesLookups: Record<string, string> = {};

/**
 * Parse easing to WAAPI-compatible easing string
 */
function parseWAAPIEasing(ease: EasingParam): string {
  let parsedEase = WAAPIEasesLookups[ease as string];
  if (parsedEase) return parsedEase;

  parsedEase = 'linear';

  if (isStr(ease)) {
    if (
      stringStartsWith(ease, 'linear') ||
      stringStartsWith(ease, 'cubic-') ||
      stringStartsWith(ease, 'steps') ||
      stringStartsWith(ease, 'ease')
    ) {
      parsedEase = ease;
    } else if (stringStartsWith(ease, 'cubicB')) {
      parsedEase = toLowerCase(ease);
    } else {
      const parsed = parseEaseString(ease);
      if (isFnc(parsed)) {
        parsedEase = parsed === none ? 'linear' : easingToLinear(parsed as EasingFunction);
      }
    }
    WAAPIEasesLookups[ease] = parsedEase;
  } else if (isFnc(ease)) {
    const easing = easingToLinear(ease as EasingFunction);
    if (easing) parsedEase = easing;
  } else if ((ease as Spring).ease) {
    parsedEase = easingToLinear((ease as Spring).ease);
  }

  return parsedEase;
}

const transformsShorthands = ['x', 'y', 'z'];
const commonDefaultPXProperties = [
  'perspective',
  'width',
  'height',
  'margin',
  'padding',
  'top',
  'right',
  'bottom',
  'left',
  'borderWidth',
  'fontSize',
  'borderRadius',
  ...transformsShorthands
];

const validIndividualTransforms = [...transformsShorthands, ...validTransforms.filter(t => ['X', 'Y', 'Z'].some(axis => t.endsWith(axis)))];

let transformsPropertiesRegistered: boolean | null = null;

/**
 * Normalize tween value with proper units
 */
function normalizeTweenValue(
  propName: string,
  value: WAAPIKeyframeValue,
  $el: DOMTarget,
  i: number,
  targetsLength: number
): string {
  let v = isStr(value) ? value : getFunctionValue(value as any, $el, i, targetsLength);
  if (!isNum(v)) return v as string;
  if (commonDefaultPXProperties.includes(propName) || stringStartsWith(propName, 'translate')) return `${v}px`;
  if (stringStartsWith(propName, 'rotate') || stringStartsWith(propName, 'skew')) return `${v}deg`;
  return `${v}`;
}

/**
 * Parse individual tween value
 */
function parseIndividualTweenValue(
  $el: DOMTarget,
  propName: string,
  from: WAAPIKeyframeValue | undefined,
  to: WAAPIKeyframeValue | undefined,
  i: number,
  targetsLength: number
): WAAPITweenValue {
  let tweenValue: WAAPITweenValue = '0';
  const computedTo = !isUnd(to)
    ? normalizeTweenValue(propName, to!, $el, i, targetsLength)
    : getComputedStyle($el as Element)[propName as any];

  if (!isUnd(from)) {
    const computedFrom = normalizeTweenValue(propName, from!, $el, i, targetsLength);
    tweenValue = [computedFrom, computedTo];
  } else {
    tweenValue = isArr(to)
      ? (to as any[]).map((v: any) => normalizeTweenValue(propName, v, $el, i, targetsLength))
      : computedTo;
  }
  return tweenValue;
}

/**
 * WAAPI Animation class
 */
export class WAAPIAnimation {
  targets: DOMTargetsArray;
  animations: globalThis.Animation[];
  controlAnimation: globalThis.Animation | null;
  onComplete: Callback<WAAPIAnimation>;
  duration: number;
  muteCallbacks: boolean;
  completed: boolean;
  paused: boolean;
  reversed: boolean;
  persist: boolean;
  autoplay: boolean | ScrollObserver;
  _speed: number;
  _resolve: (self: WAAPIAnimation) => void;
  _completed: number;
  _inlineStyles: Array<Record<string, string>>;

  constructor(targets: DOMTarget | DOMTarget[] | NodeList | string, params: WAAPIAnimationParams) {
    if (scope.current) scope.current.register(this);

    // Skip registration and fallback to no animation if CSS.registerProperty is not supported
    if (isNil(transformsPropertiesRegistered)) {
      if (isBrowser && (isUnd(CSS) || !Object.hasOwnProperty.call(CSS, 'registerProperty'))) {
        transformsPropertiesRegistered = false;
      } else {
        validTransforms.forEach(t => {
          const isSkew = stringStartsWith(t, 'skew');
          const isScale = stringStartsWith(t, 'scale');
          const isRotate = stringStartsWith(t, 'rotate');
          const isTranslate = stringStartsWith(t, 'translate');
          const isAngle = isRotate || isSkew;
          const syntax = isAngle ? '<angle>' : isScale ? '<number>' : isTranslate ? '<length-percentage>' : '*';
          try {
            CSS.registerProperty({
              name: '--' + t,
              syntax,
              inherits: false,
              initialValue: isTranslate ? '0px' : isAngle ? '0deg' : isScale ? '1' : '0',
            });
          } catch {}
        });
        transformsPropertiesRegistered = true;
      }
    }

    const parsedTargets = registerTargets(targets) as DOMTargetsArray;
    const targetsLength = parsedTargets.length;

    if (!targetsLength) {
      console.warn(`No target found. Make sure the element you're trying to animate is accessible before creating your animation.`);
    }

    const autoplay = setValue(params.autoplay, globals.defaults.autoplay);
    const scroll = autoplay && (autoplay as ScrollObserver).link ? autoplay : false;
    const alternate = params.alternate === true;
    const reversed = params.reversed === true;
    const loop = setValue(params.loop, globals.defaults.loop);
    const iterations = (loop === true || loop === Infinity) ? Infinity : isNum(loop) ? (loop as number) + 1 : 1;
    const direction: PlaybackDirection = alternate ? (reversed ? 'alternate-reverse' : 'alternate') : (reversed ? 'reverse' : 'normal');
    const fill: FillMode = 'both';
    const timeScale = globals.timeScale === 1 ? 1 : K;

    this.targets = parsedTargets;
    this.animations = [];
    this.controlAnimation = null;
    this.onComplete = params.onComplete || (globals.defaults.onComplete as Callback<WAAPIAnimation>);
    this.duration = 0;
    this.muteCallbacks = false;
    this.completed = false;
    this.paused = !autoplay || scroll !== false;
    this.reversed = reversed;
    this.persist = setValue(params.persist, globals.defaults.persist) as boolean;
    this.autoplay = autoplay as boolean | ScrollObserver;
    this._speed = setValue(params.playbackRate, globals.defaults.playbackRate) as number;
    this._resolve = noop;
    this._completed = 0;
    this._inlineStyles = [];

    parsedTargets.forEach(($el, i) => {
      const cachedTransforms = ($el as any)[transformsSymbol] || {};
      const hasIndividualTransforms = validIndividualTransforms.some(t => params.hasOwnProperty(t));
      const elStyle = ($el as HTMLElement).style;
      const inlineStyles: Record<string, string> = this._inlineStyles[i] = {};

      const easeToParse = setValue(params.ease, globals.defaults.ease);
      const easeFunctionResult = getFunctionValue(easeToParse, $el, i, targetsLength);
      const keyEasing = isFnc(easeFunctionResult) || isStr(easeFunctionResult) ? easeFunctionResult : easeToParse;

      const springEase = (easeToParse as Spring).ease && easeToParse;
      const easing = parseWAAPIEasing(keyEasing as EasingParam);

      const duration = (springEase
        ? (springEase as Spring).settlingDuration
        : getFunctionValue(setValue(params.duration, globals.defaults.duration), $el, i, targetsLength)) * timeScale;

      const delay = getFunctionValue(setValue(params.delay, globals.defaults.delay), $el, i, targetsLength) * timeScale;
      const composite = setValue(params.composition, 'replace') as CompositeOperation;

      for (let name in params) {
        if (!isKey(name)) continue;

        const keyframes: PropertyIndexedKeyframes = {};
        const tweenParams: KeyframeAnimationOptions = {
          iterations,
          direction,
          fill,
          easing,
          duration,
          delay,
          composite
        };

        const propertyValue = params[name];
        const individualTransformProperty = hasIndividualTransforms
          ? validTransforms.includes(name) ? name : shortTransforms.get(name)
          : false;

        const styleName = individualTransformProperty ? 'transform' : name;
        if (!inlineStyles[styleName]) {
          inlineStyles[styleName] = elStyle[styleName as any];
        }

        let parsedPropertyValue: WAAPITweenValue;

        if (isObj(propertyValue)) {
          const tweenOptions = propertyValue as WAAPITweenOptions;
          const tweenOptionsEase = setValue(tweenOptions.ease, easing);
          const tweenOptionsSpring = (tweenOptionsEase as Spring).ease && tweenOptionsEase;
          const to = tweenOptions.to;
          const from = tweenOptions.from;

          tweenParams.duration = (tweenOptionsSpring
            ? (tweenOptionsSpring as Spring).settlingDuration
            : getFunctionValue(setValue(tweenOptions.duration, duration), $el, i, targetsLength)) * timeScale;

          tweenParams.delay = getFunctionValue(setValue(tweenOptions.delay, delay), $el, i, targetsLength) * timeScale;
          tweenParams.composite = setValue(tweenOptions.composition, composite) as CompositeOperation;
          tweenParams.easing = parseWAAPIEasing(tweenOptionsEase as EasingParam);

          parsedPropertyValue = parseIndividualTweenValue($el, name, from, to, i, targetsLength);

          if (individualTransformProperty) {
            keyframes[`--${individualTransformProperty}`] = parsedPropertyValue as any;
            cachedTransforms[individualTransformProperty] = parsedPropertyValue;
          } else {
            keyframes[name] = parseIndividualTweenValue($el, name, from, to, i, targetsLength) as any;
          }

          addWAAPIAnimation(this as any, $el, name, keyframes, tweenParams);

          if (!isUnd(from)) {
            if (!individualTransformProperty) {
              elStyle[name as any] = (keyframes[name] as string[])[0];
            } else {
              const key = `--${individualTransformProperty}`;
              elStyle.setProperty(key, (keyframes[key] as string[])[0]);
            }
          }
        } else {
          parsedPropertyValue = isArr(propertyValue)
            ? (propertyValue as any[]).map((v: any) => normalizeTweenValue(name, v, $el, i, targetsLength))
            : normalizeTweenValue(name, propertyValue, $el, i, targetsLength);

          if (individualTransformProperty) {
            keyframes[`--${individualTransformProperty}`] = parsedPropertyValue as any;
            cachedTransforms[individualTransformProperty] = parsedPropertyValue;
          } else {
            keyframes[name] = parsedPropertyValue as any;
          }
          addWAAPIAnimation(this as any, $el, name, keyframes, tweenParams);
        }
      }

      if (hasIndividualTransforms) {
        let transforms = emptyString;
        for (let t in cachedTransforms) {
          transforms += `${transformsFragmentStrings[t]}var(--${t})) `;
        }
        elStyle.transform = transforms;
      }
    });

    if (scroll) {
      (this.autoplay as ScrollObserver).link(this);
    }
  }

  forEach(callback: ((anim: globalThis.Animation) => void) | string): this {
    try {
      const cb = isStr(callback)
        ? (a: globalThis.Animation) => (a as any)[callback]()
        : callback;
      this.animations.forEach(cb);
    } catch {}
    return this;
  }

  get speed(): number {
    return this._speed;
  }

  set speed(speed: number) {
    this._speed = +speed;
    this.forEach(anim => anim.playbackRate = speed);
  }

  get currentTime(): number {
    const controlAnimation = this.controlAnimation;
    const timeScale = globals.timeScale;
    return this.completed
      ? this.duration
      : controlAnimation
        ? +(controlAnimation.currentTime || 0) * (timeScale === 1 ? 1 : timeScale)
        : 0;
  }

  set currentTime(time: number) {
    const t = time * (globals.timeScale === 1 ? 1 : K);
    this.forEach(anim => {
      if (!this.persist && t >= this.duration) anim.play();
      anim.currentTime = t;
    });
  }

  get progress(): number {
    return this.currentTime / this.duration;
  }

  set progress(progress: number) {
    this.forEach(anim => anim.currentTime = progress * this.duration || 0);
  }

  resume(): this {
    if (!this.paused) return this;
    this.paused = false;
    return this.forEach('play');
  }

  pause(): this {
    if (this.paused) return this;
    this.paused = true;
    return this.forEach('pause');
  }

  alternate(): this {
    this.reversed = !this.reversed;
    this.forEach('reverse');
    if (this.paused) this.forEach('pause');
    return this;
  }

  play(): this {
    if (this.reversed) this.alternate();
    return this.resume();
  }

  reverse(): this {
    if (!this.reversed) this.alternate();
    return this.resume();
  }

  seek(time: number, muteCallbacks: boolean = false): this {
    if (muteCallbacks) this.muteCallbacks = true;
    if (time < this.duration) this.completed = false;
    this.currentTime = time;
    this.muteCallbacks = false;
    if (this.paused) this.pause();
    return this;
  }

  restart(): this {
    this.completed = false;
    return this.seek(0, true).resume();
  }

  commitStyles(): this {
    return this.forEach('commitStyles');
  }

  complete(): this {
    return this.seek(this.duration);
  }

  cancel(): this {
    this.muteCallbacks = true;
    this.commitStyles().forEach('cancel');
    this.animations.length = 0;
    requestAnimationFrame(() => {
      this.targets.forEach(($el) => {
        if (($el as HTMLElement).style.transform === 'none') {
          ($el as HTMLElement).style.removeProperty('transform');
        }
      });
    });
    return this;
  }

  revert(): this {
    this.cancel().targets.forEach(($el, i) => {
      const targetStyle = ($el as HTMLElement).style;
      const targetInlineStyles = this._inlineStyles[i];
      for (let name in targetInlineStyles) {
        const originalInlinedValue = targetInlineStyles[name];
        if (isUnd(originalInlinedValue) || originalInlinedValue === emptyString) {
          targetStyle.removeProperty(toLowerCase(name));
        } else {
          (targetStyle as any)[name] = originalInlinedValue;
        }
      }
      if ($el.getAttribute('style') === emptyString) {
        $el.removeAttribute('style');
      }
    });
    return this;
  }

  then(callback: Callback<WAAPIAnimation> = noop): Promise<WAAPIAnimation> {
    const then = this.then;
    const onResolve = () => {
      this.then = null as any;
      callback(this);
      this.then = then;
      this._resolve = noop;
    };
    return new Promise(r => {
      this._resolve = () => r(onResolve() as any);
      if (this.completed) this._resolve(this);
      return this;
    });
  }
}

/**
 * WAAPI utility object
 */
export const waapi = {
  animate: (targets: DOMTarget | DOMTarget[] | NodeList | string, params: WAAPIAnimationParams): WAAPIAnimation => {
    return new WAAPIAnimation(targets, params);
  },
  convertEase: easingToLinear
};
