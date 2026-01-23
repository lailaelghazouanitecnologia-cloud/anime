// Layout - Auto Layout Animation

import {
  isStr,
  isArr,
  isUnd,
  isFnc,
  isSvg,
  mergeObjects,
} from '../core/helpers';
import { registerTargets } from '../core/targets';
import { parseEase } from '../easings/parser';
import { getFunctionValue, setValue } from '../core/values';
import { createTimeline } from '../timeline';
import { waapi, WAAPIAnimation } from '../waapi';
import { defaults, scope } from '../core/globals';
import type {
  DOMTarget,
  EasingParam,
  EasingFunction,
  FunctionValue,
  Callback,
} from '../types';

// Forward declare types
interface Timeline {
  add: (targets: any, params: any, position?: number) => Timeline;
  call: (callback: () => void, position: number) => Timeline;
  sync: (animation: any, position: number) => Timeline;
  init: () => Timeline;
  complete: () => Timeline;
  cancel: () => void;
}

interface Spring {
  ease: EasingFunction;
  settlingDuration: number;
}

// Layout-specific types
export type LayoutChildrenParam = string | string[] | DOMTarget | DOMTarget[];

export interface LayoutAnimationTimingsParams {
  delay?: number | FunctionValue;
  duration?: number | FunctionValue;
  ease?: EasingParam | FunctionValue;
}

export type LayoutStateAnimationProperties = Record<string, number | string | FunctionValue>;

export type LayoutStateParams = LayoutStateAnimationProperties & LayoutAnimationTimingsParams;

export interface LayoutSpecificAnimationParams {
  delay?: number | FunctionValue;
  duration?: number | FunctionValue;
  ease?: EasingParam | FunctionValue;
  playbackEase?: EasingParam;
  swapAt?: LayoutStateParams;
  enterFrom?: LayoutStateParams;
  leaveTo?: LayoutStateParams;
}

export interface LayoutAnimationParams extends LayoutSpecificAnimationParams {
  onComplete?: Callback<Timeline>;
  onPause?: Callback<Timeline>;
  [key: string]: any;
}

export interface LayoutOptions {
  children?: LayoutChildrenParam;
  properties?: string[];
}

export type AutoLayoutParams = LayoutAnimationParams & LayoutOptions;

export interface LayoutNodeProperties {
  transform: string;
  x: number;
  y: number;
  left: number;
  top: number;
  clientLeft: number;
  clientTop: number;
  width: number;
  height: number;
  [key: string]: number | string;
}

export interface LayoutNode {
  id: string;
  $el: DOMTarget;
  index: number;
  total: number;
  delay: number;
  duration: number;
  ease: EasingParam | null;
  $measure: DOMTarget;
  state: LayoutSnapshot;
  layout: AutoLayout;
  parentNode: LayoutNode | null;
  isTarget: boolean;
  isEntering: boolean;
  isLeaving: boolean;
  hasTransform: boolean;
  inlineStyles: string[];
  inlineTransforms: string | null;
  inlineTransition: string | null;
  branchAdded: boolean;
  branchRemoved: boolean;
  branchNotRendered: boolean;
  sizeChanged: boolean;
  isInlined: boolean;
  hasVisibilitySwap: boolean;
  hasDisplayNone: boolean;
  hasVisibilityHidden: boolean;
  measuredInlineTransform: string | null;
  measuredInlineTransition: string | null;
  measuredDisplay: string | null;
  measuredVisibility: string | null;
  measuredPosition: string | null;
  measuredHasDisplayNone: boolean;
  measuredHasVisibilityHidden: boolean;
  measuredIsVisible: boolean;
  measuredIsRemoved: boolean;
  measuredIsInsideRoot: boolean;
  properties: LayoutNodeProperties;
  _head: LayoutNode | null;
  _tail: LayoutNode | null;
  _prev: LayoutNode | null;
  _next: LayoutNode | null;
}

type LayoutNodeIterator = (node: LayoutNode, index: number) => void;

let layoutId = 0;
let nodeId = 0;

/**
 * Check if element is inside root
 */
function isElementInRoot(root: DOMTarget | null, $el: DOMTarget | null): boolean {
  if (!root || !$el) return false;
  return root === $el || (root as Element).contains($el as Element);
}

/**
 * Mute element transition
 */
function muteElementTransition($el: DOMTarget | null): string | null {
  if (!$el) return null;
  const style = ($el as HTMLElement).style;
  const transition = style.transition || '';
  style.setProperty('transition', 'none', 'important');
  return transition;
}

/**
 * Restore element transition
 */
function restoreElementTransition($el: DOMTarget | null, transition: string | null): void {
  if (!$el) return;
  const style = ($el as HTMLElement).style;
  if (transition) {
    style.transition = transition;
  } else {
    style.removeProperty('transition');
  }
}

/**
 * Mute node transition
 */
function muteNodeTransition(node: LayoutNode): void {
  const store = node.layout.transitionMuteStore;
  const $el = node.$el;
  const $measure = node.$measure;
  if ($el && !store.has($el)) store.set($el, muteElementTransition($el));
  if ($measure && !store.has($measure)) store.set($measure, muteElementTransition($measure));
}

/**
 * Restore layout transition
 */
function restoreLayoutTransition(store: Map<DOMTarget, string | null>): void {
  store.forEach((value, $el) => restoreElementTransition($el, value));
  store.clear();
}

const hiddenComputedStyle: Partial<CSSStyleDeclaration> = {
  display: 'none',
  visibility: 'hidden',
  opacity: '0',
  transform: 'none',
  position: 'static',
};

/**
 * Detach node from tree
 */
function detachNode(node: LayoutNode | null): void {
  if (!node) return;
  const parent = node.parentNode;
  if (!parent) return;
  if (parent._head === node) parent._head = node._next;
  if (parent._tail === node) parent._tail = node._prev;
  if (node._prev) node._prev._next = node._next;
  if (node._next) node._next._prev = node._prev;
  node._prev = null;
  node._next = null;
  node.parentNode = null;
}

/**
 * Create layout node
 */
