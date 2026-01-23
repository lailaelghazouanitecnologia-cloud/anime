// Draggable - Main Implementation

import { scope, globals } from '../core/globals';
import { win, doc, maxValue, noop, compositionTypes } from '../core/consts';
import { parseTargets } from '../core/targets';
import {
  snap,
  clamp,
  round,
  isObj,
  isUnd,
  isArr,
  isFnc,
  sqrt,
  max,
  atan2,
  cos,
  sin,
  abs,
  now,
  isNum,
} from '../core/helpers';
import { setValue } from '../core/values';
import { mapRange } from '../utils/number';
import { Timer } from '../timer';
import { JSAnimation } from '../animation';
import { removeTargetsFromRenderable } from '../animation/composition';
import { Animatable } from '../animatable';
import { eases, parseEase } from '../easings/parser';
import { spring } from '../easings/spring';
import { get, set } from '../utils/target';
import type {
  DOMTarget,
  TargetsParam,
  EasingFunction,
  Callback,
  EasingParam,
  FunctionValue,
} from '../types';

// Forward declare Spring type
interface Spring {
  ease: EasingFunction;
  velocity: number;
  settlingDuration: number;
  restDuration: number;
}

// Draggable-specific types
export interface DraggableCursorParams {
  onHover?: string;
  onGrab?: string;
}

export interface DraggableDragThresholdParams {
  mouse?: number;
  touch?: number;
}

export interface DraggableAxisParam {
  mapTo?: string;
  modifier?: (value: number) => number;
  composition?: number;
  snap?: number | number[] | ((value: number) => number);
}

export interface DraggableParams {
  x?: boolean | DraggableAxisParam;
  y?: boolean | DraggableAxisParam;
  trigger?: TargetsParam;
  container?: TargetsParam | [number, number, number, number] | ((draggable: Draggable) => TargetsParam | [number, number, number, number]);
  containerPadding?: number | [number, number, number, number] | ((draggable: Draggable) => number | [number, number, number, number]);
  containerFriction?: number | ((draggable: Draggable) => number);
  releaseContainerFriction?: number | ((draggable: Draggable) => number);
  snap?: number | number[] | ((value: number) => number) | ((draggable: Draggable) => number | number[]);
  scrollSpeed?: number | ((draggable: Draggable) => number);
  scrollThreshold?: number | ((draggable: Draggable) => number);
  dragSpeed?: number | ((draggable: Draggable) => number);
  dragThreshold?: number | DraggableDragThresholdParams | ((draggable: Draggable) => number | DraggableDragThresholdParams);
  minVelocity?: number | ((draggable: Draggable) => number);
  maxVelocity?: number | ((draggable: Draggable) => number);
  velocityMultiplier?: number | ((draggable: Draggable) => number);
  cursor?: boolean | DraggableCursorParams | ((draggable: Draggable) => boolean | DraggableCursorParams);
  releaseEase?: EasingParam | Spring;
  releaseMass?: number;
  releaseStiffness?: number;
  releaseDamping?: number;
  modifier?: (value: number) => number;
  onGrab?: Callback<Draggable>;
  onDrag?: Callback<Draggable>;
  onRelease?: Callback<Draggable>;
  onUpdate?: Callback<Draggable>;
  onSettle?: Callback<Draggable>;
  onSnap?: Callback<Draggable>;
  onResize?: Callback<Draggable>;
  onAfterResize?: Callback<Draggable>;
}

interface AnimatableObject {
  [key: string]: ((value?: number, duration?: number, ease?: EasingParam) => number | void);
  animations: { [key: string]: { pause: () => void } };
  callbacks: {
    onRender?: () => void;
    onComplete?: () => void;
  };
  revert: () => void;
}

/**
 * Prevent default event behavior
 */
const preventDefault = (e: Event): void => {
  if (e.cancelable) e.preventDefault();
};

/**
 * DOM Proxy for non-DOM objects
 */
class DOMProxy {
  el: Record<string, number>;
  zIndex: number;
  parentElement: null;
  classList: { add: () => void; remove: () => void };

  constructor(el: Record<string, number>) {
    this.el = el;
    this.zIndex = 0;
    this.parentElement = null;
    this.classList = {
      add: noop,
      remove: noop,
    };
  }

  get x(): number { return this.el.x || 0; }
  set x(v: number) { this.el.x = v; }

  get y(): number { return this.el.y || 0; }
  set y(v: number) { this.el.y = v; }

  get width(): number { return this.el.width || 0; }
  set width(v: number) { this.el.width = v; }

  get height(): number { return this.el.height || 0; }
  set height(v: number) { this.el.height = v; }

  getBoundingClientRect(): { top: number; right: number; bottom: number; left: number } {
    return {
      top: this.y,
      right: this.x,
      bottom: this.y + this.height,
      left: this.x + this.width,
    };
  }
}

/**
 * Transform matrix handler
 */
class Transforms {
  $el: HTMLElement | DOMProxy;
  inlineTransforms: string[];
  point: DOMPoint;
  inversedMatrix: DOMMatrix;

  constructor($el: HTMLElement | DOMProxy) {
    this.$el = $el;
    this.inlineTransforms = [];
    this.point = new DOMPoint();
    this.inversedMatrix = this.getMatrix().inverse();
  }

  normalizePoint(x: number, y: number): DOMPoint {
    this.point.x = x;
    this.point.y = y;
    return this.point.matrixTransform(this.inversedMatrix);
  }

  traverseUp(cb: ($el: HTMLElement, i: number) => void): void {
    let $el = (this.$el as HTMLElement).parentElement as HTMLElement | null;
    let i = 0;
    while ($el && $el !== doc) {
      cb($el, i);
      $el = $el.parentElement;
      i++;
    }
  }

  getMatrix(): DOMMatrix {
    const matrix = new DOMMatrix();
    this.traverseUp($el => {
      const transformValue = getComputedStyle($el).transform;
      if (transformValue) {
        const elMatrix = new DOMMatrix(transformValue);
        matrix.preMultiplySelf(elMatrix);
      }
    });
    return matrix;
  }

  remove(): void {
    this.traverseUp(($el, i) => {
      this.inlineTransforms[i] = $el.style.transform;
      $el.style.transform = 'none';
    });
  }

