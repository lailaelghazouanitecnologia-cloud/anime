// Types - Definiciones de tipos

import type { CompositionType, TweenType, ValueType } from '../core/consts';

// Forward declarations (se definirán en sus módulos)
export interface JSAnimation extends Renderable {}
export interface Timeline extends Renderable {}
export interface Timer extends Tickable {}
export interface Animatable {}
export interface WAAPIAnimation {}
export interface Draggable {}
export interface ScrollObserver {}
export interface TextSplitter {}
export interface Scope {}
export interface AutoLayout {}
export interface Spring {
  duration: number;
  solver: (t: number) => number;
}

// Target types
export type DOMTarget = HTMLElement | SVGElement;
export type JSTarget = Record<string, unknown>;
export type Target = DOMTarget | JSTarget;
export type TargetSelector = Target | NodeList | string;
export type DOMTargetSelector = DOMTarget | NodeList | string;
export type DOMTargetsParam = DOMTargetSelector[] | DOMTargetSelector;
export type DOMTargetsArray = DOMTarget[];
export type JSTargetsParam = JSTarget[] | JSTarget;
export type JSTargetsArray = JSTarget[];
export type TargetsParam = TargetSelector[] | TargetSelector;
export type TargetsArray = Target[];

// Easing types
export type EasingFunction = (time: number) => number;

export type EaseStringParamNames =
  | 'linear'
  | 'none'
  | 'in'
  | 'out'
  | 'inOut'
  | 'inQuad'
  | 'outQuad'
  | 'inOutQuad'
  | 'inCubic'
  | 'outCubic'
  | 'inOutCubic'
  | 'inQuart'
  | 'outQuart'
  | 'inOutQuart'
  | 'inQuint'
  | 'outQuint'
  | 'inOutQuint'
  | 'inSine'
  | 'outSine'
  | 'inOutSine'
  | 'inCirc'
  | 'outCirc'
  | 'inOutCirc'
  | 'inExpo'
  | 'outExpo'
  | 'inOutExpo'
  | 'inBounce'
  | 'outBounce'
  | 'inOutBounce'
  | 'inBack'
  | 'outBack'
  | 'inOutBack'
  | 'inElastic'
  | 'outElastic'
  | 'inOutElastic';

export type WAAPIEaseStringParamNames =
  | 'ease'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | 'linear'
  | 'steps'
  | 'step-start'
  | 'step-end';

export type PowerEasing = (power?: number | string) => EasingFunction;
export type BackEasing = (overshoot?: number | string) => EasingFunction;
export type ElasticEasing = (amplitude?: number | string, period?: number | string) => EasingFunction;
export type EasingFunctionWithParams = PowerEasing | BackEasing | ElasticEasing;

export type EasingParam = string | EaseStringParamNames | EasingFunction | Spring;
export type WAAPIEasingParam = string | EaseStringParamNames | WAAPIEaseStringParamNames | EasingFunction | Spring;

// Color types
export type ColorArray = [number, number, number, number];

// Callback types
export type Callback<T> = (self: T, e?: PointerEvent) => unknown;

export interface TickableCallbacks<T> {
  onBegin?: Callback<T>;
  onBeforeUpdate?: Callback<T>;
  onUpdate?: Callback<T>;
  onLoop?: Callback<T>;
  onPause?: Callback<T>;
  onComplete?: Callback<T>;
}

export interface RenderableCallbacks<T> {
  onRender?: Callback<T>;
}

// Spring types
export interface SpringParams {
  mass?: number;
  stiffness?: number;
  damping?: number;
  velocity?: number;
  bounce?: number;
  duration?: number;
  onComplete?: Callback<JSAnimation>;
}

// Stagger types
export type StaggerFunction<T> = (
  target?: Target,
  index?: number,
  length?: number,
  tl?: Timeline
) => T;

export interface StaggerParams {
  start?: number | string;
  from?: number | 'first' | 'center' | 'last' | 'random';
  reversed?: boolean;
  grid?: [number, number];
  axis?: 'x' | 'y';
  use?: string | ((target: Target, i: number, length: number) => number);
  total?: number;
  ease?: EasingParam;
  modifier?: TweenModifier;
}

// Function value types
export type FunctionValue = (
  target: Target,
  index: number,
  length: number
) => number | string | TweenObjectValue | EasingParam | (number | string | TweenObjectValue)[];

export type TweenModifier = (value: number) => number | string;

