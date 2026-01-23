// Events - Scroll Observer

import {
  win,
  doc,
  noop,
  isDomSymbol,
  relativeValuesExecRgx,
} from '../core/consts';
import { scope, globals } from '../core/globals';
import {
  addChild,
  removeChild,
  forEachChildren,
  lerp,
  clamp,
  round,
  isFnc,
  isNum,
  isObj,
  isStr,
  isUnd,
} from '../core/helpers';
import { parseTargets } from '../core/targets';
import {
  decomposeRawValue,
  decomposedOriginalValue,
  getRelativeValue,
  setValue,
} from '../core/values';
import { convertValueUnit } from '../core/units';
import { Timer } from '../timer/timer';
import { get, set } from '../utils/target';
import { sync } from '../utils/time';
import { none } from '../easings/none';
import { parseEase } from '../easings/eases/parser';
import type {
  TargetsParam,
  EasingFunction,
  Callback,
  EasingParam,
  ScrollThresholdValue,
  ScrollObserverParams,
  Tickable,
  ScrollThresholdParam,
  ScrollThresholdCallback,
  DOMTarget,
} from '../types';

// Forward declarations
interface JSAnimation extends Tickable {
  targets: Array<DOMTarget & { [isDomSymbol]?: boolean }>;
  seek(time: number, muteCallbacks?: boolean): this;
}

interface WAAPIAnimation {
  pause(): void;
  persist?: boolean;
  currentTime: number;
  duration: number;
  progress: number;
  completed?: boolean;
}

interface Timeline extends Tickable {
  _head: unknown;
}

function getMaxViewHeight(): number {
  const $el = doc!.createElement('div');
  doc!.body.appendChild($el);
  $el.style.height = '100lvh';
  const height = $el.offsetHeight;
  doc!.body.removeChild($el);
  return height;
}

function parseScrollObserverFunctionParameter<T>(
  value: T | ((observer: ScrollObserver) => T),
  scroller: ScrollObserver
): T {
  return value && isFnc(value) ? (value as (observer: ScrollObserver) => T)(scroller) : value as T;
}

export const scrollContainers = new Map<HTMLElement, ScrollContainer>();

class ScrollContainer {
  element: HTMLElement;
  useWin: boolean;
  winWidth: number = 0;
  winHeight: number = 0;
  width: number = 0;
  height: number = 0;
  left: number = 0;
  top: number = 0;
  scale: number = 1;
  zIndex: number = 0;
  scrollX: number = 0;
  scrollY: number = 0;
  prevScrollX: number = 0;
  prevScrollY: number = 0;
  scrollWidth: number = 0;
  scrollHeight: number = 0;
  velocity: number = 0;
  backwardX: boolean = false;
  backwardY: boolean = false;
  scrollTicker: Timer;
  dataTimer: Timer;
  resizeTicker: Timer;
  wakeTicker: Timer;
  _head: ScrollObserver | null = null;
  _tail: ScrollObserver | null = null;
  resizeObserver: ResizeObserver;

  constructor($el: HTMLElement) {
    this.element = $el;
    this.useWin = this.element === doc!.body;

    this.scrollTicker = new Timer({
      autoplay: false,
      onBegin: () => this.dataTimer.resume(),
      onUpdate: () => {
        const backwards = this.backwardX || this.backwardY;
        forEachChildren(this, (child: ScrollObserver) => child.handleScroll(), backwards);
      },
      onComplete: () => this.dataTimer.pause()
    }).init();

    this.dataTimer = new Timer({
      autoplay: false,
      frameRate: 30,
      onUpdate: (self: Timer) => {
        const dt = self.deltaTime;
        const px = this.prevScrollX;
        const py = this.prevScrollY;
        const nx = this.scrollX;
        const ny = this.scrollY;
        const dx = px - nx;
        const dy = py - ny;
        this.prevScrollX = nx;
        this.prevScrollY = ny;
        if (dx) this.backwardX = px > nx;
        if (dy) this.backwardY = py > ny;
        this.velocity = round(dt > 0 ? Math.sqrt(dx * dx + dy * dy) / dt : 0, 5);
      }
    }).init();

    this.resizeTicker = new Timer({
      autoplay: false,
      duration: 250 * globals.timeScale,
      onComplete: () => {
        this.updateWindowBounds();
        this.refreshScrollObservers();
        this.handleScroll();
      }
    }).init();

    this.wakeTicker = new Timer({
      autoplay: false,
      duration: 500 * globals.timeScale,
      onBegin: () => {
        this.scrollTicker.resume();
      },
      onComplete: () => {
        this.scrollTicker.pause();
      }
    }).init();

    this.updateScrollCoords();
    this.updateWindowBounds();
    this.updateBounds();
    this.refreshScrollObservers();
    this.handleScroll();

    this.resizeObserver = new ResizeObserver(() => this.resizeTicker.restart());
    this.resizeObserver.observe(this.element);
    (this.useWin ? win! : this.element).addEventListener('scroll', this as unknown as EventListener, false);
  }