  revert(): void {
    this.traverseUp(($el, i) => {
      const ct = this.inlineTransforms[i];
      if (ct === '') {
        $el.style.removeProperty('transform');
      } else {
        $el.style.transform = ct;
      }
    });
  }
}

/**
 * Parse draggable function parameter
 */
function parseDraggableFunctionParameter<T>(
  value: T | ((draggable: Draggable) => T),
  draggable: Draggable
): T {
  return value && isFnc(value) ? (value as (draggable: Draggable) => T)(draggable) : value as T;
}

let zIndex = 0;

/**
 * Draggable class for drag interactions
 */
export class Draggable {
  // Container elements
  containerArray: [number, number, number, number] | null;
  $container: HTMLElement;
  useWin: boolean;
  $scrollContainer: Window | HTMLElement;
  $target: HTMLElement | DOMProxy;
  $trigger: HTMLElement;
  fixed: boolean;

  // Refreshable parameters
  isFinePointer: boolean;
  containerPadding: [number, number, number, number];
  containerFriction: number;
  releaseContainerFriction: number;
  snapX: number | number[] | ((value: number) => number);
  snapY: number | number[] | ((value: number) => number);
  scrollSpeed: number;
  scrollThreshold: number;
  dragSpeed: number;
  dragThreshold: number;
  maxVelocity: number;
  minVelocity: number;
  velocityMultiplier: number;
  cursor: boolean | DraggableCursorParams;

  // Spring and easing
  releaseXSpring: Spring;
  releaseYSpring: Spring;
  releaseEase: EasingFunction;
  hasReleaseSpring: boolean;

  // Callbacks
  onGrab: Callback<Draggable>;
  onDrag: Callback<Draggable>;
  onRelease: Callback<Draggable>;
  onUpdate: Callback<Draggable>;
  onSettle: Callback<Draggable>;
  onSnap: Callback<Draggable>;
  onResize: Callback<Draggable>;
  onAfterResize: Callback<Draggable>;

  // Axis configuration
  disabled: [number, number];

  // Internal props
  xProp: string;
  yProp: string;
  destX: number;
  destY: number;
  deltaX: number;
  deltaY: number;
  scroll: { x: number; y: number };
  coords: [number, number, number, number];
  snapped: [number, number];
  pointer: [number, number, number, number, number, number, number, number];
  scrollView: [number, number];
  dragArea: [number, number, number, number];
  containerBounds: [number, number, number, number];
  scrollBounds: [number, number, number, number];
  targetBounds: [number, number, number, number];
  window: [number, number];
  velocityStack: [number, number, number];
  velocityStackIndex: number;
  velocityTime: number;
  velocity: number;
  angle: number;

  // Style animations
  cursorStyles: JSAnimation | null;
  triggerStyles: JSAnimation | null;
  bodyStyles: JSAnimation | null;
  targetStyles: JSAnimation | null;
  touchActionStyles: JSAnimation | null;

  // Transform handling
  transforms: Transforms;
  overshootCoords: { x: number; y: number };
  overshootTicker: Timer;
  updateTicker: Timer;

  // State flags
  contained: boolean;
  manual: boolean;
  grabbed: boolean;
  dragged: boolean;
  updated: boolean;
  released: boolean;
  canScroll: boolean;
  enabled: boolean;
  initialized: boolean;
  activeProp: string;

  // Animatable
  animate: AnimatableObject;

  // Resize handling
  resizeTicker: Timer;
  parameters: DraggableParams;
  resizeObserver: ResizeObserver;

