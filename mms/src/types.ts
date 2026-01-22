// MMS - Tipos

export type EasingFunction = (t: number) => number;

export type Target = HTMLElement | SVGElement | object;
export type Targets = Target | Target[] | NodeList | string;

export type PropertyValue = number | string | [number | string, number | string];
export type FunctionValue = (target: Target, index: number, total: number) => PropertyValue;

export interface AnimationOptions {
  targets: Targets;
  duration?: number | FunctionValue;
  delay?: number | FunctionValue;
  easing?: string | EasingFunction;
  loop?: number | boolean;
  direction?: 'normal' | 'reverse' | 'alternate';
  autoplay?: boolean;

  // Callbacks
  onBegin?: (anim: Animation) => void;
  onUpdate?: (anim: Animation) => void;
  onComplete?: (anim: Animation) => void;
  onLoop?: (anim: Animation) => void;

  // Propiedades a animar (dinámicas)
  [property: string]: unknown;
}

export interface Tween {
  target: Target;
  property: string;
  from: number;
  to: number;
  unit: string;
  duration: number;
  delay: number;
  easing: EasingFunction;
}

export interface Animation {
  // Estado
  paused: boolean;
  progress: number;
  currentTime: number;
  duration: number;

  // Controles
  play(): Animation;
  pause(): Animation;
  restart(): Animation;
  reverse(): Animation;
  seek(time: number): Animation;

  // Info
  completed: boolean;
}