  updateScrollCoords(): void {
    const useWin = this.useWin;
    const $el = this.element;
    this.scrollX = round(useWin ? win!.scrollX : $el.scrollLeft, 0);
    this.scrollY = round(useWin ? win!.scrollY : $el.scrollTop, 0);
  }

  updateWindowBounds(): void {
    this.winWidth = win!.innerWidth;
    this.winHeight = getMaxViewHeight();
  }

  updateBounds(): void {
    const style = getComputedStyle(this.element);
    const $el = this.element;
    this.scrollWidth = $el.scrollWidth + parseFloat(style.marginLeft) + parseFloat(style.marginRight);
    this.scrollHeight = $el.scrollHeight + parseFloat(style.marginTop) + parseFloat(style.marginBottom);
    this.updateWindowBounds();
    let width: number, height: number;
    if (this.useWin) {
      width = this.winWidth;
      height = this.winHeight;
    } else {
      const elRect = $el.getBoundingClientRect();
      width = $el.clientWidth;
      height = $el.clientHeight;
      this.top = elRect.top;
      this.left = elRect.left;
      this.scale = elRect.width ? width / elRect.width : (elRect.height ? height / elRect.height : 1);
    }
    this.width = width;
    this.height = height;
  }

  refreshScrollObservers(): void {
    forEachChildren(this, (child: ScrollObserver) => {
      if (child._debug) {
        child.removeDebug();
      }
    });
    this.updateBounds();
    forEachChildren(this, (child: ScrollObserver) => {
      child.refresh();
      child.onResize(child);
      if (child._debug) {
        child.debug();
      }
    });
  }

  refresh(): void {
    this.updateWindowBounds();
    this.updateBounds();
    this.refreshScrollObservers();
    this.handleScroll();
  }

  handleScroll(): void {
    this.updateScrollCoords();
    this.wakeTicker.restart();
  }

  handleEvent(e: Event): void {
    switch (e.type) {
      case 'scroll':
        this.handleScroll();
        break;
    }
  }

  revert(): void {
    this.scrollTicker.cancel();
    this.dataTimer.cancel();
    this.resizeTicker.cancel();
    this.wakeTicker.cancel();
    this.resizeObserver.disconnect();
    (this.useWin ? win! : this.element).removeEventListener('scroll', this as unknown as EventListener);
    scrollContainers.delete(this.element);
  }
}

function registerAndGetScrollContainer(target?: TargetsParam): ScrollContainer {
  const $el = (target ? parseTargets(target)[0] || doc!.body : doc!.body) as HTMLElement;
  let scrollContainer = scrollContainers.get($el);
  if (!scrollContainer) {
    scrollContainer = new ScrollContainer($el);
    scrollContainers.set($el, scrollContainer);
  }
  return scrollContainer;
}