  constructor(target: TargetsParam, parameters: DraggableParams = {}) {
    if (!target) return;
    if (scope.current) scope.current.register(this);

    const paramX = parameters.x;
    const paramY = parameters.y;
    const trigger = parameters.trigger;
    const modifier = parameters.modifier;
    const ease = parameters.releaseEase;
    const customEase = ease && parseEase(ease as EasingParam);
    const hasSpring = !isUnd(ease) && !isUnd((ease as Spring).ease);

    const xProp = isObj(paramX) && !isUnd((paramX as DraggableAxisParam).mapTo)
      ? (paramX as DraggableAxisParam).mapTo!
      : 'translateX';
    const yProp = isObj(paramY) && !isUnd((paramY as DraggableAxisParam).mapTo)
      ? (paramY as DraggableAxisParam).mapTo!
      : 'translateY';

    const container = parseDraggableFunctionParameter(parameters.container, this);
    this.containerArray = isArr(container) ? container as [number, number, number, number] : null;
    this.$container = (container && !this.containerArray ? parseTargets(container as DOMTarget)[0] : doc.body) as HTMLElement;
    this.useWin = this.$container === doc.body;
    this.$scrollContainer = this.useWin ? win : this.$container;
    this.$target = (isObj(target) ? new DOMProxy(target as Record<string, number>) : parseTargets(target)[0]) as HTMLElement | DOMProxy;
    this.$trigger = parseTargets(trigger ? trigger : target)[0] as HTMLElement;
    this.fixed = get(this.$target as HTMLElement, 'position') === 'fixed';

    // Refreshable parameters
    this.isFinePointer = true;
    this.containerPadding = [0, 0, 0, 0];
    this.containerFriction = 0;
    this.releaseContainerFriction = 0;
    this.snapX = 0;
    this.snapY = 0;
    this.scrollSpeed = 0;
    this.scrollThreshold = 0;
    this.dragSpeed = 0;
    this.dragThreshold = 3;
    this.maxVelocity = 0;
    this.minVelocity = 0;
    this.velocityMultiplier = 0;
    this.cursor = false;

    this.releaseXSpring = hasSpring ? (ease as Spring) : spring({
      mass: setValue(parameters.releaseMass, 1),
      stiffness: setValue(parameters.releaseStiffness, 80),
      damping: setValue(parameters.releaseDamping, 20),
    }) as Spring;
    this.releaseYSpring = hasSpring ? (ease as Spring) : spring({
      mass: setValue(parameters.releaseMass, 1),
      stiffness: setValue(parameters.releaseStiffness, 80),
      damping: setValue(parameters.releaseDamping, 20),
    }) as Spring;

    this.releaseEase = customEase || eases.outQuint;
    this.hasReleaseSpring = hasSpring;

    // Callbacks
    this.onGrab = parameters.onGrab || noop;
    this.onDrag = parameters.onDrag || noop;
    this.onRelease = parameters.onRelease || noop;
    this.onUpdate = parameters.onUpdate || noop;
    this.onSettle = parameters.onSettle || noop;
    this.onSnap = parameters.onSnap || noop;
    this.onResize = parameters.onResize || noop;
    this.onAfterResize = parameters.onAfterResize || noop;

    // Disabled axes
    this.disabled = [0, 0];

    // Build animatable params
    const animatableParams: Record<string, any> = {};
    if (modifier) animatableParams.modifier = modifier;

    if (isUnd(paramX) || paramX === true) {
      animatableParams[xProp] = 0;
    } else if (isObj(paramX)) {
      const paramXObject = paramX as DraggableAxisParam;
      const animatableXParams: Record<string, any> = {};
      if (paramXObject.modifier) animatableXParams.modifier = paramXObject.modifier;
      if (paramXObject.composition) animatableXParams.composition = paramXObject.composition;
      animatableParams[xProp] = animatableXParams;
    } else if (paramX === false) {
      animatableParams[xProp] = 0;
      this.disabled[0] = 1;
    }

    if (isUnd(paramY) || paramY === true) {
      animatableParams[yProp] = 0;
    } else if (isObj(paramY)) {
      const paramYObject = paramY as DraggableAxisParam;
      const animatableYParams: Record<string, any> = {};
      if (paramYObject.modifier) animatableYParams.modifier = paramYObject.modifier;
      if (paramYObject.composition) animatableYParams.composition = paramYObject.composition;
      animatableParams[yProp] = animatableYParams;
    } else if (paramY === false) {
      animatableParams[yProp] = 0;
      this.disabled[1] = 1;
    }

    this.animate = new Animatable(this.$target as HTMLElement, animatableParams) as unknown as AnimatableObject;

    // Internal props
    this.xProp = xProp;
    this.yProp = yProp;
    this.destX = 0;
    this.destY = 0;
    this.deltaX = 0;
    this.deltaY = 0;
    this.scroll = { x: 0, y: 0 };
    this.coords = [this.x, this.y, 0, 0];
    this.snapped = [0, 0];
    this.pointer = [0, 0, 0, 0, 0, 0, 0, 0];
    this.scrollView = [0, 0];
    this.dragArea = [0, 0, 0, 0];
    this.containerBounds = [-maxValue, maxValue, maxValue, -maxValue];
    this.scrollBounds = [0, 0, 0, 0];
    this.targetBounds = [0, 0, 0, 0];
    this.window = [0, 0];
    this.velocityStack = [0, 0, 0];
    this.velocityStackIndex = 0;
    this.velocityTime = now();
    this.velocity = 0;
    this.angle = 0;

    // Style animations
    this.cursorStyles = null;
    this.triggerStyles = null;
    this.bodyStyles = null;
    this.targetStyles = null;
    this.touchActionStyles = null;

    this.transforms = new Transforms(this.$target as HTMLElement);
    this.overshootCoords = { x: 0, y: 0 };

    this.overshootTicker = new Timer({
      autoplay: false,
      onUpdate: () => {
        this.updated = true;
        this.manual = true;
        if (!this.disabled[0]) (this.animate as any)[this.xProp](this.overshootCoords.x, 1);
        if (!this.disabled[1]) (this.animate as any)[this.yProp](this.overshootCoords.y, 1);
      },
      onComplete: () => {
        this.manual = false;
        if (!this.disabled[0]) (this.animate as any)[this.xProp](this.overshootCoords.x, 0);
        if (!this.disabled[1]) (this.animate as any)[this.yProp](this.overshootCoords.y, 0);
      },
    }, null as any, 0).init();

    this.updateTicker = new Timer({ autoplay: false, onUpdate: () => this.update() }, null as any, 0).init();

    this.contained = !isUnd(container);
    this.manual = false;
    this.grabbed = false;
    this.dragged = false;
    this.updated = false;
    this.released = false;
    this.canScroll = false;
    this.enabled = false;
    this.initialized = false;
    this.activeProp = this.disabled[1] ? xProp : yProp;

    this.animate.callbacks.onRender = () => {
      const hasUpdated = this.updated;
      const hasMoved = this.grabbed && hasUpdated;
      const hasReleased = !hasMoved && this.released;
      const x = this.x;
      const y = this.y;
      const dx = x - this.coords[2];
      const dy = y - this.coords[3];
      this.deltaX = dx;
      this.deltaY = dy;
      this.coords[2] = x;
      this.coords[3] = y;
      if (hasUpdated && (dx || dy)) {
        this.onUpdate(this);
      }
      if (!hasReleased) {
        this.updated = false;
      } else {
        this.computeVelocity(dx, dy);
        this.angle = atan2(dy, dx);
      }
    };

    this.animate.callbacks.onComplete = () => {
      if (!this.grabbed && this.released) {
        this.released = false;
      }
      if (!this.manual) {
        this.deltaX = 0;
        this.deltaY = 0;
        this.velocity = 0;
        this.velocityStack[0] = 0;
        this.velocityStack[1] = 0;
        this.velocityStack[2] = 0;
        this.velocityStackIndex = 0;
        this.onSettle(this);
      }
    };

    this.resizeTicker = new Timer({
      autoplay: false,
      duration: 150 * globals.timeScale,
      onComplete: () => {
        this.onResize(this);
        this.refresh();
        this.onAfterResize(this);
      },
    }).init();

    this.parameters = parameters;
    this.resizeObserver = new ResizeObserver(() => {
      if (this.initialized) {
        this.resizeTicker.restart();
      } else {
        this.initialized = true;
      }
    });

    this.enable();
    this.refresh();
    this.resizeObserver.observe(this.$container);
    if (!isObj(target)) this.resizeObserver.observe(this.$target as HTMLElement);
  }

  computeVelocity(dx: number, dy: number): number {
    const prevTime = this.velocityTime;
    const curTime = now();
    const elapsed = curTime - prevTime;
    if (elapsed < 17) return this.velocity;
    this.velocityTime = curTime;
    const velocityStack = this.velocityStack;
    const vMul = this.velocityMultiplier;
    const minV = this.minVelocity;
    const maxV = this.maxVelocity;
    const vi = this.velocityStackIndex;
    velocityStack[vi] = round(clamp((sqrt(dx * dx + dy * dy) / elapsed) * vMul, minV, maxV), 5);
    const velocity = max(velocityStack[0], velocityStack[1], velocityStack[2]);
    this.velocity = velocity;
    this.velocityStackIndex = (vi + 1) % 3;
    return velocity;
  }