// Tween types
export interface Tween {
  id: number;
  parent: JSAnimation;
  property: string;
  target: Target;
  _value: string | number;
  _toFunc: Function | null;
  _fromFunc: Function | null;
  _ease: EasingFunction;
  _fromNumbers: number[];
  _toNumbers: number[];
  _strings: string[];
  _fromNumber: number;
  _toNumber: number;
  _numbers: number[];
  _number: number;
  _unit: string;
  _modifier: TweenModifier;
  _currentTime: number;
  _delay: number;
  _updateDuration: number;
  _startTime: number;
  _changeDuration: number;
  _absoluteStartTime: number;
  _tweenType: TweenType;
  _valueType: ValueType;
  _composition: number;
  _isOverlapped: number;
  _isOverridden: number;
  _renderTransforms: number;
  _inlineValue: string;
  _prevRep: Tween | null;
  _nextRep: Tween | null;
  _prevAdd: Tween | null;
  _nextAdd: Tween | null;
  _prev: Tween | null;
  _next: Tween | null;
}

export interface TweenDecomposedValue {
  t: number; // Type
  n: number; // Single number value
  u: string; // Value unit
  o: string; // Value operator
  d: number[]; // Array of Numbers (in case of complex value type)
  s: string[]; // Strings (in case of complex value type)
}

export interface TweenPropertySiblings {
  _head: Tween | null;
  _tail: Tween | null;
}

export type TweenLookups = Record<string, TweenPropertySiblings>;
export type TweenReplaceLookups = WeakMap<Target, TweenLookups>;
export type TweenAdditiveLookups = Map<Target, TweenLookups>;

// Tween param types
export type TweenParamValue = number | string | FunctionValue | EasingParam;
export type TweenPropValue = TweenParamValue | [TweenParamValue, TweenParamValue];
export type TweenComposition = 'none' | 'replace' | 'blend' | CompositionType;

export interface TweenParamsOptions {
  duration?: TweenParamValue;
  delay?: TweenParamValue;
  ease?: EasingParam | FunctionValue;
  modifier?: TweenModifier;
  composition?: TweenComposition;
}

export interface TweenValues {
  from?: TweenParamValue;
  to?: TweenPropValue;
  fromTo?: TweenPropValue;
}

export type TweenKeyValue = TweenParamsOptions & TweenValues;
export type ArraySyntaxValue = (TweenKeyValue | TweenPropValue)[];
export type TweenOptions = TweenParamValue | ArraySyntaxValue | TweenKeyValue;

export interface TweenObjectValue {
  to?: TweenParamValue | TweenParamValue[];
  from?: TweenParamValue | TweenParamValue[];
  fromTo?: TweenParamValue | TweenParamValue[];
}

// Keyframes types
export interface PercentageKeyframeOptions {
  ease?: EasingParam;
}

export type PercentageKeyframeParams = Record<string, TweenParamValue>;
export type PercentageKeyframes = Record<string, PercentageKeyframeParams & PercentageKeyframeOptions>;
export type DurationKeyframes = (Record<string, TweenOptions | TweenModifier | boolean> & TweenParamsOptions)[];

// Timer types
export interface TimerOptions {
  id?: number | string;
  duration?: TweenParamValue;
  delay?: TweenParamValue;
  loopDelay?: number;
  reversed?: boolean;
  alternate?: boolean;
  loop?: boolean | number;
  autoplay?: boolean | ScrollObserver;
  frameRate?: number;
  playbackRate?: number;
}

export type TimerParams = TimerOptions & TickableCallbacks<Timer>;

// Animation types
export interface AnimationOptions {
  keyframes?: PercentageKeyframes | DurationKeyframes;
  playbackEase?: EasingParam;
}

export type AnimationParams = Record<string, unknown> &
  TimerOptions &
  AnimationOptions &
  TweenParamsOptions &
  TickableCallbacks<JSAnimation> &
  RenderableCallbacks<JSAnimation>;

// Timeline types
export type TimelinePosition =
  | number
  | `+=${number}`
  | `-=${number}`
  | `*=${number}`
  | '<'
  | '<<'
  | `<<+=${number}`
  | `<<-=${number}`
  | string;

export type TimelineAnimationPosition = TimelinePosition | StaggerFunction<number | string>;

export interface TimelineOptions {
  defaults?: DefaultsParams;
  playbackEase?: EasingParam;
  composition?: boolean;
}

export type TimelineParams = TimerOptions &
  TimelineOptions &
  TickableCallbacks<Timeline> &
  RenderableCallbacks<Timeline>;