function convertValueToPx($el: HTMLElement, v: number | string, size: number, under?: number, over?: number): number {
  const clampMin = v === 'min';
  const clampMax = v === 'max';
  const value = v === 'top' || v === 'left' || v === 'start' || clampMin ? 0 :
                v === 'bottom' || v === 'right' || v === 'end' || clampMax ? '100%' :
                v === 'center' ? '50%' :
                v;
  const { n, u } = decomposeRawValue(value, decomposedOriginalValue);
  let px = n;
  if (u === '%') {
    px = (n / 100) * size;
  } else if (u) {
    px = convertValueUnit($el as DOMTarget, decomposedOriginalValue, 'px', true).n;
  }
  if (clampMax && under !== undefined && under < 0) px += under;
  if (clampMin && over !== undefined && over > 0) px += over;
  return px;
}

function parseBoundValue($el: HTMLElement, v: ScrollThresholdValue, size: number, under?: number, over?: number): number {
  let value: number;
  if (isStr(v)) {
    const matchedOperator = relativeValuesExecRgx.exec(v as string);
    if (matchedOperator) {
      const splitter = matchedOperator[0];
      const operator = splitter[0];
      const splitted = (v as string).split(splitter);
      const clampMin = splitted[0] === 'min';
      const clampMax = splitted[0] === 'max';
      const valueAPx = convertValueToPx($el, splitted[0], size, under, over);
      const valueBPx = convertValueToPx($el, splitted[1], size, under, over);
      if (clampMin) {
        const min = getRelativeValue(convertValueToPx($el, 'min', size), valueBPx, operator);
        value = min < valueAPx ? valueAPx : min;
      } else if (clampMax) {
        const max = getRelativeValue(convertValueToPx($el, 'max', size), valueBPx, operator);
        value = max > valueAPx ? valueAPx : max;
      } else {
        value = getRelativeValue(valueAPx, valueBPx, operator);
      }
    } else {
      value = convertValueToPx($el, v, size, under, over);
    }
  } else {
    value = v as number;
  }
  return round(value, 0);
}

function getAnimationDomTarget(linked: JSAnimation): HTMLElement | undefined {
  let $linkedTarget: HTMLElement | undefined;
  const linkedTargets = linked.targets;
  for (let i = 0, l = linkedTargets.length; i < l; i++) {
    const target = linkedTargets[i];
    if ((target as { [isDomSymbol]?: boolean })[isDomSymbol]) {
      $linkedTarget = target as HTMLElement;
      break;
    }
  }
  return $linkedTarget;
}

let scrollerIndex = 0;

const debugColors = ['#FF4B4B','#FF971B','#FFC730','#F9F640','#7AFF5A','#18FF74','#17E09B','#3CFFEC','#05DBE9','#33B3F1','#638CF9','#C563FE','#FF4FCF','#F93F8A'];

export class ScrollObserver {
  index: number;
  id: string | number;
  container: ScrollContainer;
  target: HTMLElement | null = null;
  linked: Tickable | WAAPIAnimation | null = null;
  repeat: boolean | null = null;
  horizontal: boolean | null = null;
  enter: ScrollThresholdParam | ScrollThresholdValue | ScrollThresholdCallback | null = null;
  leave: ScrollThresholdParam | ScrollThresholdValue | ScrollThresholdCallback | null = null;
  sync: boolean;
  syncEase: EasingFunction | null;
  syncSmooth: number | null;
  onSyncEnter: Callback<ScrollObserver>;
  onSyncLeave: Callback<ScrollObserver>;
  onSyncEnterForward: Callback<ScrollObserver>;
  onSyncLeaveForward: Callback<ScrollObserver>;
  onSyncEnterBackward: Callback<ScrollObserver>;
  onSyncLeaveBackward: Callback<ScrollObserver>;
  onEnter: Callback<ScrollObserver>;
  onLeave: Callback<ScrollObserver>;
  onEnterForward: Callback<ScrollObserver>;
  onLeaveForward: Callback<ScrollObserver>;
  onEnterBackward: Callback<ScrollObserver>;
  onLeaveBackward: Callback<ScrollObserver>;
  onUpdate: Callback<ScrollObserver>;
  onResize: Callback<ScrollObserver>;
  onSyncComplete: Callback<ScrollObserver>;
  reverted: boolean = false;
  ready: boolean = false;
  completed: boolean = false;
  began: boolean = false;
  isInView: boolean = false;
  forceEnter: boolean = false;
  hasEntered: boolean = false;
  offset: number = 0;
  offsetStart: number = 0;
  offsetEnd: number = 0;
  distance: number = 0;
  prevProgress: number = 0;
  thresholds: [string, string, string, string] = ['start', 'end', 'end', 'start'];
  coords: [number, number, number, number] = [0, 0, 0, 0];
  debugStyles: JSAnimation | null = null;
  $debug: HTMLElement | null = null;
  _params: ScrollObserverParams;
  _debug: boolean;
  _next: ScrollObserver | null = null;
  _prev: ScrollObserver | null = null;