  setX(x: number, muteUpdateCallback: boolean = false): this {
    if (this.disabled[0]) return this;
    const v = round(x, 5);
    this.overshootTicker.pause();
    this.manual = true;
    this.updated = !muteUpdateCallback;
    this.destX = v;
    this.snapped[0] = snap(v, this.snapX);
    (this.animate as any)[this.xProp](v, 0);
    this.manual = false;
    return this;
  }

  setY(y: number, muteUpdateCallback: boolean = false): this {
    if (this.disabled[1]) return this;
    const v = round(y, 5);
    this.overshootTicker.pause();
    this.manual = true;
    this.updated = !muteUpdateCallback;
    this.destY = v;
    this.snapped[1] = snap(v, this.snapY);
    (this.animate as any)[this.yProp](v, 0);
    this.manual = false;
    return this;
  }

  get x(): number {
    return round((this.animate as any)[this.xProp]() as number, globals.precision);
  }

  set x(x: number) {
    this.setX(x, false);
  }

  get y(): number {
    return round((this.animate as any)[this.yProp]() as number, globals.precision);
  }

  set y(y: number) {
    this.setY(y, false);
  }

  get progressX(): number {
    return mapRange(this.x, this.containerBounds[3], this.containerBounds[1], 0, 1);
  }

  set progressX(x: number) {
    this.setX(mapRange(x, 0, 1, this.containerBounds[3], this.containerBounds[1]), false);
  }

  get progressY(): number {
    return mapRange(this.y, this.containerBounds[0], this.containerBounds[2], 0, 1);
  }

  set progressY(y: number) {
    this.setY(mapRange(y, 0, 1, this.containerBounds[0], this.containerBounds[2]), false);
  }

  updateScrollCoords(): void {
    const sx = round(this.useWin ? win.scrollX : this.$container.scrollLeft, 0);
    const sy = round(this.useWin ? win.scrollY : this.$container.scrollTop, 0);
    const [cpt, cpr, cpb, cpl] = this.containerPadding;
    const threshold = this.scrollThreshold;
    this.scroll.x = sx;
    this.scroll.y = sy;
    this.scrollBounds[0] = sy - this.targetBounds[0] + cpt - threshold;
    this.scrollBounds[1] = sx - this.targetBounds[1] - cpr + threshold;
    this.scrollBounds[2] = sy - this.targetBounds[2] - cpb + threshold;
    this.scrollBounds[3] = sx - this.targetBounds[3] + cpl - threshold;
  }

  updateBoundingValues(): void {
    const $container = this.$container;
    if (!$container) return;

    const cx = this.x;
    const cy = this.y;
    const cx2 = this.coords[2];
    const cy2 = this.coords[3];

    this.coords[2] = 0;
    this.coords[3] = 0;
    this.setX(0, true);
    this.setY(0, true);
    this.transforms.remove();

    const iw = this.window[0] = win.innerWidth;
    const ih = this.window[1] = win.innerHeight;
    const uw = this.useWin;
    const sw = $container.scrollWidth;
    const sh = $container.scrollHeight;
    const fx = this.fixed;
    const transformContainerRect = $container.getBoundingClientRect();
    const [cpt, cpr, cpb, cpl] = this.containerPadding;

    this.dragArea[0] = uw ? 0 : transformContainerRect.left;
    this.dragArea[1] = uw ? 0 : transformContainerRect.top;
    this.scrollView[0] = uw ? clamp(sw, iw, sw) : sw;
    this.scrollView[1] = uw ? clamp(sh, ih, sh) : sh;
    this.updateScrollCoords();

    const { width, height, left, top, right, bottom } = $container.getBoundingClientRect();
    this.dragArea[2] = round(uw ? clamp(width, iw, iw) : width, 0);
    this.dragArea[3] = round(uw ? clamp(height, ih, ih) : height, 0);

    const containerOverflow = get($container, 'overflow');
    const visibleOverflow = containerOverflow === 'visible';
    const hiddenOverflow = containerOverflow === 'hidden';

    this.canScroll = fx ? false :
      this.contained &&
      (($container === doc.body && visibleOverflow) || (!hiddenOverflow && !visibleOverflow)) &&
      (sw > this.dragArea[2] + cpl - cpr || sh > this.dragArea[3] + cpt - cpb) &&
      (!this.containerArray || (this.containerArray && !isArr(this.containerArray)));

    if (this.contained) {
      const sx = this.scroll.x;
      const sy = this.scroll.y;
      const canScroll = this.canScroll;
      const targetRect = (this.$target as HTMLElement).getBoundingClientRect();
      const hiddenLeft = canScroll ? uw ? 0 : $container.scrollLeft : 0;
      const hiddenTop = canScroll ? uw ? 0 : $container.scrollTop : 0;
      const hiddenRight = canScroll ? this.scrollView[0] - hiddenLeft - width : 0;
      const hiddenBottom = canScroll ? this.scrollView[1] - hiddenTop - height : 0;

      this.targetBounds[0] = round((targetRect.top + sy) - (uw ? 0 : top), 0);
      this.targetBounds[1] = round((targetRect.right + sx) - (uw ? iw : right), 0);
      this.targetBounds[2] = round((targetRect.bottom + sy) - (uw ? ih : bottom), 0);
      this.targetBounds[3] = round((targetRect.left + sx) - (uw ? 0 : left), 0);

      if (this.containerArray) {
        this.containerBounds[0] = this.containerArray[0] + cpt;
        this.containerBounds[1] = this.containerArray[1] - cpr;
        this.containerBounds[2] = this.containerArray[2] - cpb;
        this.containerBounds[3] = this.containerArray[3] + cpl;
      } else {
        this.containerBounds[0] = -round(targetRect.top - (fx ? clamp(top, 0, ih) : top) + hiddenTop - cpt, 0);
        this.containerBounds[1] = -round(targetRect.right - (fx ? clamp(right, 0, iw) : right) - hiddenRight + cpr, 0);
        this.containerBounds[2] = -round(targetRect.bottom - (fx ? clamp(bottom, 0, ih) : bottom) - hiddenBottom + cpb, 0);
        this.containerBounds[3] = -round(targetRect.left - (fx ? clamp(left, 0, iw) : left) + hiddenLeft - cpl, 0);
      }
    }

    this.transforms.revert();
    this.coords[2] = cx2;
    this.coords[3] = cy2;
    this.setX(cx, true);
    this.setY(cy, true);
  }

