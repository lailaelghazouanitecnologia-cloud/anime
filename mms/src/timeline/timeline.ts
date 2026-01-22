// Timeline - Timeline class

import { globals } from '../core/globals';
import { minValue, TickMode, CompositionType } from '../core/consts';
import {
  isObj,
  isFnc,
  isUnd,
  isNum,
  isStr,
  addChild,
  forEachChildren,
  mergeObjects,
  clampInfinity,
  normalizeTime,
} from '../core/helpers';
import { setValue } from '../core/values';
import { parseTargets } from '../core/targets';
import { tick } from '../core/render';
import { Timer } from '../timer/timer';
import { removeTargetsFromRenderable } from '../animation/composition';
import { JSAnimation } from '../animation/animation';
import { parseEase } from '../easings/eases/parser';
import { parseTimelinePosition } from './position';
import type {
  TargetsParam,
  Callback,
  Tickable,
  TimerParams,
  AnimationParams,
  Target,
  Renderable,
  TimelineParams,
  DefaultsParams,
  TimelinePosition,
  StaggerFunction,
  EasingFunction,
} from '../types';

// Forward declaration for WAAPI types
interface WAAPIAnimation {
  pause(): void;
  duration: number;
}

function getTimelineTotalDuration(tl: Timeline): number {
  return clampInfinity(((tl.iterationDuration + tl._loopDelay) * tl.iterationCount) - tl._loopDelay) || minValue;
}

function addTlChild(
  childParams: TimerParams | AnimationParams,
  tl: Timeline,
  timePosition: number,
  targets?: TargetsParam,
  index?: number,
  length?: number
): Timeline {
  const isSetter = isNum(childParams.duration) && (childParams.duration as number) <= minValue;
  const adjustedPosition = isSetter ? timePosition - minValue : timePosition;
  if (tl.composition) tick(tl, adjustedPosition, 1, 1, TickMode.AUTO);
  const tlChild = targets ?
    new JSAnimation(targets, childParams as AnimationParams, tl, adjustedPosition, false, index, length) :
    new Timer(childParams as TimerParams, tl, adjustedPosition);
  if (tl.composition) tlChild.init(true);
  addChild(tl, tlChild);
  forEachChildren(tl, (child: Renderable) => {
    const childTLOffset = child._offset + child._delay;
    const childDur = childTLOffset + child.duration;
    if (childDur > tl.iterationDuration) tl.iterationDuration = childDur;
  });
  tl.duration = getTimelineTotalDuration(tl);
  return tl;
}

let TLId = 0;

export class Timeline extends Timer {
  labels: Record<string, number> = {};
  defaults: DefaultsParams;
  composition: boolean;
  onRender: Callback<this>;
  _ease: EasingFunction | null;

  constructor(parameters: TimelineParams = {}) {
    super(parameters as TimerParams, null, 0);
    ++TLId;
    this.id = !isUnd(parameters.id) ? parameters.id! : TLId;
    this.duration = 0;
    const defaultsParams = parameters.defaults;
    const globalDefaults = globals.defaults;
    this.defaults = defaultsParams ? mergeObjects(defaultsParams, globalDefaults) as DefaultsParams : globalDefaults;
    this.composition = setValue(parameters.composition, true) as boolean;
    this.onRender = parameters.onRender || globalDefaults.onRender!;
    const tlPlaybackEase = setValue(parameters.playbackEase, globalDefaults.playbackEase);
    this._ease = tlPlaybackEase ? parseEase(tlPlaybackEase) : null;
    this.iterationDuration = 0;
  }