  constructor(parameters: ScrollObserverParams = {}) {
    if (scope.current) scope.current.register(this);
    const syncMode = setValue(parameters.sync, 'play pause');
    const ease = syncMode ? parseEase(syncMode as EasingParam) : null;
    const isLinear = syncMode && (syncMode === 'linear' || syncMode === none);
    const isEase = syncMode && !(ease === none && !isLinear);
    const isSmooth = syncMode && (isNum(syncMode) || syncMode === true || isLinear);
    const isMethods = syncMode && (isStr(syncMode) && !isEase && !isSmooth);
    const syncMethods = isMethods ? (syncMode as string).split(' ').map(
      (m: string) => () => {
        const linked = this.linked as Tickable & Record<string, () => unknown>;
        return linked && linked[m] ? linked[m]() : null;
      }
    ) : null;
    const biDirSync = isMethods && syncMethods!.length > 2;

    this.index = scrollerIndex++;
    this.id = !isUnd(parameters.id) ? parameters.id! : this.index;
    this.container = registerAndGetScrollContainer(parameters.container);
    this.sync = isEase || isSmooth || !!syncMethods;
    this.syncEase = isEase ? ease : null;
    this.syncSmooth = isSmooth ? syncMode === true || isLinear ? 1 : syncMode as number : null;
    this.onSyncEnter = syncMethods && !biDirSync && syncMethods[0] ? syncMethods[0] : noop;
    this.onSyncLeave = syncMethods && !biDirSync && syncMethods[1] ? syncMethods[1] : noop;
    this.onSyncEnterForward = syncMethods && biDirSync && syncMethods[0] ? syncMethods[0] : noop;
    this.onSyncLeaveForward = syncMethods && biDirSync && syncMethods[1] ? syncMethods[1] : noop;
    this.onSyncEnterBackward = syncMethods && biDirSync && syncMethods[2] ? syncMethods[2] : noop;
    this.onSyncLeaveBackward = syncMethods && biDirSync && syncMethods[3] ? syncMethods[3] : noop;
    this.onEnter = parameters.onEnter || noop;
    this.onLeave = parameters.onLeave || noop;
    this.onEnterForward = parameters.onEnterForward || noop;
    this.onLeaveForward = parameters.onLeaveForward || noop;
    this.onEnterBackward = parameters.onEnterBackward || noop;
    this.onLeaveBackward = parameters.onLeaveBackward || noop;
    this.onUpdate = parameters.onUpdate || noop;
    this.onResize = parameters.onResize || noop;
    this.onSyncComplete = parameters.onSyncComplete || noop;
    this._params = parameters;
    this._debug = setValue(parameters.debug, false) as boolean;

    addChild(this.container, this);

    sync(() => {
      if (this.reverted) return;
      if (!this.target) {
        const target = parseTargets(parameters.target)[0] as HTMLElement;
        this.target = target || doc!.body;
        this.refresh();
      }
      if (this._debug) this.debug();
    });
  }