// Defaults types
export interface DefaultsParams {
  id?: number | string | null;
  keyframes?: PercentageKeyframes | DurationKeyframes | null;
  playbackEase?: EasingParam | null;
  playbackRate?: number;
  frameRate?: number;
  loop?: number | boolean;
  reversed?: boolean;
  alternate?: boolean;
  autoplay?: boolean | ScrollObserver;
  persist?: boolean;
  duration?: number | FunctionValue;
  delay?: number | FunctionValue;
  loopDelay?: number;
  ease?: EasingParam | FunctionValue;
  composition?: TweenComposition;
  modifier?: (v: unknown) => unknown;
  onBegin?: Callback<Tickable>;
  onBeforeUpdate?: Callback<Tickable>;
  onUpdate?: Callback<Tickable>;
  onLoop?: Callback<Tickable>;
  onPause?: Callback<Tickable>;
  onComplete?: Callback<Tickable>;
  onRender?: Callback<Renderable>;
}

// Renderable and Tickable base types
export interface Renderable {
  _head: Tween | null;
  _tail: Tween | null;
  _prev: Renderable | null;
  _next: Renderable | null;
  completed: boolean;
  began: boolean;
  paused: boolean;
  duration: number;
  _currentTime: number;
  _iterationCount: number;
  _iterationDuration: number;
  play(): this;
  pause(): this;
  restart(): this;
  seek(time: number): this;
  reverse(): this;
  revert(): this;
}

export interface Tickable extends Renderable {
  id: number | string | null;
  _offset: number;
  _delay: number;
  _loopDelay: number;
  _reversed: boolean;
  _alternate: boolean;
  _loop: number | boolean;
  _autoplay: boolean | ScrollObserver;
  _frameRate: number;
  _playbackRate: number;
}

// Scope types
export interface ReactRef {
  current?: HTMLElement | SVGElement | null;
}

export interface AngularRef {
  nativeElement?: HTMLElement | SVGElement;
}

export interface ScopeParams {
  root?: DOMTargetSelector | ReactRef | AngularRef;
  defaults?: DefaultsParams;
  mediaQueries?: Record<string, string>;
}

export type ScopedCallback<T> = (scope: Scope) => T;
export type ScopeCleanupCallback = (scope?: Scope) => void;
export type ScopeConstructorCallback = (scope?: Scope) => ScopeCleanupCallback | void;
export type ScopeMethod = (...args: unknown[]) => ScopeCleanupCallback | void;

// Scroll types
export type ScrollThresholdValue = string | number;

export interface ScrollThresholdParam {
  target?: ScrollThresholdValue;
  container?: ScrollThresholdValue;
}

export type ScrollObserverAxisCallback = (self: ScrollObserver) => 'x' | 'y';
export type ScrollThresholdCallback = (self: ScrollObserver) => ScrollThresholdValue | ScrollThresholdParam;

export interface ScrollObserverParams {
  id?: number | string;
  sync?: boolean | number | string | EasingParam;
  container?: TargetsParam;
  target?: TargetsParam;
  axis?: 'x' | 'y' | ScrollObserverAxisCallback;
  enter?: ScrollThresholdValue | ScrollThresholdParam | ScrollThresholdCallback;
  leave?: ScrollThresholdValue | ScrollThresholdParam | ScrollThresholdCallback;
  repeat?: boolean | ((observer: ScrollObserver) => boolean);
  debug?: boolean;
  onEnter?: Callback<ScrollObserver>;
  onLeave?: Callback<ScrollObserver>;
  onEnterForward?: Callback<ScrollObserver>;
  onLeaveForward?: Callback<ScrollObserver>;
  onEnterBackward?: Callback<ScrollObserver>;
  onLeaveBackward?: Callback<ScrollObserver>;
  onUpdate?: Callback<ScrollObserver>;
  onResize?: Callback<ScrollObserver>;
  onSyncComplete?: Callback<ScrollObserver>;
}

// Draggable types
export interface DraggableAxisParam {
  mapTo?: string;
  modifier?: TweenModifier;
  composition?: TweenComposition;
  snap?: number | number[] | ((draggable: Draggable) => number | number[]);
}

export interface DraggableCursorParams {
  onHover?: string;
  onGrab?: string;
}

export interface DraggableDragThresholdParams {
  mouse?: number;
  touch?: number;
}

