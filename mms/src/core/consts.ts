// Core - Constantes

// Environments
export const isBrowser = typeof window !== 'undefined';

export interface AnimeJSWindow extends Window {
  AnimeJS?: unknown[];
  AnimeJSDevTools?: unknown;
}

export const win: AnimeJSWindow | null = isBrowser ? (window as AnimeJSWindow) : null;
export const doc: Document | null = isBrowser ? document : null;

// Enums
export const enum TweenType {
  OBJECT = 0,
  ATTRIBUTE = 1,
  CSS = 2,
  TRANSFORM = 3,
  CSS_VAR = 4,
}

export const enum ValueType {
  NUMBER = 0,
  UNIT = 1,
  COLOR = 2,
  COMPLEX = 3,
}

export const enum TickMode {
  NONE = 0,
  AUTO = 1,
  FORCE = 2,
}

export const enum CompositionType {
  replace = 0,
  none = 1,
  blend = 2,
}

// Cache symbols
export const isRegisteredTargetSymbol = Symbol('isRegisteredTarget');
export const isDomSymbol = Symbol('isDom');
export const isSvgSymbol = Symbol('isSvg');
export const transformsSymbol = Symbol('transforms');
export const morphPointsSymbol = Symbol('morphPoints');
export const proxyTargetSymbol = Symbol('proxyTarget');

// Numbers
export const minValue = 1e-11;
export const maxValue = 1e12;
export const K = 1e3;
export const maxFps = 240;

// Strings
export const emptyString = '';
export const cssVarPrefix = 'var(';

export const shortTransforms = new Map<string, string>([
  ['x', 'translateX'],
  ['y', 'translateY'],
  ['z', 'translateZ'],
]);

export const validTransforms = [
  'translateX',
  'translateY',
  'translateZ',
  'rotate',
  'rotateX',
  'rotateY',
  'rotateZ',
  'scale',
  'scaleX',
  'scaleY',
  'scaleZ',
  'skew',
  'skewX',
  'skewY',
  'matrix',
  'matrix3d',
  'perspective',
] as const;

export type TransformProperty = (typeof validTransforms)[number];

export const transformsFragmentStrings = validTransforms.reduce(
  (a, v) => ({ ...a, [v]: v + '(' }),
  {} as Record<TransformProperty, string>
);

// Functions
export const noop = (): void => {};

// Regex
export const hexTestRgx = /(^#([\da-f]{3}){1,2}$)|(^#([\da-f]{4}){1,2}$)/i;
export const rgbExecRgx = /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i;
export const rgbaExecRgx = /rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(-?\d+|-?\d*.\d+)\s*\)/i;
export const hslExecRgx = /hsl\(\s*(-?\d+|-?\d*.\d+)\s*,\s*(-?\d+|-?\d*.\d+)%\s*,\s*(-?\d+|-?\d*.\d+)%\s*\)/i;
export const hslaExecRgx = /hsla\(\s*(-?\d+|-?\d*.\d+)\s*,\s*(-?\d+|-?\d*.\d+)%\s*,\s*(-?\d+|-?\d*.\d+)%\s*,\s*(-?\d+|-?\d*.\d+)\s*\)/i;
export const digitWithExponentRgx = /[-+]?\d*\.?\d+(?:e[-+]?\d)?/gi;
export const unitsExecRgx = /^([-+]?\d*\.?\d+(?:e[-+]?\d+)?)([a-z]+|%)$/i;
export const lowerCaseRgx = /([a-z])([A-Z])/g;
export const transformsExecRgx = /(\w+)(\([^)]+\)+)/g;
export const relativeValuesExecRgx = /(\*=|\+=|-=)/;
export const cssVariableMatchRgx = /var\(\s*(--[\w-]+)(?:\s*,\s*([^)]+))?\s*\)/;
