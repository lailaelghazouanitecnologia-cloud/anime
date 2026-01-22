// MMS VM - Tipos base

/** Valor numérico de la VM */
export type Value = number;

/** Registro de la VM (almacena valores) */
export interface Register {
  value: Value;
  dirty: boolean; // marcado si cambió
}

/** Contexto de ejecución */
export interface VMContext {
  registers: Map<string, Register>;
  time: number;
  deltaTime: number;
  frame: number;
}

/** Instrucción de la VM */
export interface Instruction {
  opcode: string;
  args: Value[];
  target?: string; // registro destino
  sources?: string[]; // registros fuente
}

/** Definición de un Opcode */
export interface OpcodeDefinition {
  name: string;
  execute: (ctx: VMContext, args: Value[], sources: Value[]) => Value;
  /** Para optimización: si es puro (sin side effects) */
  pure?: boolean;
  /** Número de argumentos esperados */
  arity?: number;
}

/** Programa compilado */
export interface Program {
  instructions: Instruction[];
  /** Registros usados */
  usedRegisters: Set<string>;
  /** Opcodes requeridos */
  requiredOpcodes: Set<string>;
}

/** Resultado de captura para optimización */
export interface CapturedTrace {
  instructions: Instruction[];
  /** Valores constantes detectados */
  constants: Map<string, Value>;
  /** Instrucciones que pueden eliminarse */
  deadCode: number[];
}
