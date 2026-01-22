// MMS VM - Opcodes de animación

import type { OpcodeDefinition } from '../types';
import { defineOpcode } from '../registry';

/** LERP: interpolación lineal (args: [t], sources: [from, to]) */
const LERP = defineOpcode(
  'LERP',
  (_ctx, args, sources) => {
    const t = args[0] ?? 0;
    const from = sources[0] ?? 0;
    const to = sources[1] ?? 1;
    return from + (to - from) * t;
  },
  { pure: true }
);

/** PROGRESS: calcular progreso (args: [duration], usa ctx.time) */
const PROGRESS = defineOpcode(
  'PROGRESS',
  (ctx, args) => {
    const duration = args[0] ?? 1000;
    const delay = args[1] ?? 0;
    const elapsed = ctx.time - delay;
    if (elapsed < 0) return 0;
    return Math.min(elapsed / duration, 1);
  },
  { pure: false } // depende del tiempo
);

/** EASE_LINEAR: sin easing */
const EASE_LINEAR = defineOpcode(
  'EASE_LINEAR',
  (_ctx, _args, sources) => sources[0] ?? 0,
  { pure: true, arity: 1 }
);

/** EASE_IN_QUAD: easing cuadrático in */
const EASE_IN_QUAD = defineOpcode(
  'EASE_IN_QUAD',
  (_ctx, _args, sources) => {
    const t = sources[0] ?? 0;
    return t * t;
  },
  { pure: true, arity: 1 }
);

/** EASE_OUT_QUAD: easing cuadrático out */
const EASE_OUT_QUAD = defineOpcode(
  'EASE_OUT_QUAD',
  (_ctx, _args, sources) => {
    const t = sources[0] ?? 0;
    return t * (2 - t);
  },
  { pure: true, arity: 1 }
);

/** EASE_IN_OUT_QUAD: easing cuadrático in-out */
const EASE_IN_OUT_QUAD = defineOpcode(
  'EASE_IN_OUT_QUAD',
  (_ctx, _args, sources) => {
    const t = sources[0] ?? 0;
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  },
  { pure: true, arity: 1 }
);

/** EASE_IN_CUBIC: easing cúbico in */
const EASE_IN_CUBIC = defineOpcode(
  'EASE_IN_CUBIC',
  (_ctx, _args, sources) => {
    const t = sources[0] ?? 0;
    return t * t * t;
  },
  { pure: true, arity: 1 }
);

/** EASE_OUT_CUBIC: easing cúbico out */
const EASE_OUT_CUBIC = defineOpcode(
  'EASE_OUT_CUBIC',
  (_ctx, _args, sources) => {
    const t = sources[0] ?? 0;
    const t1 = t - 1;
    return t1 * t1 * t1 + 1;
  },
  { pure: true, arity: 1 }
);

/** EASE_IN_OUT_CUBIC: easing cúbico in-out */
const EASE_IN_OUT_CUBIC = defineOpcode(
  'EASE_IN_OUT_CUBIC',
  (_ctx, _args, sources) => {
    const t = sources[0] ?? 0;
    return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
  },
  { pure: true, arity: 1 }
);

/** SPRING: simulación de resorte (args: [stiffness, damping]) */
const SPRING = defineOpcode(
  'SPRING',
  (ctx, args, sources) => {
    const target = sources[0] ?? 0;
    const current = sources[1] ?? 0;
    const velocity = sources[2] ?? 0;
    const stiffness = args[0] ?? 100;
    const damping = args[1] ?? 10;
    const dt = ctx.deltaTime / 1000;

    const force = stiffness * (target - current);
    const dampingForce = -damping * velocity;
    const acceleration = force + dampingForce;
    const newVelocity = velocity + acceleration * dt;
    const newPosition = current + newVelocity * dt;

    return newPosition;
  },
  { pure: false }
);

/** Módulo de opcodes de animación */
export const animOpcodes: OpcodeDefinition[] = [
  LERP,
  PROGRESS,
  EASE_LINEAR,
  EASE_IN_QUAD,
  EASE_OUT_QUAD,
  EASE_IN_OUT_QUAD,
  EASE_IN_CUBIC,
  EASE_OUT_CUBIC,
  EASE_IN_OUT_CUBIC,
  SPRING,
];