  isOutOfBounds(bounds: number[], x: number, y: number): number {
    if (!this.contained) return 0;
    const [bt, br, bb, bl] = bounds;
    const [dx, dy] = this.disabled;
    const obx = !dx && x < bl || !dx && x > br;
    const oby = !dy && y < bt || !dy && y > bb;
    return obx && !oby ? 1 : !obx && oby ? 2 : obx && oby ? 3 : 0;
  }

  refresh(): void {
    const params = this.parameters;
    const paramX = params.x;
    const paramY = params.y;
    const container = parseDraggableFunctionParameter(params.container, this);
    const cp = parseDraggableFunctionParameter(params.containerPadding, this) || 0;
    const containerPadding = (isArr(cp) ? cp : [cp, cp, cp, cp]) as [number, number, number, number];
    const cx = this.x;
    const cy = this.y;

    const parsedCursorStyles = parseDraggableFunctionParameter(params.cursor, this);
    const cursorStyles = { onHover: 'grab', onGrab: 'grabbing' };
    if (parsedCursorStyles) {
      const { onHover, onGrab } = parsedCursorStyles as DraggableCursorParams;
      if (onHover) cursorStyles.onHover = onHover;
      if (onGrab) cursorStyles.onGrab = onGrab;
    }

    const parsedDragThreshold = parseDraggableFunctionParameter(params.dragThreshold, this);
    const dragThreshold = { mouse: 3, touch: 7 };
    if (isNum(parsedDragThreshold)) {
      dragThreshold.mouse = parsedDragThreshold as number;
      dragThreshold.touch = parsedDragThreshold as number;
    } else if (parsedDragThreshold) {
      const { mouse, touch } = parsedDragThreshold as DraggableDragThresholdParams;
      if (!isUnd(mouse)) dragThreshold.mouse = mouse!;
      if (!isUnd(touch)) dragThreshold.touch = touch!;
    }

    this.containerArray = isArr(container) ? container as [number, number, number, number] : null;
    this.$container = (container && !this.containerArray ? parseTargets(container as DOMTarget)[0] : doc.body) as HTMLElement;
    this.useWin = this.$container === doc.body;
    this.$scrollContainer = this.useWin ? win : this.$container;
    this.isFinePointer = matchMedia('(pointer:fine)').matches;
    this.containerPadding = setValue(containerPadding, [0, 0, 0, 0]);
    this.containerFriction = clamp(setValue(parseDraggableFunctionParameter(params.containerFriction, this), 0.8), 0, 1);
    this.releaseContainerFriction = clamp(setValue(parseDraggableFunctionParameter(params.releaseContainerFriction, this), this.containerFriction), 0, 1);

    this.snapX = parseDraggableFunctionParameter(
      isObj(paramX) && !isUnd((paramX as DraggableAxisParam).snap) ? (paramX as DraggableAxisParam).snap : params.snap,
      this
    ) as any || 0;
    this.snapY = parseDraggableFunctionParameter(
      isObj(paramY) && !isUnd((paramY as DraggableAxisParam).snap) ? (paramY as DraggableAxisParam).snap : params.snap,
      this
    ) as any || 0;

    this.scrollSpeed = setValue(parseDraggableFunctionParameter(params.scrollSpeed, this), 1.5);
    this.scrollThreshold = setValue(parseDraggableFunctionParameter(params.scrollThreshold, this), 20);
    this.dragSpeed = setValue(parseDraggableFunctionParameter(params.dragSpeed, this), 1);
    this.dragThreshold = this.isFinePointer ? dragThreshold.mouse : dragThreshold.touch;
    this.minVelocity = setValue(parseDraggableFunctionParameter(params.minVelocity, this), 0);
    this.maxVelocity = setValue(parseDraggableFunctionParameter(params.maxVelocity, this), 50);
    this.velocityMultiplier = setValue(parseDraggableFunctionParameter(params.velocityMultiplier, this), 1);
    this.cursor = parsedCursorStyles === false ? false : cursorStyles;
    this.updateBoundingValues();

    const [bt, br, bb, bl] = this.containerBounds;
    this.setX(clamp(cx, bl, br), true);
    this.setY(clamp(cy, bt, bb), true);
  }

  update(): void {
    this.updateScrollCoords();
    if (this.canScroll) {
      const [cpt, cpr, cpb, cpl] = this.containerPadding;
      const [sw, sh] = this.scrollView;
      const daw = this.dragArea[2];
      const dah = this.dragArea[3];
      const csx = this.scroll.x;
      const csy = this.scroll.y;
      const nsw = this.$container.scrollWidth;
      const nsh = this.$container.scrollHeight;
      const csw = this.useWin ? clamp(nsw, this.window[0], nsw) : nsw;
      const csh = this.useWin ? clamp(nsh, this.window[1], nsh) : nsh;
      const swd = sw - csw;
      const shd = sh - csh;

      if (this.dragged && swd > 0) {
        this.coords[0] -= swd;
        this.scrollView[0] = csw;
      }
      if (this.dragged && shd > 0) {
        this.coords[1] -= shd;
        this.scrollView[1] = csh;
      }

      const s = this.scrollSpeed * 10;
      const threshold = this.scrollThreshold;
      const [x, y] = this.coords;
      const [st, sr, sb, sl] = this.scrollBounds;
      const t = round(clamp((y - st + cpt) / threshold, -1, 0) * s, 0);
      const r = round(clamp((x - sr - cpr) / threshold, 0, 1) * s, 0);
      const b = round(clamp((y - sb - cpb) / threshold, 0, 1) * s, 0);
      const l = round(clamp((x - sl + cpl) / threshold, -1, 0) * s, 0);

      if (t || b || l || r) {
        const [nx, ny] = this.disabled;
        let scrollX = csx;
        let scrollY = csy;
        if (!nx) {
          scrollX = round(clamp(csx + (l || r), 0, sw - daw), 0);
          this.coords[0] -= csx - scrollX;
        }
        if (!ny) {
          scrollY = round(clamp(csy + (t || b), 0, sh - dah), 0);
          this.coords[1] -= csy - scrollY;
        }
        if (this.useWin) {
          (this.$scrollContainer as Window).scrollBy(-(csx - scrollX), -(csy - scrollY));
        } else {
          (this.$scrollContainer as HTMLElement).scrollTo(scrollX, scrollY);
        }
      }
    }

    const [ct, cr, cb, cl] = this.containerBounds;
    const [px1, py1, px2, py2, px3, py3] = this.pointer;
    this.coords[0] += (px1 - px3) * this.dragSpeed;
    this.coords[1] += (py1 - py3) * this.dragSpeed;
    this.pointer[4] = px1;
    this.pointer[5] = py1;
    const [cx, cy] = this.coords;
    const [sx, sy] = this.snapped;
    const cf = (1 - this.containerFriction) * this.dragSpeed;
    this.setX(cx > cr ? cr + (cx - cr) * cf : cx < cl ? cl + (cx - cl) * cf : cx, false);
    this.setY(cy > cb ? cb + (cy - cb) * cf : cy < ct ? ct + (cy - ct) * cf : cy, false);
    this.computeVelocity(px1 - px3, py1 - py3);
    this.angle = atan2(py1 - py2, px1 - px2);
    const [nsx, nsy] = this.snapped;
    if (nsx !== sx && this.snapX || nsy !== sy && this.snapY) {
      this.onSnap(this);
    }
  }