export interface DraggableParams {
  trigger?: DOMTargetSelector;
  container?: DOMTargetSelector | number[] | ((draggable: Draggable) => DOMTargetSelector | number[]);
  x?: boolean | DraggableAxisParam;
  y?: boolean | DraggableAxisParam;
  modifier?: TweenModifier;
  snap?: number | number[] | ((draggable: Draggable) => number | number[]);
  containerPadding?: number | number[] | ((draggable: Draggable) => number | number[]);
  containerFriction?: number | ((draggable: Draggable) => number);
  releaseContainerFriction?: number | ((draggable: Draggable) => number);
  dragSpeed?: number | ((draggable: Draggable) => number);
  dragThreshold?: number | DraggableDragThresholdParams | ((draggable: Draggable) => number | DraggableDragThresholdParams);
  scrollSpeed?: number | ((draggable: Draggable) => number);
  scrollThreshold?: number | ((draggable: Draggable) => number);
  minVelocity?: number | ((draggable: Draggable) => number);
  maxVelocity?: number | ((draggable: Draggable) => number);
  velocityMultiplier?: number | ((draggable: Draggable) => number);
  releaseMass?: number;
  releaseStiffness?: number;
  releaseDamping?: number;
  releaseEase?: EasingParam;
  cursor?: boolean | DraggableCursorParams | ((draggable: Draggable) => boolean | DraggableCursorParams);
  onGrab?: Callback<Draggable>;
  onDrag?: Callback<Draggable>;
  onRelease?: Callback<Draggable>;
  onUpdate?: Callback<Draggable>;
  onSettle?: Callback<Draggable>;
  onSnap?: Callback<Draggable>;
  onResize?: Callback<Draggable>;
  onAfterResize?: Callback<Draggable>;
}

// Text types
export interface SplitTemplateParams {
  class?: false | string;
  wrap?: boolean | 'hidden' | 'clip' | 'visible' | 'scroll' | 'auto';
  clone?: boolean | 'top' | 'right' | 'bottom' | 'left' | 'center';
}

export type SplitValue = boolean | string;
export type SplitFunctionValue = (value?: Node | HTMLElement) => string;

export interface TextSplitterParams {
  lines?: SplitValue | SplitTemplateParams | SplitFunctionValue;
  words?: SplitValue | SplitTemplateParams | SplitFunctionValue;
  chars?: SplitValue | SplitTemplateParams | SplitFunctionValue;
  accessible?: boolean;
  includeSpaces?: boolean;
  debug?: boolean;
}

// SVG types
export interface DrawableSVGGeometry extends SVGGeometryElement {
  draw: `${number} ${number}`;
}

// Animatable types
export type AnimatablePropertySetter = (
  to: number | number[],
  duration?: number,
  ease?: EasingParam
) => AnimatableObject;

export type AnimatablePropertyGetter = () => number | number[];
export type AnimatableProperty = AnimatablePropertySetter & AnimatablePropertyGetter;
export type AnimatableObject = Animatable & Record<string, AnimatableProperty>;

export interface AnimatablePropertyParamsOptions {
  unit?: string;
  duration?: TweenParamValue;
  ease?: EasingParam;
  modifier?: TweenModifier;
  composition?: TweenComposition;
}

export type AnimatableParams = Record<string, unknown> & AnimatablePropertyParamsOptions;

// WAAPI types
export type WAAPITweenValue = string | number | string[] | number[];
export type WAAPIFunctionValue = (
  target: DOMTarget,
  index: number,
  length: number
) => WAAPITweenValue | WAAPIEasingParam;

export type WAAPIKeyframeValue = WAAPITweenValue | WAAPIFunctionValue | (string | number | WAAPIFunctionValue)[];

export interface WAAPITweenOptions {
  to?: WAAPIKeyframeValue;
  from?: WAAPIKeyframeValue;
  duration?: number | WAAPIFunctionValue;
  delay?: number | WAAPIFunctionValue;
  ease?: WAAPIEasingParam;
  composition?: CompositeOperation;
}

export interface WAAPIAnimationOptions {
  loop?: number | boolean;
  reversed?: boolean;
  alternate?: boolean;
  autoplay?: boolean | ScrollObserver;
  playbackRate?: number;
  duration?: number | WAAPIFunctionValue;
  delay?: number | WAAPIFunctionValue;
  ease?: WAAPIEasingParam | WAAPIFunctionValue;
  composition?: CompositeOperation;
  persist?: boolean;
  onComplete?: Callback<WAAPIAnimation>;
}

export type WAAPIAnimationParams = Record<string, unknown> & WAAPIAnimationOptions;

// Layout types
export interface LayoutParams {
  // TODO: Add layout params when porting layout module
}

// Revertible union type
export type Revertible =
  | Animatable
  | Tickable
  | WAAPIAnimation
  | Draggable
  | ScrollObserver
  | TextSplitter
  | Scope
  | AutoLayout;