  link(linked: Tickable | WAAPIAnimation): this {
    if (linked) {
      (linked as Tickable).pause();
      this.linked = linked;
      if (!isUnd((linked as WAAPIAnimation).persist)) (linked as WAAPIAnimation).persist = true;
      if (!this._params.target) {
        let $linkedTarget: HTMLElement | undefined;
        if (!isUnd((linked as JSAnimation).targets)) {
          $linkedTarget = getAnimationDomTarget(linked as JSAnimation);
        } else {
          forEachChildren(linked as Timeline, (child: JSAnimation) => {
            if (child.targets && !$linkedTarget) {
              $linkedTarget = getAnimationDomTarget(child);
            }
          });
        }
        this.target = $linkedTarget || doc!.body;
        this.refresh();
      }
    }
    return this;
  }

  get velocity(): number {
    return this.container.velocity;
  }

  get backward(): boolean {
    return this.horizontal ? this.container.backwardX : this.container.backwardY;
  }

  get scroll(): number {
    return this.horizontal ? this.container.scrollX : this.container.scrollY;
  }

  get progress(): number {
    const p = (this.scroll - this.offsetStart) / this.distance;
    return p === Infinity || isNaN(p) ? 0 : round(clamp(p, 0, 1), 6);
  }

  refresh(): this {
    this.ready = true;
    this.reverted = false;
    const params = this._params;
    this.repeat = setValue(parseScrollObserverFunctionParameter(params.repeat, this), true) as boolean;
    this.horizontal = setValue(parseScrollObserverFunctionParameter(params.axis, this), 'y') === 'x';
    this.enter = setValue(parseScrollObserverFunctionParameter(params.enter, this), 'end start');
    this.leave = setValue(parseScrollObserverFunctionParameter(params.leave, this), 'start end');
    this.updateBounds();
    this.handleScroll();
    return this;
  }

  removeDebug(): this {
    if (this.$debug) {
      this.$debug.parentNode?.removeChild(this.$debug);
      this.$debug = null;
    }
    if (this.debugStyles) {
      (this.debugStyles as unknown as { revert(): void }).revert();
      this.$debug = null;
    }
    return this;
  }