function createNode(
  $el: DOMTarget,
  parentNode: LayoutNode | null,
  state: LayoutSnapshot,
  recycledNode: LayoutNode | null
): LayoutNode {
  let dataId = ($el as HTMLElement).dataset.layoutId;
  if (!dataId) dataId = ($el as HTMLElement).dataset.layoutId = `node-${nodeId++}`;

  const node: LayoutNode = recycledNode || {} as LayoutNode;
  node.$el = $el;
  node.$measure = $el;
  node.id = dataId;
  node.index = 0;
  node.total = 1;
  node.delay = 0;
  node.duration = 0;
  node.ease = null;
  node.state = state;
  node.layout = state.layout;
  node.parentNode = parentNode || null;
  node.isTarget = false;
  node.isEntering = false;
  node.isLeaving = false;
  node.isInlined = false;
  node.hasTransform = false;
  node.inlineStyles = [];
  node.inlineTransforms = null;
  node.inlineTransition = null;
  node.branchAdded = false;
  node.branchRemoved = false;
  node.branchNotRendered = false;
  node.sizeChanged = false;
  node.hasVisibilitySwap = false;
  node.hasDisplayNone = false;
  node.hasVisibilityHidden = false;
  node.measuredInlineTransform = null;
  node.measuredInlineTransition = null;
  node.measuredDisplay = null;
  node.measuredVisibility = null;
  node.measuredPosition = null;
  node.measuredHasDisplayNone = false;
  node.measuredHasVisibilityHidden = false;
  node.measuredIsVisible = false;
  node.measuredIsRemoved = false;
  node.measuredIsInsideRoot = false;
  node.properties = {
    transform: 'none',
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    clientLeft: 0,
    clientTop: 0,
    width: 0,
    height: 0,
  };
  node.layout.properties.forEach(prop => node.properties[prop] = 0);
  node._head = null;
  node._tail = null;
  node._prev = null;
  node._next = null;

  return node;
}

/**
 * Record node state
 */
function recordNodeState(
  node: LayoutNode,
  $measure: DOMTarget,
  computedStyle: CSSStyleDeclaration | Partial<CSSStyleDeclaration>,
  skipMeasurements: boolean
): LayoutNode {
  const $el = node.$el;
  const root = node.layout.root;
  const isRoot = root === $el;
  const properties = node.properties;
  const rootNode = node.state.rootNode;
  const parentNode = node.parentNode;
  const computedTransforms = computedStyle.transform;
  const inlineTransforms = ($el as HTMLElement).style.transform;
  const parentNotRendered = parentNode ? parentNode.measuredIsRemoved : false;
  const position = computedStyle.position;

  if (isRoot) node.layout.absoluteCoords = position === 'fixed' || position === 'absolute';

  node.$measure = $measure;
  node.inlineTransforms = inlineTransforms;
  node.hasTransform = !!computedTransforms && computedTransforms !== 'none';
  node.measuredIsInsideRoot = isElementInRoot(root, $measure);
  node.measuredInlineTransform = null;
  node.measuredDisplay = computedStyle.display || null;
  node.measuredVisibility = computedStyle.visibility || null;
  node.measuredPosition = position || null;
  node.measuredHasDisplayNone = computedStyle.display === 'none';
  node.measuredHasVisibilityHidden = computedStyle.visibility === 'hidden';
  node.measuredIsVisible = !(node.measuredHasDisplayNone || node.measuredHasVisibilityHidden);
  node.measuredIsRemoved = node.measuredHasDisplayNone || node.measuredHasVisibilityHidden || parentNotRendered;

  // Check for adjacent text
  let hasAdjacentText = false;
  let s: Node | null = $el.previousSibling;
  while (s && (s.nodeType === Node.COMMENT_NODE || (s.nodeType === Node.TEXT_NODE && !s.textContent?.trim()))) {
    s = s.previousSibling;
  }
  if (s && s.nodeType === Node.TEXT_NODE) {
    hasAdjacentText = true;
  } else {
    s = $el.nextSibling;
    while (s && (s.nodeType === Node.COMMENT_NODE || (s.nodeType === Node.TEXT_NODE && !s.textContent?.trim()))) {
      s = s.nextSibling;
    }
    hasAdjacentText = s !== null && s.nodeType === Node.TEXT_NODE;
  }
  node.isInlined = hasAdjacentText;

  // Mute transforms before position calculation
  if (node.hasTransform && !skipMeasurements) {
    const transitionMuteStore = node.layout.transitionMuteStore;
    if (!transitionMuteStore.get($el)) node.inlineTransition = muteElementTransition($el);
    if ($measure === $el) {
      ($el as HTMLElement).style.transform = 'none';
    } else {
      if (!transitionMuteStore.get($measure)) node.measuredInlineTransition = muteElementTransition($measure);
      node.measuredInlineTransform = ($measure as HTMLElement).style.transform;
      ($measure as HTMLElement).style.transform = 'none';
    }
  }

  let left = 0, top = 0, width = 0, height = 0;

  if (!skipMeasurements) {
    const rect = ($measure as Element).getBoundingClientRect();
    left = rect.left;
    top = rect.top;
    width = rect.width;
    height = rect.height;
  }

  for (let name in properties) {
    const computedProp = name === 'transform'
      ? computedTransforms
      : (computedStyle as any)[name] || ((computedStyle as any).getPropertyValue?.((computedStyle as any).getPropertyValue(name)));
    if (!isUnd(computedProp)) properties[name] = computedProp;
  }

  properties.left = left;
  properties.top = top;
  properties.clientLeft = skipMeasurements ? 0 : ($measure as HTMLElement).clientLeft;
  properties.clientTop = skipMeasurements ? 0 : ($measure as HTMLElement).clientTop;

  // Compute local x/y relative to parent
  let absoluteLeft: number, absoluteTop: number;

  if (isRoot) {
    if (!node.layout.absoluteCoords) {
      absoluteLeft = 0;
      absoluteTop = 0;
    } else {
      absoluteLeft = left;
      absoluteTop = top;
    }
  } else {
    const p = parentNode || rootNode!;
    const parentLeft = p.properties.left;
    const parentTop = p.properties.top;
    const borderLeft = p.properties.clientLeft;
    const borderTop = p.properties.clientTop;

    if (!node.layout.absoluteCoords) {
      if (p === rootNode) {
        const rootLeft = rootNode!.properties.left;
        const rootTop = rootNode!.properties.top;
        const rootBorderLeft = rootNode!.properties.clientLeft;
        const rootBorderTop = rootNode!.properties.clientTop;
        absoluteLeft = left - rootLeft - rootBorderLeft;
        absoluteTop = top - rootTop - rootBorderTop;
      } else {
        absoluteLeft = left - parentLeft - borderLeft;
        absoluteTop = top - parentTop - borderTop;
      }
    } else {
      absoluteLeft = left - parentLeft - borderLeft;
      absoluteTop = top - parentTop - borderTop;
    }
  }

  properties.x = absoluteLeft;
  properties.y = absoluteTop;
  properties.width = width;
  properties.height = height;

  return node;
}

/**
 * Update node properties
 */
function updateNodeProperties(node: LayoutNode, props?: LayoutStateAnimationProperties): void {
  if (!props) return;
  for (let name in props) {
    node.properties[name] = props[name] as any;
  }
}

