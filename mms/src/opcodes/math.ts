// MMS VM - Opcodes matemáticos

import type { OpcodeDefinition } from '../types';
import { defineOpcode } from '../registry';

/** SET: establecer valor constante */
const SET = defineOpcode(
  'SET',
  (_ctx, args) => args[0] ?? 0,
  { pure: true, arity: 1 }
);

/** ADD: sumar valores */
const ADD = defineOpcode(
  'ADD',
  (_ctx, _args, sources) => sources.reduce((a, b) => a + b, 0),
  { pure: true }
);

/** SUB: restar (a - b) */
const SUB = defineOpcode(
  'SUB',
  (_ctx, _args, sources) => (sources[0] ?? 0) - (sources[1] ?? 0),
  { pure: true, arity: 2 }
);

/** MUL: multiplicar valores */
const MUL = defineOpcode(
  'MUL',
  (_ctx, _args, sources) => sources.reduce((a, b) => a * b, 1),
  { pure: true }
);

/** DIV: dividir (a / b) */
const DIV = defineOpcode(
  'DIV',
  (_ctx, _args, sources) => {
    const b = sources[1] ?? 1;
    return b !== 0 ? (sources[0] ?? 0) / b : 0;
  },
  { pure: true, arity: 2 }
);

/** MOD: módulo (a % b) */
const MOD = defineOpcode(
  'MOD',
  (_ctx, _args, sources) => {
    const b = sources[1] ?? 1;
    return b !== 0 ? (sources[0] ?? 0) % b : 0;
  },
  { pure: true, arity: 2 }
);

/** ABS: valor absoluto */
const ABS = defineOpcode(
  'ABS',
  (_ctx, _args, sources) => Math.abs(sources[0] ?? 0),
  { pure: true, arity: 1 }
);

/** MIN: mínimo */
const MIN = defineOpcode(
  'MIN',
  (_ctx, _args, sources) => Math.min(...sources),
  { pure: true }
);

/** MAX: máximo */
const MAX = defineOpcode(
  'MAX',
  (_ctx, _args, sources) => Math.max(...sources),
  { pure: true }
);

/** CLAMP: limitar entre min y max (args: [min, max]) */
const CLAMP = defineOpcode(
  'CLAMP',
  (_ctx, args, sources) => {
    const value = sources[0] ?? 0;
    const min = args[0] ?? 0;
    const max = args[1] ?? 1;
    return Math.min(Math.max(value, min), max);
  },
  { pure: true, arity: 1 }
);

/** Módulo de opcodes matemáticos */
export const mathOpcodes: OpcodeDefinition[] = [
  SET, ADD, SUB, MUL, DIV, MOD, ABS, MIN, MAX, CLAMP,
];