  debug(): void {
    this.removeDebug();
    const container = this.container;
    const isHori = this.horizontal;
    const $existingDebug = container.element.querySelector(':scope > .animejs-onscroll-debug');
    const $debug = doc!.createElement('div');
    const $thresholds = doc!.createElement('div');
    const $triggers = doc!.createElement('div');
    const color = debugColors[this.index % debugColors.length];
    const useWin = container.useWin;
    const containerWidth = useWin ? container.winWidth : container.width;
    const containerHeight = useWin ? container.winHeight : container.height;
    const scrollWidth = container.scrollWidth;
    const scrollHeight = container.scrollHeight;
    const size = this.container.width > 360 ? 320 : 260;
    const offLeft = isHori ? 0 : 10;
    const offTop = isHori ? 10 : 0;
    const half = isHori ? 24 : size / 2;
    const labelHeight = isHori ? half : 15;
    const labelWidth = isHori ? 60 : half;
    const labelSize = isHori ? labelWidth : labelHeight;
    const repeat = isHori ? 'repeat-x' : 'repeat-y';

    const gradientOffset = (v: number) => isHori ? '0px '+(v)+'px' : (v)+'px'+' 2px';
    const lineCSS = (c: string) => `linear-gradient(${isHori ? 90 : 0}deg, ${c} 2px, transparent 1px)`;
    const baseCSS = (p: string, l: number, t: number, w: number, h: number) =>
      `position:${p};left:${l}px;top:${t}px;width:${w}px;height:${h}px;`;

    $debug.style.cssText = `${baseCSS('absolute', offLeft, offTop, isHori ? scrollWidth : size, isHori ? size : scrollHeight)}
      pointer-events: none;
      z-index: ${this.container.zIndex++};
      display: flex;
      flex-direction: ${isHori ? 'column' : 'row'};
      filter: drop-shadow(0px 1px 0px rgba(0,0,0,.75));
    `;
    $thresholds.style.cssText = `${baseCSS('sticky', 0, 0, isHori ? containerWidth : half, isHori ? half : containerHeight)}`;
    if (!$existingDebug) {
      $thresholds.style.cssText += `background:
        ${lineCSS('#FFFF')}${gradientOffset(half-10)} / ${isHori ? '100px 100px' : '100px 100px'} ${repeat},
        ${lineCSS('#FFF8')}${gradientOffset(half-10)} / ${isHori ? '10px 10px' : '10px 10px'} ${repeat};
      `;
    }
    $triggers.style.cssText = `${baseCSS('relative', 0, 0, isHori ? scrollWidth : half, isHori ? half : scrollHeight)}`;
    if (!$existingDebug) {
      $triggers.style.cssText += `background:
        ${lineCSS('#FFFF')}${gradientOffset(0)} / ${isHori ? '100px 10px' : '10px 100px'} ${repeat},
        ${lineCSS('#FFF8')}${gradientOffset(0)} / ${isHori ? '10px 0px' : '0px 10px'} ${repeat};
      `;
    }

    const labels = [' enter: ', ' leave: '];
    this.coords.forEach((v, i) => {
      const isView = i > 1;
      const value = (isView ? 0 : this.offset) + v;
      const isTail = i % 2;
      const isFirst = value < labelSize;
      const isOver = value > (isView ? isHori ? containerWidth : containerHeight : isHori ? scrollWidth : scrollHeight) - labelSize;
      const isFlip = (isView ? isTail && !isFirst : !isTail && !isFirst) || isOver;
      const $label = doc!.createElement('div');
      const $text = doc!.createElement('div');
      const dirProp = isHori ? isFlip ? 'right' : 'left' : isFlip ? 'bottom' : 'top';
      const flipOffset = isFlip ? (isHori ? labelWidth : labelHeight) + (!isView ? isHori ? -1 : -2 : isHori ? -1 : isOver ? 0 : -2) : !isView ? isHori ? 1 : 0 : isHori ? 1 : 0;
      $text.innerHTML = `${this.id}${labels[isTail]}${this.thresholds[i]}`;
      $label.style.cssText = `${baseCSS('absolute', 0, 0, labelWidth, labelHeight)}
        display: flex;
        flex-direction: ${isHori ? 'column' : 'row'};
        justify-content: flex-${isView ? 'start' : 'end'};
        align-items: flex-${isFlip ? 'end' : 'start'};
        border-${dirProp}: 2px ${isTail ? 'solid' : 'solid'} ${color};
      `;
      $text.style.cssText = `
        overflow: hidden;
        max-width: ${(size / 2) - 10}px;
        height: ${labelHeight};
        margin-${isHori ? isFlip ? 'right' : 'left' : isFlip ? 'bottom' : 'top'}: -2px;
        padding: 1px;
        font-family: ui-monospace, monospace;
        font-size: 10px;
        letter-spacing: -.025em;
        line-height: 9px;
        font-weight: 600;
        text-align: ${isHori && isFlip || !isHori && !isView ? 'right' : 'left'};
        white-space: pre;
        text-overflow: ellipsis;
        color: ${isTail ? color : 'rgba(0,0,0,.75)'};
        background-color: ${isTail ? 'rgba(0,0,0,.65)' : color};
        border: 2px solid ${isTail ? color : 'transparent'};
        border-${isHori ? isFlip ? 'top-left' : 'top-right' : isFlip ? 'top-left' : 'bottom-left'}-radius: 5px;
        border-${isHori ? isFlip ? 'bottom-left' : 'bottom-right' : isFlip ? 'top-right' : 'bottom-right'}-radius: 5px;
      `;
      $label.appendChild($text);
      const position = value - flipOffset + (isHori ? 1 : 0);
      $label.style[isHori ? 'left' : 'top'] = `${position}px`;
      (isView ? $thresholds : $triggers).appendChild($label);
    });

    $debug.appendChild($thresholds);
    $debug.appendChild($triggers);
    container.element.appendChild($debug);

    if (!$existingDebug) $debug.classList.add('animejs-onscroll-debug');
    this.$debug = $debug;
    const containerPosition = get(container.element, 'position');
    if (containerPosition === 'static') {
      this.debugStyles = set(container.element, { position: 'relative '}) as unknown as JSAnimation;
    }
  }