  add(a1: TargetsParam, a2: AnimationParams, a3?: TimelinePosition | StaggerFunction<number | string>): this;
  add(a1: TimerParams, a2?: TimelinePosition): this;
  add(
    a1: TargetsParam | TimerParams,
    a2?: TimelinePosition | AnimationParams,
    a3?: TimelinePosition | StaggerFunction<number | string>
  ): this {
    const isAnim = isObj(a2);
    const isTimer = isObj(a1);
    if (isAnim || isTimer) {
      this._hasChildren = true;
      if (isAnim) {
        const childParams = a2 as AnimationParams;
        if (isFnc(a3)) {
          const staggeredPosition = a3 as StaggerFunction<number | string>;
          const parsedTargetsArray = parseTargets(a1 as TargetsParam);
          const tlDuration = this.duration;
          const tlIterationDuration = this.iterationDuration;
          const id = childParams.id;
          let i = 0;
          const parsedLength = parsedTargetsArray.length;
          parsedTargetsArray.forEach((target: Target) => {
            const staggeredChildParams = { ...childParams };
            this.duration = tlDuration;
            this.iterationDuration = tlIterationDuration;
            if (!isUnd(id)) staggeredChildParams.id = id + '-' + i;
            addTlChild(
              staggeredChildParams,
              this,
              parseTimelinePosition(this, staggeredPosition(target, i, parsedLength, this)),
              target,
              i,
              parsedLength
            );
            i++;
          });
        } else {
          addTlChild(
            childParams,
            this,
            parseTimelinePosition(this, a3 as TimelinePosition),
            a1 as TargetsParam,
          );
        }
      } else {
        addTlChild(
          a1 as TimerParams,
          this,
          parseTimelinePosition(this, a2 as TimelinePosition),
        );
      }
      if (this.composition) this.init(true);
      return this;
    }
    return this;
  }

  sync(synced?: Tickable | WAAPIAnimation | globalThis.Animation, position?: TimelinePosition): this {
    if (isUnd(synced) || (synced && isUnd((synced as Tickable).pause))) return this;
    (synced as Tickable).pause();
    const duration = +((synced as globalThis.Animation).effect
      ? (synced as globalThis.Animation).effect!.getTiming().duration
      : (synced as Tickable).duration);
    return this.add(synced as unknown as TargetsParam, {
      currentTime: [0, duration],
      duration,
      delay: 0,
      ease: 'linear',
      playbackEase: 'linear'
    } as AnimationParams, position);
  }

  set(targets: TargetsParam, parameters: AnimationParams, position?: TimelinePosition): this {
    if (isUnd(parameters)) return this;
    parameters.duration = minValue;
    parameters.composition = CompositionType.replace;
    return this.add(targets, parameters, position);
  }

  call(callback: Callback<Timer>, position?: TimelinePosition): this {
    if (isUnd(callback) || (callback && !isFnc(callback))) return this;
    return this.add({ duration: 0, delay: 0, onComplete: () => callback(this) }, position);
  }

  label(labelName: string, position?: TimelinePosition): this {
    if (isUnd(labelName) || (labelName && !isStr(labelName))) return this;
    this.labels[labelName] = parseTimelinePosition(this, position);
    return this;
  }

  remove(targets: TargetsParam, propertyName?: string): this {
    removeTargetsFromRenderable(parseTargets(targets), this, propertyName);
    return this;
  }

  stretch(newDuration: number): this {
    const currentDuration = this.duration;
    if (currentDuration === normalizeTime(newDuration)) return this;
    const timeScale = newDuration / currentDuration;
    const labels = this.labels;
    forEachChildren(this, (child: JSAnimation) => child.stretch(child.duration * timeScale));
    for (const labelName in labels) labels[labelName] *= timeScale;
    return super.stretch(newDuration);
  }

  refresh(): this {
    forEachChildren(this, (child: JSAnimation) => {
      if (child.refresh) child.refresh();
    });
    return this;
  }

  revert(): this {
    super.revert();
    forEachChildren(this, (child: JSAnimation) => child.revert, true);
    return this;
  }

  then<T extends this & { then: null }>(callback?: Callback<T>): Promise<this> {
    return super.then(callback);
  }
}

export function createTimeline(parameters?: TimelineParams): Timeline {
  return new Timeline(parameters).init() as Timeline;
}