  stop(): this {
    this.updateTicker.pause();
    this.overshootTicker.pause();
    for (let prop in this.animate.animations) this.animate.animations[prop].pause();
    removeTargetsFromRenderable([this], null as any, 'x');
    removeTargetsFromRenderable([this], null as any, 'y');
    removeTargetsFromRenderable([this], null as any, 'progressX');
    removeTargetsFromRenderable([this], null as any, 'progressY');
    removeTargetsFromRenderable([this.scroll]);
    removeTargetsFromRenderable([this.overshootCoords]);
    return this;
  }

  scrollInView(duration?: number, gap: number = 0, ease: EasingParam = eases.inOutQuad): this {
    this.updateScrollCoords();
    const x = this.destX;
    const y = this.destY;
    const scroll = this.scroll;
    const scrollBounds = this.scrollBounds;
    const canScroll = this.canScroll;

    if (!this.containerArray && this.isOutOfBounds(scrollBounds, x, y)) {
      const [st, sr, sb, sl] = scrollBounds;
      const t = round(clamp(y - st, -maxValue, 0), 0);
      const r = round(clamp(x - sr, 0, maxValue), 0);
      const b = round(clamp(y - sb, 0, maxValue), 0);
      const l = round(clamp(x - sl, -maxValue, 0), 0);

      new JSAnimation(scroll, {
        x: round(scroll.x + (l ? l - gap : r ? r + gap : 0), 0),
        y: round(scroll.y + (t ? t - gap : b ? b + gap : 0), 0),
        duration: isUnd(duration) ? 350 * globals.timeScale : duration,
        ease,
        onUpdate: () => {
          this.canScroll = false;
          (this.$scrollContainer as HTMLElement).scrollTo(scroll.x, scroll.y);
        }
      }).init().then(() => {
        this.canScroll = canScroll;
      });
    }
    return this;
  }

  handleHover(): void {
    if (this.isFinePointer && this.cursor && !this.cursorStyles) {
      this.cursorStyles = set(this.$trigger, {
        cursor: (this.cursor as DraggableCursorParams).onHover
      });
    }
  }

  animateInView(duration?: number, gap: number = 0, ease: EasingParam = eases.inOutQuad): this {
    this.stop();
    this.updateBoundingValues();
    const x = this.x;
    const y = this.y;
    const [cpt, cpr, cpb, cpl] = this.containerPadding;
    const bt = this.scroll.y - this.targetBounds[0] + cpt + gap;
    const br = this.scroll.x - this.targetBounds[1] - cpr - gap;
    const bb = this.scroll.y - this.targetBounds[2] - cpb - gap;
    const bl = this.scroll.x - this.targetBounds[3] + cpl + gap;
    const ob = this.isOutOfBounds([bt, br, bb, bl], x, y);

    if (ob) {
      const [disabledX, disabledY] = this.disabled;
      const destX = clamp(snap(x, this.snapX), bl, br);
      const destY = clamp(snap(y, this.snapY), bt, bb);
      const dur = isUnd(duration) ? 350 * globals.timeScale : duration;
      if (!disabledX && (ob === 1 || ob === 3)) (this.animate as any)[this.xProp](destX, dur, ease);
      if (!disabledY && (ob === 2 || ob === 3)) (this.animate as any)[this.yProp](destY, dur, ease);
    }
    return this;
  }

  handleDown(e: MouseEvent | TouchEvent): void {
    const $eTarget = e.target as HTMLElement;
    if (this.grabbed || ($eTarget as HTMLInputElement).type === 'range') return;

    e.stopPropagation();

    this.grabbed = true;
    this.released = false;
    this.stop();
    this.updateBoundingValues();

    const touches = (e as TouchEvent).changedTouches;
    const eventX = touches ? touches[0].clientX : (e as MouseEvent).clientX;
    const eventY = touches ? touches[0].clientY : (e as MouseEvent).clientY;
    const { x, y } = this.transforms.normalizePoint(eventX, eventY);
    const [ct, cr, cb, cl] = this.containerBounds;
    const cf = (1 - this.containerFriction) * this.dragSpeed;
    const cx = this.x;
    const cy = this.y;

    this.coords[0] = this.coords[2] = !cf ? cx : cx > cr ? cr + (cx - cr) / cf : cx < cl ? cl + (cx - cl) / cf : cx;
    this.coords[1] = this.coords[3] = !cf ? cy : cy > cb ? cb + (cy - cb) / cf : cy < ct ? ct + (cy - ct) / cf : cy;
    this.pointer[0] = x;
    this.pointer[1] = y;
    this.pointer[2] = x;
    this.pointer[3] = y;
    this.pointer[4] = x;
    this.pointer[5] = y;
    this.pointer[6] = x;
    this.pointer[7] = y;
    this.deltaX = 0;
    this.deltaY = 0;
    this.velocity = 0;
    this.velocityStack[0] = 0;
    this.velocityStack[1] = 0;
    this.velocityStack[2] = 0;
    this.velocityStackIndex = 0;
    this.angle = 0;

    if (this.targetStyles) {
      (this.targetStyles as any).revert();
      this.targetStyles = null;
    }

    const z = get(this.$target as HTMLElement, 'zIndex', false) as number;
    zIndex = (z > zIndex ? z : zIndex) + 1;
    this.targetStyles = set(this.$target as HTMLElement, { zIndex });

    if (this.triggerStyles) {
      (this.triggerStyles as any).revert();
      this.triggerStyles = null;
    }
    if (this.cursorStyles) {
      (this.cursorStyles as any).revert();
      this.cursorStyles = null;
    }
    if (this.isFinePointer && this.cursor) {
      this.bodyStyles = set(doc.body, {
        cursor: (this.cursor as DraggableCursorParams).onGrab
      });
    }

    this.scrollInView(100, 0, eases.out(3) as EasingParam);
    this.onGrab(this);

    doc.addEventListener('touchmove', this as EventListener);
    doc.addEventListener('touchend', this as EventListener);
    doc.addEventListener('touchcancel', this as EventListener);
    doc.addEventListener('mousemove', this as EventListener);
    doc.addEventListener('mouseup', this as EventListener);
    doc.addEventListener('selectstart', this as EventListener);
  }

