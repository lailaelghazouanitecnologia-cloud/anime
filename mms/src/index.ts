// MMS - Motor de Animación Minimalista
// Clon ligero de anime.js

// Función principal
export { animate } from './animate';

// Easings
export { easings, getEasing } from './easings';
export * from './easings';

// Utilidades
export { stagger, random, mapRange, clamp, lerp } from './utils';

// Tipos
export type {
  Animation,
  AnimationOptions,
  Target,
  Targets,
  Tween,
  EasingFunction,
  PropertyValue,
  FunctionValue,
} from './types';

// Engine (para uso avanzado)
export { engine } from './engine';