/**
 * Update node timing params
 */
function updateNodeTimingParams(node: LayoutNode, params: LayoutAnimationTimingsParams): void {
  const easeFunctionResult = getFunctionValue(params.ease, node.$el, node.index, node.total);
  const keyEasing = isFnc(easeFunctionResult) ? easeFunctionResult : params.ease;
  const hasSpring = !isUnd(keyEasing) && !isUnd((keyEasing as Spring).ease);
  node.ease = hasSpring ? (keyEasing as Spring).ease : keyEasing as EasingParam;
  node.duration = hasSpring
    ? (keyEasing as Spring).settlingDuration
    : getFunctionValue(params.duration, node.$el, node.index, node.total);
  node.delay = getFunctionValue(params.delay, node.$el, node.index, node.total);
}

/**
 * Record node inline styles
 */
function recordNodeInlineStyles(node: LayoutNode): void {
  const style = (node.$el as HTMLElement).style;
  const stylesStore = node.inlineStyles;
  stylesStore.length = 0;
  node.layout.recordedProperties.forEach(prop => {
    stylesStore.push(prop, (style as any)[prop] || '');
  });
}

/**
 * Restore node inline styles
 */
function restoreNodeInlineStyles(node: LayoutNode): void {
  const style = (node.$el as HTMLElement).style;
  const stylesStore = node.inlineStyles;
  for (let i = 0, l = stylesStore.length; i < l; i += 2) {
    const property = stylesStore[i];
    const styleValue = stylesStore[i + 1];
    if (styleValue && styleValue !== '') {
      (style as any)[property] = styleValue;
    } else {
      (style as any)[property] = '';
      style.removeProperty(property);
    }
  }
}

/**
 * Restore node transform
 */
function restoreNodeTransform(node: LayoutNode): void {
  const inlineTransforms = node.inlineTransforms;
  const nodeStyle = (node.$el as HTMLElement).style;

  if (!node.hasTransform || !inlineTransforms ||
      (node.hasTransform && nodeStyle.transform === 'none') ||
      (inlineTransforms && inlineTransforms === 'none')) {
    nodeStyle.removeProperty('transform');
  } else if (inlineTransforms) {
    nodeStyle.transform = inlineTransforms;
  }

  const $measure = node.$measure;
  if (node.hasTransform && $measure !== node.$el) {
    const measuredStyle = ($measure as HTMLElement).style;
    const measuredInline = node.measuredInlineTransform;
    if (measuredInline && measuredInline !== '') {
      measuredStyle.transform = measuredInline;
    } else {
      measuredStyle.removeProperty('transform');
    }
  }

  node.measuredInlineTransform = null;
  if (node.inlineTransition !== null) {
    restoreElementTransition(node.$el, node.inlineTransition);
    node.inlineTransition = null;
  }
  if ($measure !== node.$el && node.measuredInlineTransition !== null) {
    restoreElementTransition($measure, node.measuredInlineTransition);
    node.measuredInlineTransition = null;
  }
}

/**
 * Restore node visual state
 */
function restoreNodeVisualState(node: LayoutNode): void {
  if (node.measuredIsRemoved || node.hasVisibilitySwap) {
    (node.$el as HTMLElement).style.removeProperty('display');
    (node.$el as HTMLElement).style.removeProperty('visibility');
    if (node.hasVisibilitySwap) {
      (node.$measure as HTMLElement).style.removeProperty('display');
      (node.$measure as HTMLElement).style.removeProperty('visibility');
    }
  }
  node.layout.pendingRemoval.delete(node.$el);
}

/**
 * Clone node properties
 */
function cloneNodeProperties(node: LayoutNode, targetNode: LayoutNode, newState: LayoutSnapshot): LayoutNode {
  targetNode.properties = { ...node.properties } as LayoutNodeProperties;
  targetNode.state = newState;
  targetNode.isTarget = node.isTarget;
  targetNode.hasTransform = node.hasTransform;
  targetNode.inlineTransforms = node.inlineTransforms;
  targetNode.measuredIsVisible = node.measuredIsVisible;
  targetNode.measuredDisplay = node.measuredDisplay;
  targetNode.measuredIsRemoved = node.measuredIsRemoved;
  targetNode.measuredHasDisplayNone = node.measuredHasDisplayNone;
  targetNode.measuredHasVisibilityHidden = node.measuredHasVisibilityHidden;
  targetNode.hasDisplayNone = node.hasDisplayNone;
  targetNode.isInlined = node.isInlined;
  targetNode.hasVisibilityHidden = node.hasVisibilityHidden;
  return targetNode;
}

/**
 * Layout Snapshot class
 */
class LayoutSnapshot {
  layout: AutoLayout;
  rootNode: LayoutNode | null;
  rootNodes: Set<LayoutNode>;
  nodes: Map<string, LayoutNode>;
  scrollX: number;
  scrollY: number;

  constructor(layout: AutoLayout) {
    this.layout = layout;
    this.rootNode = null;
    this.rootNodes = new Set();
    this.nodes = new Map();
    this.scrollX = 0;
    this.scrollY = 0;
  }

  revert(): this {
    this.forEachNode(node => {
      this.layout.pendingRemoval.delete(node.$el);
      (node.$el as HTMLElement).removeAttribute('data-layout-id');
      (node.$measure as HTMLElement).removeAttribute('data-layout-id');
    });
    this.rootNode = null;
    this.rootNodes.clear();
    this.nodes.clear();
    return this;
  }

  getNode($el: DOMTarget): LayoutNode | undefined {
    if (!$el || !($el as HTMLElement).dataset) return;
    return this.nodes.get(($el as HTMLElement).dataset.layoutId!);
  }

  getComputedValue($el: DOMTarget, prop: string): number | string | undefined {
    const node = this.getNode($el);
    if (!node) return;
    return node.properties[prop];
  }

  forEach(rootNode: LayoutNode | null, cb: LayoutNodeIterator): void {
    let node = rootNode;
    let i = 0;
    while (node) {
      cb(node, i++);
      if (node._head) {
        node = node._head;
      } else if (node._next) {
        node = node._next;
      } else {
        while (node && !node._next) {
          node = node.parentNode;
        }
        if (node) node = node._next;
      }
    }
  }

  forEachRootNode(cb: LayoutNodeIterator): void {
    this.forEach(this.rootNode, cb);
  }

  forEachNode(cb: LayoutNodeIterator): void {
    for (const rootNode of this.rootNodes) {
      this.forEach(rootNode, cb);
    }
  }