  handleMove(e: MouseEvent | TouchEvent): void {
    if (!this.grabbed) return;

    const touches = (e as TouchEvent).changedTouches;
    const eventX = touches ? touches[0].clientX : (e as MouseEvent).clientX;
    const eventY = touches ? touches[0].clientY : (e as MouseEvent).clientY;
    const { x, y } = this.transforms.normalizePoint(eventX, eventY);
    const movedX = x - this.pointer[6];
    const movedY = y - this.pointer[7];

    let $parent = e.target as HTMLElement;
    let isAtTop = false;
    let isAtBottom = false;
    let canTouchScroll = false;

    while (touches && $parent && $parent !== this.$trigger) {
      const overflowY = get($parent, 'overflow-y');
      if (overflowY !== 'hidden' && overflowY !== 'visible') {
        const { scrollTop, scrollHeight, clientHeight } = $parent;
        if (scrollHeight > clientHeight) {
          canTouchScroll = true;
          isAtTop = scrollTop <= 3;
          isAtBottom = scrollTop >= (scrollHeight - clientHeight) - 3;
          break;
        }
      }
      $parent = $parent.parentElement as HTMLElement;
    }

    if (canTouchScroll && ((!isAtTop && !isAtBottom) || (isAtTop && movedY < 0) || (isAtBottom && movedY > 0))) {
      this.pointer[0] = x;
      this.pointer[1] = y;
      this.pointer[2] = x;
      this.pointer[3] = y;
      this.pointer[4] = x;
      this.pointer[5] = y;
      this.pointer[6] = x;
      this.pointer[7] = y;
    } else {
      preventDefault(e);

      if (!this.triggerStyles) this.triggerStyles = set(this.$trigger, { pointerEvents: 'none' });
      this.$trigger.addEventListener('touchstart', preventDefault, { passive: false });
      this.$trigger.addEventListener('touchmove', preventDefault, { passive: false });
      this.$trigger.addEventListener('touchend', preventDefault);

      if (this.dragged || (!this.disabled[0] && abs(movedX) > this.dragThreshold) || (!this.disabled[1] && abs(movedY) > this.dragThreshold)) {
        this.updateTicker.resume();
        this.pointer[2] = this.pointer[0];
        this.pointer[3] = this.pointer[1];
        this.pointer[0] = x;
        this.pointer[1] = y;
        this.dragged = true;
        this.released = false;
        this.onDrag(this);
      }
    }
  }

  handleUp(): void {
    if (!this.grabbed) return;

    this.updateTicker.pause();

    if (this.triggerStyles) {
      (this.triggerStyles as any).revert();
      this.triggerStyles = null;
    }

    if (this.bodyStyles) {
      (this.bodyStyles as any).revert();
      this.bodyStyles = null;
    }

    const [disabledX, disabledY] = this.disabled;
    const [px1, py1, px2, py2, px3, py3] = this.pointer;
    const [ct, cr, cb, cl] = this.containerBounds;
    const [sx, sy] = this.snapped;
    const springX = this.releaseXSpring;
    const springY = this.releaseYSpring;
    const releaseEase = this.releaseEase;
    const hasReleaseSpring = this.hasReleaseSpring;
    const overshootCoords = this.overshootCoords;
    const cx = this.x;
    const cy = this.y;
    const pv = this.computeVelocity(px1 - px3, py1 - py3);
    const pa = this.angle = atan2(py1 - py2, px1 - px2);
    const ds = pv * 150;
    const cf = (1 - this.releaseContainerFriction) * this.dragSpeed;
    const nx = cx + (cos(pa) * ds);
    const ny = cy + (sin(pa) * ds);
    const bx = nx > cr ? cr + (nx - cr) * cf : nx < cl ? cl + (nx - cl) * cf : nx;
    const by = ny > cb ? cb + (ny - cb) * cf : ny < ct ? ct + (ny - ct) * cf : ny;
    const dx = this.destX = clamp(round(snap(bx, this.snapX), 5), cl, cr);
    const dy = this.destY = clamp(round(snap(by, this.snapY), 5), ct, cb);
    const ob = this.isOutOfBounds(this.containerBounds, nx, ny);

    let durationX = 0;
    let durationY = 0;
    let easeX: EasingFunction = releaseEase;
    let easeY: EasingFunction = releaseEase;
    let longestReleaseDuration = 0;

    overshootCoords.x = cx;
    overshootCoords.y = cy;

    if (!disabledX) {
      const directionX = dx === cr ? cx > cr ? -1 : 1 : cx < cl ? -1 : 1;
      const distanceX = round(cx - dx, 0);
      springX.velocity = disabledY && hasReleaseSpring ? distanceX ? (ds * directionX) / abs(distanceX) : 0 : pv;
      const { ease, settlingDuration, restDuration } = springX;
      durationX = cx === dx ? 0 : hasReleaseSpring ? settlingDuration : settlingDuration - (restDuration * globals.timeScale);
      if (hasReleaseSpring) easeX = ease;
      if (durationX > longestReleaseDuration) longestReleaseDuration = durationX;
    }

    if (!disabledY) {
      const directionY = dy === cb ? cy > cb ? -1 : 1 : cy < ct ? -1 : 1;
      const distanceY = round(cy - dy, 0);
      springY.velocity = disabledX && hasReleaseSpring ? distanceY ? (ds * directionY) / abs(distanceY) : 0 : pv;
      const { ease, settlingDuration, restDuration } = springY;
      durationY = cy === dy ? 0 : hasReleaseSpring ? settlingDuration : settlingDuration - (restDuration * globals.timeScale);
      if (hasReleaseSpring) easeY = ease;
      if (durationY > longestReleaseDuration) longestReleaseDuration = durationY;
    }

    if (!hasReleaseSpring && ob && cf && (durationX || durationY)) {
      const composition = compositionTypes.blend;

      new JSAnimation(overshootCoords, {
        x: { to: bx, duration: durationX * 0.65 },
        y: { to: by, duration: durationY * 0.65 },
        ease: releaseEase,
        composition,
      }).init();

      new JSAnimation(overshootCoords, {
        x: { to: dx, duration: durationX },
        y: { to: dy, duration: durationY },
        ease: releaseEase,
        composition,
      }).init();

      this.overshootTicker.stretch(max(durationX, durationY)).restart();
    } else {
      if (!disabledX) (this.animate as any)[this.xProp](dx, durationX, easeX);
      if (!disabledY) (this.animate as any)[this.yProp](dy, durationY, easeY);
    }

    this.scrollInView(longestReleaseDuration, this.scrollThreshold, releaseEase);

    let hasSnapped = false;

    if (dx !== sx) {
      this.snapped[0] = dx;
      if (this.snapX) hasSnapped = true;
    }

    if (dy !== sy && this.snapY) {
      this.snapped[1] = dy;
      if (this.snapY) hasSnapped = true;
    }

    if (hasSnapped) this.onSnap(this);

    this.grabbed = false;
    this.dragged = false;
    this.updated = true;
    this.released = true;

    this.onRelease(this);

    this.$trigger.removeEventListener('touchstart', preventDefault);
    this.$trigger.removeEventListener('touchmove', preventDefault);
    this.$trigger.removeEventListener('touchend', preventDefault);

    doc.removeEventListener('touchmove', this as EventListener);
    doc.removeEventListener('touchend', this as EventListener);
    doc.removeEventListener('touchcancel', this as EventListener);
    doc.removeEventListener('mousemove', this as EventListener);
    doc.removeEventListener('mouseup', this as EventListener);
    doc.removeEventListener('selectstart', this as EventListener);
  }

