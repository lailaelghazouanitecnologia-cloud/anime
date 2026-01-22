// Core - Globales

import { K, noop, maxFps, CompositionType, win, doc, isBrowser } from './consts';
import type { DefaultsParams, DOMTarget } from '../types';
import type { Scope } from '../scope';

export const defaults: DefaultsParams = {
  id: null,
  keyframes: null,
  playbackEase: null,
  playbackRate: 1,
  frameRate: maxFps,
  loop: 0,
  reversed: false,
  alternate: false,
  autoplay: true,
  persist: false,
  duration: K,
  delay: 0,
  loopDelay: 0,
  ease: 'out(2)',
  composition: CompositionType.replace,
  modifier: (v) => v,
  onBegin: noop,
  onBeforeUpdate: noop,
  onUpdate: noop,
  onLoop: noop,
  onPause: noop,
  onComplete: noop,
  onRender: noop,
};

export const scope: {
  current: Scope | null;
  root: Document | DOMTarget | null;
} = {
  current: null,
  root: doc,
};

export const globals = {
  defaults,
  precision: 4,
  /** equals 1 in ms mode, 0.001 in s mode */
  timeScale: 1,
  tickThreshold: 200,
};

export const devTools = isBrowser && win?.AnimeJSDevTools;

export const globalVersions = { version: '5.0.0', engine: null as unknown };

if (isBrowser && win) {
  if (!win.AnimeJS) win.AnimeJS = [];
  win.AnimeJS.push(globalVersions);
}