  registerElement($el: DOMTarget, parentNode: LayoutNode | null): LayoutNode | null {
    if (!$el || ($el as Element).nodeType !== 1) return null;

    if (!this.layout.transitionMuteStore.has($el)) {
      this.layout.transitionMuteStore.set($el, muteElementTransition($el));
    }

    const stack: Array<DOMTarget | LayoutNode | null> = [$el, parentNode];
    const root = this.layout.root;
    let firstNode: LayoutNode | null = null;

    while (stack.length) {
      const $parent = stack.pop() as LayoutNode | null;
      const $current = stack.pop() as DOMTarget | null;

      if (!$current || ($current as Element).nodeType !== 1 || isSvg($current)) continue;

      const skipMeasurements = $parent ? $parent.measuredIsRemoved : false;
      const computedStyle = skipMeasurements ? hiddenComputedStyle as CSSStyleDeclaration : getComputedStyle($current as Element);
      const hasDisplayNone = skipMeasurements ? true : computedStyle.display === 'none';
      const hasVisibilityHidden = skipMeasurements ? true : computedStyle.visibility === 'hidden';
      const isVisible = !hasDisplayNone && !hasVisibilityHidden;
      const existingId = ($current as HTMLElement).dataset.layoutId;
      const isInsideRoot = isElementInRoot(root, $current);

      let node = existingId ? this.nodes.get(existingId) : null;

      if (node && node.$el !== $current) {
        const nodeInsideRoot = isElementInRoot(root, node.$el);
        const measuredVisible = node.measuredIsVisible;
        const shouldReassignNode = !nodeInsideRoot && (isInsideRoot || (!isInsideRoot && !measuredVisible && isVisible));
        const shouldReuseMeasurements = nodeInsideRoot && !measuredVisible && isVisible;

        if (shouldReassignNode) {
          detachNode(node);
          node = createNode($current, $parent, this, node);
        } else if (shouldReuseMeasurements) {
          recordNodeState(node, $current, computedStyle, skipMeasurements);
          let $child = ($current as Element).lastElementChild;
          while ($child) {
            stack.push($child as DOMTarget, node);
            $child = $child.previousElementSibling;
          }
          if (!firstNode) firstNode = node;
          continue;
        } else {
          let $child = ($current as Element).lastElementChild;
          while ($child) {
            stack.push($child as DOMTarget, $parent);
            $child = $child.previousElementSibling;
          }
          if (!firstNode) firstNode = node;
          continue;
        }
      } else {
        node = createNode($current, $parent, this, node);
      }

      node.branchAdded = false;
      node.branchRemoved = false;
      node.branchNotRendered = false;
      node.isTarget = false;
      node.sizeChanged = false;
      node.hasVisibilityHidden = hasVisibilityHidden;
      node.hasDisplayNone = hasDisplayNone;
      node.hasVisibilitySwap = (hasVisibilityHidden && !node.measuredHasVisibilityHidden) ||
                                (hasDisplayNone && !node.measuredHasDisplayNone);

      this.nodes.set(node.id, node);

      node.parentNode = $parent || null;
      node._prev = null;
      node._next = null;

      if ($parent) {
        this.rootNodes.delete(node);
        if (!$parent._head) {
          $parent._head = node;
          $parent._tail = node;
        } else {
          $parent._tail!._next = node;
          node._prev = $parent._tail;
          $parent._tail = node;
        }
      } else {
        this.rootNodes.add(node);
      }

      recordNodeState(node, node.$el, computedStyle, skipMeasurements);

      let $child = ($current as Element).lastElementChild;
      while ($child) {
        stack.push($child as DOMTarget, node);
        $child = $child.previousElementSibling;
      }

      if (!firstNode) firstNode = node;
    }

    return firstNode;
  }

  ensureDetachedNode($el: DOMTarget, candidates: Set<DOMTarget>): LayoutNode | null {
    if (!$el || $el === this.layout.root) return null;
    const existingId = ($el as HTMLElement).dataset.layoutId;
    const existingNode = existingId ? this.nodes.get(existingId) : null;
    if (existingNode && existingNode.$el === $el) return existingNode;

    let parentNode: LayoutNode | null = null;
    let $ancestor = ($el as Element).parentElement;

    while ($ancestor && $ancestor !== this.layout.root) {
      if (candidates.has($ancestor as DOMTarget)) {
        parentNode = this.ensureDetachedNode($ancestor as DOMTarget, candidates);
        break;
      }
      $ancestor = $ancestor.parentElement;
    }

    return this.registerElement($el, parentNode);
  }

  record(): this {
    const layout = this.layout;
    const children = layout.children;
    const root = layout.root;
    const toParse = isArr(children) ? children as string[] : [children];
    const scoped: (NodeListOf<Element> | string)[] = [];
    const scopeRoot = children === '*' ? root : scope.root;

    // Mute transitions and transforms of root ancestors
    const rootAncestorTransformStore: Array<DOMTarget | string | null> = [];
    let $ancestor = (root as Element).parentElement;

    while ($ancestor && $ancestor.nodeType === 1) {
      const computedStyle = getComputedStyle($ancestor);
      if (computedStyle.transform && computedStyle.transform !== 'none') {
        const inlineTransform = ($ancestor as HTMLElement).style.transform || '';
        const inlineTransition = muteElementTransition($ancestor as DOMTarget);
        rootAncestorTransformStore.push($ancestor as DOMTarget, inlineTransform, inlineTransition);
        ($ancestor as HTMLElement).style.transform = 'none';
      }
      $ancestor = $ancestor.parentElement;
    }

    for (let i = 0, l = toParse.length; i < l; i++) {
      const child = toParse[i];
      scoped[i] = isStr(child) ? scopeRoot.querySelectorAll(child as string) : child as any;
    }

    const parsedChildren = registerTargets(scoped as any) as DOMTarget[];

    this.nodes.clear();
    this.rootNodes.clear();

    const rootNode = this.registerElement(root, null)!;
    rootNode.isTarget = true;
    this.rootNode = rootNode;

    const inRootNodeIds = new Set<string>();
    let index = 0;
    const total = this.nodes.size;

    this.nodes.forEach((node, id) => {
      node.index = index++;
      node.total = total;
      if (node && node.measuredIsInsideRoot) {
        inRootNodeIds.add(id);
      }
    });

    const detachedElementsLookup = new Set<DOMTarget>();
    const orderedDetachedElements: DOMTarget[] = [];