  updateBounds(): void {
    if (this._debug) {
      this.removeDebug();
    }
    let stickys: Array<{ revert(): void }> | undefined;
    const $target = this.target!;
    const container = this.container;
    const isHori = this.horizontal;
    const linked = this.linked;
    let linkedTime: number | undefined;
    let $el: HTMLElement | null = $target;

    if (linked) {
      linkedTime = (linked as Tickable).currentTime;
      (linked as JSAnimation).seek(0, true);
    }

    while ($el && $el !== container.element && $el !== doc!.body) {
      const isSticky = get($el, 'position') === 'sticky' ? set($el, { position: 'static' }) : false;
      $el = $el.parentElement;
      if (isSticky) {
        if (!stickys) stickys = [];
        stickys.push(isSticky as { revert(): void });
      }
    }

    const rect = $target.getBoundingClientRect();
    const scale = container.scale;
    const offset = (isHori ? rect.left + container.scrollX - container.left : rect.top + container.scrollY - container.top) * scale;
    const targetSize = (isHori ? rect.width : rect.height) * scale;
    const containerSize = isHori ? container.width : container.height;
    const scrollSize = isHori ? container.scrollWidth : container.scrollHeight;
    const maxScroll = scrollSize - containerSize;
    const enter = this.enter;
    const leave = this.leave;

    let enterTarget: ScrollThresholdValue = 'start';
    let leaveTarget: ScrollThresholdValue = 'end';
    let enterContainer: ScrollThresholdValue = 'end';
    let leaveContainer: ScrollThresholdValue = 'start';

    if (isStr(enter)) {
      const splitted = (enter as string).split(' ');
      enterContainer = splitted[0];
      enterTarget = splitted.length > 1 ? splitted[1] : enterTarget;
    } else if (isObj(enter)) {
      const e = enter as ScrollThresholdParam;
      if (!isUnd(e.container)) enterContainer = e.container!;
      if (!isUnd(e.target)) enterTarget = e.target!;
    } else if (isNum(enter)) {
      enterContainer = enter as number;
    }

    if (isStr(leave)) {
      const splitted = (leave as string).split(' ');
      leaveContainer = splitted[0];
      leaveTarget = splitted.length > 1 ? splitted[1] : leaveTarget;
    } else if (isObj(leave)) {
      const t = leave as ScrollThresholdParam;
      if (!isUnd(t.container)) leaveContainer = t.container!;
      if (!isUnd(t.target)) leaveTarget = t.target!;
    } else if (isNum(leave)) {
      leaveContainer = leave as number;
    }

    const parsedEnterTarget = parseBoundValue($target, enterTarget, targetSize);
    const parsedLeaveTarget = parseBoundValue($target, leaveTarget, targetSize);
    const under = (parsedEnterTarget + offset) - containerSize;
    const over = (parsedLeaveTarget + offset) - maxScroll;
    const parsedEnterContainer = parseBoundValue($target, enterContainer, containerSize, under, over);
    const parsedLeaveContainer = parseBoundValue($target, leaveContainer, containerSize, under, over);
    const offsetStart = parsedEnterTarget + offset - parsedEnterContainer;
    const offsetEnd = parsedLeaveTarget + offset - parsedLeaveContainer;
    const scrollDelta = offsetEnd - offsetStart;

    this.offset = offset;
    this.offsetStart = offsetStart;
    this.offsetEnd = offsetEnd;
    this.distance = scrollDelta <= 0 ? 0 : scrollDelta;
    this.thresholds = [enterTarget as string, leaveTarget as string, enterContainer as string, leaveContainer as string];
    this.coords = [parsedEnterTarget, parsedLeaveTarget, parsedEnterContainer, parsedLeaveContainer];

    if (stickys) {
      stickys.forEach(sticky => sticky.revert());
    }
    if (linked && linkedTime !== undefined) {
      (linked as JSAnimation).seek(linkedTime, true);
    }
    if (this._debug) {
      this.debug();
    }
  }