  reset(): this {
    this.stop();
    this.resizeTicker.pause();
    this.grabbed = false;
    this.dragged = false;
    this.updated = false;
    this.released = false;
    this.canScroll = false;
    this.setX(0, true);
    this.setY(0, true);
    this.coords[0] = 0;
    this.coords[1] = 0;
    this.pointer[0] = 0;
    this.pointer[1] = 0;
    this.pointer[2] = 0;
    this.pointer[3] = 0;
    this.pointer[4] = 0;
    this.pointer[5] = 0;
    this.pointer[6] = 0;
    this.pointer[7] = 0;
    this.velocity = 0;
    this.velocityStack[0] = 0;
    this.velocityStack[1] = 0;
    this.velocityStack[2] = 0;
    this.velocityStackIndex = 0;
    this.angle = 0;
    return this;
  }

  enable(): this {
    if (!this.enabled) {
      this.enabled = true;
      (this.$target as HTMLElement).classList.remove('is-disabled');
      this.touchActionStyles = set(this.$trigger, {
        touchAction: this.disabled[0] ? 'pan-x' : this.disabled[1] ? 'pan-y' : 'none'
      });
      this.$trigger.addEventListener('touchstart', this as EventListener, { passive: true });
      this.$trigger.addEventListener('mousedown', this as EventListener, { passive: true });
      this.$trigger.addEventListener('mouseenter', this as EventListener);
    }
    return this;
  }

  disable(): this {
    this.enabled = false;
    this.grabbed = false;
    this.dragged = false;
    this.updated = false;
    this.released = false;
    this.canScroll = false;
    (this.touchActionStyles as any)?.revert();
    if (this.cursorStyles) {
      (this.cursorStyles as any).revert();
      this.cursorStyles = null;
    }
    if (this.triggerStyles) {
      (this.triggerStyles as any).revert();
      this.triggerStyles = null;
    }
    if (this.bodyStyles) {
      (this.bodyStyles as any).revert();
      this.bodyStyles = null;
    }
    if (this.targetStyles) {
      (this.targetStyles as any).revert();
      this.targetStyles = null;
    }
    (this.$target as HTMLElement).classList.add('is-disabled');
    this.$trigger.removeEventListener('touchstart', this as EventListener);
    this.$trigger.removeEventListener('mousedown', this as EventListener);
    this.$trigger.removeEventListener('mouseenter', this as EventListener);
    doc.removeEventListener('touchmove', this as EventListener);
    doc.removeEventListener('touchend', this as EventListener);
    doc.removeEventListener('touchcancel', this as EventListener);
    doc.removeEventListener('mousemove', this as EventListener);
    doc.removeEventListener('mouseup', this as EventListener);
    doc.removeEventListener('selectstart', this as EventListener);
    return this;
  }

  revert(): this {
    this.reset();
    this.disable();
    (this.$target as HTMLElement).classList.remove('is-disabled');
    this.updateTicker.revert();
    this.overshootTicker.revert();
    this.resizeTicker.revert();
    this.animate.revert();
    this.resizeObserver.disconnect();
    return this;
  }

  handleEvent(e: Event): void {
    switch (e.type) {
      case 'mousedown':
        this.handleDown(e as MouseEvent);
        break;
      case 'touchstart':
        this.handleDown(e as TouchEvent);
        break;
      case 'mousemove':
        this.handleMove(e as MouseEvent);
        break;
      case 'touchmove':
        this.handleMove(e as TouchEvent);
        break;
      case 'mouseup':
        this.handleUp();
        break;
      case 'touchend':
        this.handleUp();
        break;
      case 'touchcancel':
        this.handleUp();
        break;
      case 'mouseenter':
        this.handleHover();
        break;
      case 'selectstart':
        preventDefault(e);
        break;
    }
  }
}

/**
 * Create a new Draggable instance
 */
export function createDraggable(target: TargetsParam, parameters?: DraggableParams): Draggable {
  return new Draggable(target, parameters);
}