    for (let i = 0, l = parsedChildren.length; i < l; i++) {
      const $el = parsedChildren[i];
      if (!$el || ($el as Element).nodeType !== 1 || $el === root) continue;
      const insideRoot = isElementInRoot(root, $el);
      if (!insideRoot) {
        const layoutNodeId = ($el as HTMLElement).dataset.layoutId;
        if (!layoutNodeId || !inRootNodeIds.has(layoutNodeId)) continue;
      }
      if (!detachedElementsLookup.has($el)) {
        detachedElementsLookup.add($el);
        orderedDetachedElements.push($el);
      }
    }

    for (let i = 0, l = orderedDetachedElements.length; i < l; i++) {
      this.ensureDetachedNode(orderedDetachedElements[i], detachedElementsLookup);
    }

    for (let i = 0, l = parsedChildren.length; i < l; i++) {
      const $el = parsedChildren[i];
      const node = this.getNode($el);
      if (node) {
        let cur: LayoutNode | null = node;
        while (cur) {
          if (cur.isTarget) break;
          cur.isTarget = true;
          cur = cur.parentNode;
        }
      }
    }

    this.scrollX = window.scrollX;
    this.scrollY = window.scrollY;

    this.forEachNode(restoreNodeTransform);

    // Restore root ancestor transforms
    for (let i = 0, l = rootAncestorTransformStore.length; i < l; i += 3) {
      const $el = rootAncestorTransformStore[i] as DOMTarget;
      const inlineTransform = rootAncestorTransformStore[i + 1] as string;
      const inlineTransition = rootAncestorTransformStore[i + 2] as string | null;
      if (inlineTransform && inlineTransform !== '') {
        ($el as HTMLElement).style.transform = inlineTransform;
      } else {
        ($el as HTMLElement).style.removeProperty('transform');
      }
      restoreElementTransition($el, inlineTransition);
    }

    return this;
  }
}

/**
 * Split properties from params
 */
function splitPropertiesFromParams(params?: LayoutStateParams): [LayoutStateAnimationProperties, LayoutAnimationTimingsParams] {
  const properties: LayoutStateAnimationProperties = {};
  const parameters: LayoutAnimationTimingsParams = {};

  if (!params) return [properties, parameters];

  for (let name in params) {
    const value = params[name];
    const isEase = name === 'ease';
    const isTiming = name === 'duration' || name === 'delay';
    if (isTiming || isEase) {
      if (isEase) {
        parameters[name] = value as EasingParam;
      } else {
        parameters[name as 'duration' | 'delay'] = value as number | FunctionValue;
      }
    } else {
      properties[name] = value;
    }
  }
  return [properties, parameters];
}

/**
 * AutoLayout class for FLIP-style animations
 */
export class AutoLayout {
  params: AutoLayoutParams;
  root: DOMTarget;
  id: number;
  children: LayoutChildrenParam;
  absoluteCoords: boolean;
  swapAtParams: LayoutStateParams;
  enterFromParams: LayoutStateParams;
  leaveToParams: LayoutStateParams;
  properties: Set<string>;
  recordedProperties: Set<string>;
  pendingRemoval: WeakSet<DOMTarget>;
  transitionMuteStore: Map<DOMTarget, string | null>;
  oldState: LayoutSnapshot;
  newState: LayoutSnapshot;
  timeline: Timeline | null;
  transformAnimation: WAAPIAnimation | null;
  animating: DOMTarget[];
  swapping: DOMTarget[];
  leaving: DOMTarget[];
  entering: DOMTarget[];

  constructor(root: string | DOMTarget, params: AutoLayoutParams = {}) {
    if (scope.current) scope.current.register(this);

    const swapAtSplitParams = splitPropertiesFromParams(params.swapAt);
    const enterFromSplitParams = splitPropertiesFromParams(params.enterFrom);
    const leaveToSplitParams = splitPropertiesFromParams(params.leaveTo);
    const transitionProperties = params.properties;

    params.duration = setValue(params.duration, 350) as number | FunctionValue;
    params.delay = setValue(params.delay, 0) as number | FunctionValue;
    params.ease = setValue(params.ease, 'inOut(3.5)') as EasingParam | FunctionValue;

    this.params = params;
    this.root = registerTargets(root)[0] as DOMTarget;
    this.id = layoutId++;
    this.children = params.children || '*';
    this.absoluteCoords = false;
    this.swapAtParams = mergeObjects(params.swapAt || { opacity: 0 }, { ease: 'inOut(1.75)' });
    this.enterFromParams = params.enterFrom || { opacity: 0 };
    this.leaveToParams = params.leaveTo || { opacity: 0 };

    this.properties = new Set([
      'opacity',
      'fontSize',
      'color',
      'backgroundColor',
      'borderRadius',
      'border',
      'filter',
      'clipPath',
    ]);

    if (swapAtSplitParams[0]) {
      for (let name in swapAtSplitParams[0]) this.properties.add(name);
    }
    if (enterFromSplitParams[0]) {
      for (let name in enterFromSplitParams[0]) this.properties.add(name);
    }
    if (leaveToSplitParams[0]) {
      for (let name in leaveToSplitParams[0]) this.properties.add(name);
    }
    if (transitionProperties) {
      for (let i = 0, l = transitionProperties.length; i < l; i++) {
        this.properties.add(transitionProperties[i]);
      }
    }

    this.recordedProperties = new Set([
      'display',
      'visibility',
      'translate',
      'position',
      'left',
      'top',
      'marginLeft',
      'marginTop',
      'width',
      'height',
      'maxWidth',
      'maxHeight',
      'minWidth',
      'minHeight',
    ]);

    this.properties.forEach(prop => this.recordedProperties.add(prop));

    this.pendingRemoval = new WeakSet();
    this.transitionMuteStore = new Map();
    this.oldState = new LayoutSnapshot(this);
    this.newState = new LayoutSnapshot(this);
    this.timeline = null;
    this.transformAnimation = null;
    this.animating = [];
    this.swapping = [];
    this.leaving = [];
    this.entering = [];

    // Record initial state
    this.oldState.record();
    restoreLayoutTransition(this.transitionMuteStore);
  }

  revert(): this {
    (this.root as HTMLElement).classList.remove('is-animated');
    if (this.timeline) {
      this.timeline.complete();
      this.timeline = null;
    }
    if (this.transformAnimation) {
      this.transformAnimation.complete();
      this.transformAnimation = null;
    }
    this.animating.length = this.swapping.length = this.leaving.length = this.entering.length = 0;
    this.oldState.revert();
    this.newState.revert();
    requestAnimationFrame(() => restoreLayoutTransition(this.transitionMuteStore));
    return this;
  }

  record(): this {
    if (this.transformAnimation) {
      this.transformAnimation.cancel();
      this.transformAnimation = null;
    }
    this.oldState.record();
    if (this.timeline) {
      this.timeline.cancel();
      this.timeline = null;
    }
    this.newState.forEachRootNode(restoreNodeInlineStyles);
    return this;
  }