  handleScroll(): void {
    if (!this.ready) return;
    const linked = this.linked;
    const sync = this.sync;
    const syncEase = this.syncEase;
    const syncSmooth = this.syncSmooth;
    const shouldSeek = linked && (syncEase || syncSmooth);
    const isHori = this.horizontal;
    const container = this.container;
    const scroll = this.scroll;
    const isBefore = scroll <= this.offsetStart;
    const isAfter = scroll >= this.offsetEnd;
    const isInView = !isBefore && !isAfter;
    const isOnTheEdge = scroll === this.offsetStart || scroll === this.offsetEnd;
    const forceEnter = !this.hasEntered && isOnTheEdge;
    const $debug = this._debug && this.$debug;
    let hasUpdated = false;
    let syncCompleted = false;
    let p = this.progress;

    if (isBefore && this.began) {
      this.began = false;
    }

    if (p > 0 && !this.began) {
      this.began = true;
    }

    if (shouldSeek) {
      const lp = (linked as Tickable).progress;
      if (syncSmooth && isNum(syncSmooth)) {
        if (syncSmooth < 1) {
          const step = 0.0001;
          const snap = lp < p && p === 1 ? step : lp > p && !p ? -step : 0;
          p = round(lerp(lp, p, lerp(.01, .2, syncSmooth)) + snap, 6);
        }
      } else if (syncEase) {
        p = syncEase(p);
      }
      hasUpdated = p !== this.prevProgress;
      syncCompleted = lp === 1;
      if (hasUpdated && !syncCompleted && (syncSmooth && lp)) {
        container.wakeTicker.restart();
      }
    }

    if ($debug) {
      const sticky = isHori ? container.scrollY : container.scrollX;
      $debug.style[isHori ? 'top' : 'left'] = sticky + 10 + 'px';
    }

    if ((isInView && !this.isInView) || (forceEnter && !this.forceEnter && !this.hasEntered)) {
      if (isInView) this.isInView = true;
      if (!this.forceEnter || !this.hasEntered) {
        if ($debug && isInView) $debug.style.zIndex = `${this.container.zIndex++}`;
        this.onSyncEnter(this);
        this.onEnter(this);
        if (this.backward) {
          this.onSyncEnterBackward(this);
          this.onEnterBackward(this);
        } else {
          this.onSyncEnterForward(this);
          this.onEnterForward(this);
        }
        this.hasEntered = true;
        if (forceEnter) this.forceEnter = true;
      } else if (isInView) {
        this.forceEnter = false;
      }
    }

    if (isInView || !isInView && this.isInView) {
      hasUpdated = true;
    }

    if (hasUpdated) {
      if (shouldSeek) (linked as JSAnimation).seek((linked as Tickable).duration * p);
      this.onUpdate(this);
    }

    if (!isInView && this.isInView) {
      this.isInView = false;
      this.onSyncLeave(this);
      this.onLeave(this);
      if (this.backward) {
        this.onSyncLeaveBackward(this);
        this.onLeaveBackward(this);
      } else {
        this.onSyncLeaveForward(this);
        this.onLeaveForward(this);
      }
      if (sync && !syncSmooth) {
        syncCompleted = true;
      }
    }

    if (p >= 1 && this.began && !this.completed && (sync && syncCompleted || !sync)) {
      if (sync) {
        this.onSyncComplete(this);
      }
      this.completed = true;
      if ((!this.repeat && !linked) || (!this.repeat && linked && (linked as Tickable).completed)) {
        this.revert();
      }
    }

    if (p < 1 && this.completed) {
      this.completed = false;
    }

    this.prevProgress = p;
  }

  revert(): this | undefined {
    if (this.reverted) return;
    const container = this.container;
    removeChild(container, this);
    if (!container._head) {
      container.revert();
    }
    if (this._debug) {
      this.removeDebug();
    }
    this.reverted = true;
    this.ready = false;
    return this;
  }
}

export function onScroll(parameters: ScrollObserverParams = {}): ScrollObserver {
  return new ScrollObserver(parameters);
}
