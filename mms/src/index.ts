// MMS - Motor de Animación Minimalista
// VM-based animation engine

// Tipos
export type {
  Value,
  Register,
  VMContext,
  Instruction,
  OpcodeDefinition,
  Program,
  CapturedTrace,
} from './types';

// VM
export { VM, createVM } from './vm';

// Registry
export { registry, defineOpcode } from './registry';

// Optimizer
export { analyzeTrace, compileTrace, foldConstants, eliminateDeadCode } from './optimizer';

// Opcodes (cargar bajo demanda)
export { mathOpcodes, animOpcodes } from './opcodes';