  animate(params: LayoutAnimationParams = {}): Timeline {
    const animationTimings: LayoutAnimationTimingsParams = {
      ease: setValue(params.ease, this.params.ease),
      delay: setValue(params.delay, this.params.delay),
      duration: setValue(params.duration, this.params.duration),
    };

    const tlParams: Record<string, any> = {};
    const onComplete = setValue(params.onComplete, this.params.onComplete);
    const onPause = setValue(params.onPause, this.params.onPause);

    for (let name in defaults) {
      if (name !== 'ease' && name !== 'duration' && name !== 'delay') {
        if (!isUnd(params[name])) {
          tlParams[name] = params[name];
        } else if (!isUnd(this.params[name])) {
          tlParams[name] = this.params[name];
        }
      }
    }

    const oldState = this.oldState;
    const newState = this.newState;
    const transformed: DOMTarget[] = [];

    tlParams.onComplete = () => {
      if (this.transformAnimation) this.transformAnimation.cancel();
      newState.forEachRootNode(node => {
        restoreNodeVisualState(node);
        restoreNodeInlineStyles(node);
      });
      for (let i = 0, l = transformed.length; i < l; i++) {
        const $el = transformed[i];
        ($el as HTMLElement).style.transform = newState.getComputedValue($el, 'transform') as string;
      }
      if ((this.root as HTMLElement).classList.contains('is-animated')) {
        (this.root as HTMLElement).classList.remove('is-animated');
        if (onComplete) onComplete(this.timeline!);
      }
      requestAnimationFrame(() => {
        if ((this.root as HTMLElement).classList.contains('is-animated')) return;
        restoreLayoutTransition(this.transitionMuteStore);
      });
    };

    tlParams.onPause = () => {
      if (!(this.root as HTMLElement).classList.contains('is-animated')) return;
      if (this.transformAnimation) this.transformAnimation.cancel();
      newState.forEachRootNode(restoreNodeVisualState);
      (this.root as HTMLElement).classList.remove('is-animated');
      if (onComplete) onComplete(this.timeline!);
      if (onPause) onPause(this.timeline!);
    };

    tlParams.composition = false;

    const swapAtParams = mergeObjects(mergeObjects(params.swapAt || {}, this.swapAtParams), animationTimings);
    const enterFromParams = mergeObjects(mergeObjects(params.enterFrom || {}, this.enterFromParams), animationTimings);
    const leaveToParams = mergeObjects(mergeObjects(params.leaveTo || {}, this.leaveToParams), animationTimings);
    const [swapAtProps, swapAtTimings] = splitPropertiesFromParams(swapAtParams);
    const [enterFromProps, enterFromTimings] = splitPropertiesFromParams(enterFromParams);
    const [leaveToProps, leaveToTimings] = splitPropertiesFromParams(leaveToParams);

    const animating = this.animating;
    const swapping = this.swapping;
    const entering = this.entering;
    const leaving = this.leaving;
    const pendingRemoval = this.pendingRemoval;

    animating.length = swapping.length = entering.length = leaving.length = 0;

    oldState.forEachRootNode(muteNodeTransition);
    newState.record();
    newState.forEachRootNode(recordNodeInlineStyles);

    const targets: DOMTarget[] = [];
    const animated: DOMTarget[] = [];
    const animatedSwap: DOMTarget[] = [];
    const rootNode = newState.rootNode!;
    const $root = rootNode.$el;

    // Main node processing loop
    newState.forEachRootNode(node => {
      const $el = node.$el;
      const id = node.id;
      const parent = node.parentNode;
      const parentAdded = parent ? parent.branchAdded : false;
      const parentRemoved = parent ? parent.branchRemoved : false;
      const parentNotRendered = parent ? parent.branchNotRendered : false;

      let oldStateNode = oldState.nodes.get(id);
      const hasNoOldState = !oldStateNode;

      if (hasNoOldState) {
        oldStateNode = cloneNodeProperties(node, {} as LayoutNode, oldState);
        oldState.nodes.set(id, oldStateNode);
        oldStateNode.measuredIsRemoved = true;
      } else if (oldStateNode.measuredIsRemoved && !node.measuredIsRemoved) {
        cloneNodeProperties(node, oldStateNode, oldState);
        oldStateNode.measuredIsRemoved = true;
      }

      const oldParentNode = oldStateNode.parentNode;
      const oldParentId = oldParentNode ? oldParentNode.id : null;
      const newParentId = parent ? parent.id : null;
      const parentChanged = oldParentId !== newParentId;
      const elementChanged = oldStateNode.$el !== node.$el;
      const wasRemovedBefore = oldStateNode.measuredIsRemoved;
      const isRemovedNow = node.measuredIsRemoved;

      if (!oldStateNode.measuredIsRemoved && !isRemovedNow && !hasNoOldState && (parentChanged || elementChanged)) {
        const oldAbsoluteLeft = oldStateNode.properties.left;
        const oldAbsoluteTop = oldStateNode.properties.top;
        const newParent = parent || newState.rootNode!;
        const oldParent = newParent.id ? oldState.nodes.get(newParent.id) : null;
        const parentLeft = oldParent ? oldParent.properties.left : newParent.properties.left;
        const parentTop = oldParent ? oldParent.properties.top : newParent.properties.top;
        const borderLeft = oldParent ? oldParent.properties.clientLeft : newParent.properties.clientLeft;
        const borderTop = oldParent ? oldParent.properties.clientTop : newParent.properties.clientTop;
        oldStateNode.properties.x = oldAbsoluteLeft - parentLeft - borderLeft;
        oldStateNode.properties.y = oldAbsoluteTop - parentTop - borderTop;
      }

      if (node.hasVisibilitySwap) {
        if (node.hasVisibilityHidden) {
          (node.$el as HTMLElement).style.visibility = 'visible';
          (node.$measure as HTMLElement).style.visibility = 'hidden';
        }
        if (node.hasDisplayNone) {
          (node.$el as HTMLElement).style.display = oldStateNode.measuredDisplay || node.measuredDisplay || '';
          (node.$measure as HTMLElement).style.visibility = 'hidden';
        }
      }

      const wasPendingRemoval = pendingRemoval.has($el);
      const wasVisibleBefore = oldStateNode.measuredIsVisible;
      const isVisibleNow = node.measuredIsVisible;
      const becomeVisible = !wasVisibleBefore && isVisibleNow && !parentNotRendered;
      const topLevelAdded = !isRemovedNow && (wasRemovedBefore || wasPendingRemoval) && !parentAdded;
      const newlyRemoved = isRemovedNow && !wasRemovedBefore && !parentRemoved;
      const topLevelRemoved = newlyRemoved || isRemovedNow && wasPendingRemoval && !parentRemoved;

      node.branchAdded = parentAdded || topLevelAdded;
      node.branchRemoved = parentRemoved || topLevelRemoved;
      node.branchNotRendered = parentNotRendered || isRemovedNow;

      if (isRemovedNow && wasVisibleBefore) {
        (node.$el as HTMLElement).style.display = oldStateNode.measuredDisplay || '';
        (node.$el as HTMLElement).style.visibility = 'visible';
        cloneNodeProperties(oldStateNode, node, newState);
      }

      if (newlyRemoved) {
        if (node.isTarget) {
          leaving.push($el);
          node.isLeaving = true;
        }
        pendingRemoval.add($el);
      } else if (!isRemovedNow && wasPendingRemoval) {
        pendingRemoval.delete($el);
      }

      if ((topLevelAdded && !parentNotRendered) || becomeVisible) {
        updateNodeProperties(oldStateNode, enterFromProps);
        if (node.isTarget) {
          entering.push($el);
          node.isEntering = true;
        }
      } else if (topLevelRemoved && !parentNotRendered) {
        updateNodeProperties(node, leaveToProps);
      }

      if (node !== rootNode && node.isTarget && !node.isEntering && !node.isLeaving) {
        animating.push($el);
      }

      targets.push($el);
    });

    let enteringIndex = 0;
    let leavingIndex = 0;
    let animatingIndex = 0;

    newState.forEachRootNode(node => {
      const $el = node.$el;
      const parent = node.parentNode;
      const oldStateNode = oldState.nodes.get(node.id)!;
      const nodeProperties = node.properties;
      const oldStateNodeProperties = oldStateNode.properties;

      let animatedParent = parent !== rootNode && parent;
      while (animatedParent && !animatedParent.isTarget && animatedParent !== rootNode) {
        animatedParent = animatedParent.parentNode;
      }

      const animatingTotal = animating.length;

      if (node === rootNode) {
        node.index = 0;
        node.total = animatingTotal;
        updateNodeTimingParams(node, animationTimings);
      } else if (node.isEntering) {
        node.index = animatedParent ? animatedParent.index : enteringIndex;
        node.total = animatedParent ? animatingTotal : entering.length;
        updateNodeTimingParams(node, enterFromTimings);
        enteringIndex++;
      } else if (node.isLeaving) {
        node.index = animatedParent ? animatedParent.index : leavingIndex;
        node.total = animatedParent ? animatingTotal : leaving.length;
        leavingIndex++;
        updateNodeTimingParams(node, leaveToTimings);
      } else if (node.isTarget) {
        node.index = animatingIndex++;
        node.total = animatingTotal;
        updateNodeTimingParams(node, animationTimings);
      } else {
        node.index = animatedParent ? animatedParent.index : 0;
        node.total = animatingTotal;
        updateNodeTimingParams(node, swapAtTimings);
      }

      oldStateNode.index = node.index;
      oldStateNode.total = node.total;

      for (let prop in nodeProperties) {
        nodeProperties[prop] = getFunctionValue(nodeProperties[prop], $el, node.index, node.total);
        oldStateNodeProperties[prop] = getFunctionValue(oldStateNodeProperties[prop], $el, oldStateNode.index, oldStateNode.total);
      }

      const sizeTolerance = 1;
      const widthChanged = Math.abs((nodeProperties.width as number) - (oldStateNodeProperties.width as number)) > sizeTolerance;
      const heightChanged = Math.abs((nodeProperties.height as number) - (oldStateNodeProperties.height as number)) > sizeTolerance;
      node.sizeChanged = widthChanged || heightChanged;

      if (node.isTarget && (!node.measuredIsRemoved && oldStateNode.measuredIsVisible || node.measuredIsRemoved && node.measuredIsVisible)) {
        if (!node.isInlined && (nodeProperties.transform !== 'none' || oldStateNodeProperties.transform !== 'none')) {
          node.hasTransform = true;
          transformed.push($el);
        }
        for (let prop in nodeProperties) {
          if (prop !== 'transform' && nodeProperties[prop] !== oldStateNodeProperties[prop]) {
            animated.push($el);
            break;
          }
        }
      }

      if (!node.isTarget) {
        swapping.push($el);
        if (node.sizeChanged && parent && parent.isTarget && parent.sizeChanged) {
          if (!node.isInlined && swapAtProps.transform) {
            node.hasTransform = true;
            transformed.push($el);
          }
          animatedSwap.push($el);
        }
      }
    });

    const timingParams = {
      delay: ($el: HTMLElement) => newState.getNode($el)!.delay,
      duration: ($el: HTMLElement) => newState.getNode($el)!.duration,
      ease: ($el: HTMLElement) => newState.getNode($el)!.ease,
    };

    tlParams.defaults = timingParams;
    this.timeline = createTimeline(tlParams) as unknown as Timeline;

    if (!animated.length && !transformed.length && !swapping.length) {
      restoreLayoutTransition(this.transitionMuteStore);
      return this.timeline.complete();
    }

    if (targets.length) {
      (this.root as HTMLElement).classList.add('is-animated');

      for (let i = 0, l = targets.length; i < l; i++) {
        const $el = targets[i];
        const id = ($el as HTMLElement).dataset.layoutId!;
        const oldNode = oldState.nodes.get(id)!;
        const newNode = newState.nodes.get(id)!;
        const oldNodeState = oldNode.properties;

        if (!newNode.isInlined) {
          if (oldNode.measuredDisplay === 'grid' || newNode.measuredDisplay === 'grid') {
            ($el as HTMLElement).style.setProperty('display', 'block', 'important');
          }
          if ($el !== $root || this.absoluteCoords) {
            ($el as HTMLElement).style.position = this.absoluteCoords ? 'fixed' : 'absolute';
            ($el as HTMLElement).style.left = '0px';
            ($el as HTMLElement).style.top = '0px';
            ($el as HTMLElement).style.marginLeft = '0px';
            ($el as HTMLElement).style.marginTop = '0px';
            ($el as HTMLElement).style.translate = `${oldNodeState.x}px ${oldNodeState.y}px`;
          }
          if ($el === $root && newNode.measuredPosition === 'static') {
            ($el as HTMLElement).style.position = 'relative';
            ($el as HTMLElement).style.left = '0px';
            ($el as HTMLElement).style.top = '0px';
          }
          ($el as HTMLElement).style.width = `${oldNodeState.width}px`;
          ($el as HTMLElement).style.height = `${oldNodeState.height}px`;
          ($el as HTMLElement).style.minWidth = 'auto';
          ($el as HTMLElement).style.minHeight = 'auto';
          ($el as HTMLElement).style.maxWidth = 'none';
          ($el as HTMLElement).style.maxHeight = 'none';
        }
      }

      if (oldState.scrollX !== window.scrollX || oldState.scrollY !== window.scrollY) {
        requestAnimationFrame(() => window.scrollTo(oldState.scrollX, oldState.scrollY));
      }

      for (let i = 0, l = animated.length; i < l; i++) {
        const $el = animated[i];
        const id = ($el as HTMLElement).dataset.layoutId!;
        const oldNode = oldState.nodes.get(id)!;
        const newNode = newState.nodes.get(id)!;
        const oldNodeState = oldNode.properties;
        const newNodeState = newNode.properties;
        let nodeHasChanged = false;
        const animatedProps: Record<string, any> = { composition: 'none' };

        if (!newNode.isInlined) {
          if (oldNodeState.width !== newNodeState.width) {
            animatedProps.width = [oldNodeState.width, newNodeState.width];
            nodeHasChanged = true;
          }
          if (oldNodeState.height !== newNodeState.height) {
            animatedProps.height = [oldNodeState.height, newNodeState.height];
            nodeHasChanged = true;
          }
          if (!newNode.hasTransform) {
            animatedProps.translate = [`${oldNodeState.x}px ${oldNodeState.y}px`, `${newNodeState.x}px ${newNodeState.y}px`];
            nodeHasChanged = true;
          }
        }

        this.properties.forEach(prop => {
          const oldVal = oldNodeState[prop];
          const newVal = newNodeState[prop];
          if (prop !== 'transform' && oldVal !== newVal) {
            animatedProps[prop] = [oldVal, newVal];
            nodeHasChanged = true;
          }
        });

        if (nodeHasChanged) {
          this.timeline!.add($el, animatedProps, 0);
        }
      }
    }

    if (swapping.length) {
      for (let i = 0, l = swapping.length; i < l; i++) {
        const $el = swapping[i];
        const oldNode = oldState.getNode($el)!;
        if (!oldNode.isInlined) {
          const oldNodeProps = oldNode.properties;
          ($el as HTMLElement).style.width = `${oldNodeProps.width}px`;
          ($el as HTMLElement).style.height = `${oldNodeProps.height}px`;
          ($el as HTMLElement).style.minWidth = 'auto';
          ($el as HTMLElement).style.minHeight = 'auto';
          ($el as HTMLElement).style.maxWidth = 'none';
          ($el as HTMLElement).style.maxHeight = 'none';
          ($el as HTMLElement).style.translate = `${oldNodeProps.x}px ${oldNodeProps.y}px`;
        }
        this.properties.forEach(prop => {
          if (prop !== 'transform') {
            ($el as HTMLElement).style[prop as any] = `${oldState.getComputedValue($el, prop)}`;
          }
        });
      }

      for (let i = 0, l = swapping.length; i < l; i++) {
        const $el = swapping[i];
        const newNode = newState.getNode($el)!;
        const newNodeProps = newNode.properties;
        this.timeline!.call(() => {
          if (!newNode.isInlined) {
            ($el as HTMLElement).style.width = `${newNodeProps.width}px`;
            ($el as HTMLElement).style.height = `${newNodeProps.height}px`;
            ($el as HTMLElement).style.minWidth = 'auto';
            ($el as HTMLElement).style.minHeight = 'auto';
            ($el as HTMLElement).style.maxWidth = 'none';
            ($el as HTMLElement).style.maxHeight = 'none';
            ($el as HTMLElement).style.translate = `${newNodeProps.x}px ${newNodeProps.y}px`;
          }
          this.properties.forEach(prop => {
            if (prop !== 'transform') {
              ($el as HTMLElement).style[prop as any] = `${newState.getComputedValue($el, prop)}`;
            }
          });
        }, newNode.delay + newNode.duration / 2);
      }

      if (animatedSwap.length) {
        const ease = parseEase(newState.nodes.get((animatedSwap[0] as HTMLElement).dataset.layoutId!)!.ease!);
        const inverseEased = (t: number) => 1 - (ease as EasingFunction)(1 - t);
        const animatedSwapParams: Record<string, any> = {};
        if (swapAtProps) {
          for (let prop in swapAtProps) {
            if (prop !== 'transform') {
              animatedSwapParams[prop] = [
                { from: ($el: HTMLElement) => oldState.getComputedValue($el, prop), to: swapAtProps[prop] },
                { from: swapAtProps[prop], to: ($el: HTMLElement) => newState.getComputedValue($el, prop), ease: inverseEased }
              ];
            }
          }
        }
        this.timeline!.add(animatedSwap, animatedSwapParams, 0);
      }
    }

    const transformedLength = transformed.length;

    if (transformedLength) {
      for (let i = 0; i < transformedLength; i++) {
        const $el = transformed[i];
        ($el as HTMLElement).style.translate = `${oldState.getComputedValue($el, 'x')}px ${oldState.getComputedValue($el, 'y')}px`;
        ($el as HTMLElement).style.transform = oldState.getComputedValue($el, 'transform') as string;
        if (animatedSwap.includes($el)) {
          const node = newState.getNode($el)!;
          node.ease = getFunctionValue(swapAtParams.ease, $el, node.index, node.total);
          node.duration = getFunctionValue(swapAtParams.duration, $el, node.index, node.total);
        }
      }
      this.transformAnimation = waapi.animate(transformed, {
        translate: ($el: DOMTarget) => `${newState.getComputedValue($el, 'x')}px ${newState.getComputedValue($el, 'y')}px`,
        transform: ($el: DOMTarget) => {
          const newValue = newState.getComputedValue($el, 'transform');
          if (!animatedSwap.includes($el)) return newValue;
          const oldValue = oldState.getComputedValue($el, 'transform');
          const node = newState.getNode($el)!;
          return [oldValue, getFunctionValue(swapAtProps.transform, $el, node.index, node.total), newValue];
        },
        autoplay: false,
        persist: true,
        ...timingParams,
      }) as WAAPIAnimation;
      this.timeline!.sync(this.transformAnimation, 0);
    }

    return this.timeline!.init();
  }

  update(callback: (layout: AutoLayout) => void, params: LayoutAnimationParams = {}): Timeline {
    this.record();
    callback(this);
    return this.animate(params);
  }
}

/**
 * Create a new AutoLayout instance
 */
export function createLayout(root: string | DOMTarget, params?: AutoLayoutParams): AutoLayout {
  return new AutoLayout(root, params);
}
