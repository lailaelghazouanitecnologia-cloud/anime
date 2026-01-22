// MMS VM - Sistema de optimización

import type { Instruction, Program, CapturedTrace, Value } from './types';
import { registry } from './registry';

/** Analizar trace capturado */
export function analyzeTrace(trace: Instruction[]): CapturedTrace {
  const constants = new Map<string, Value>();
  const deadCode: number[] = [];
  const lastWrite = new Map<string, number>(); // registro -> último índice que escribió

  // Primera pasada: detectar último write a cada registro
  for (let i = 0; i < trace.length; i++) {
    const instr = trace[i];
    if (instr.target) {
      lastWrite.set(instr.target, i);
    }
  }

  // Segunda pasada: detectar código muerto y constantes
  const usedRegisters = new Set<string>();

  // Marcar registros usados (hacia atrás)
  for (let i = trace.length - 1; i >= 0; i--) {
    const instr = trace[i];

    // Si este registro no se usa después, es código muerto
    if (instr.target && !usedRegisters.has(instr.target)) {
      // Verificar si es el último write
      if (lastWrite.get(instr.target) !== i) {
        deadCode.push(i);
        continue;
      }
    }

    // Marcar registros fuente como usados
    for (const src of instr.sources ?? []) {
      usedRegisters.add(src);
    }
  }

  return {
    instructions: trace,
    constants,
    deadCode,
  };
}

/** Optimizar programa eliminando código muerto */
export function eliminateDeadCode(program: Program, analysis: CapturedTrace): Program {
  const deadSet = new Set(analysis.deadCode);
  const optimized: Instruction[] = [];

  for (let i = 0; i < program.instructions.length; i++) {
    if (!deadSet.has(i)) {
      optimized.push(program.instructions[i]);
    }
  }

  return {
    ...program,
    instructions: optimized,
  };
}

/** Constant folding: evaluar operaciones puras con constantes */
export function foldConstants(program: Program): Program {
  const knownValues = new Map<string, Value>();
  const optimized: Instruction[] = [];

  for (const instr of program.instructions) {
    const opcode = registry.get(instr.opcode);

    // Si el opcode es puro y todos los inputs son conocidos
    if (opcode?.pure && instr.sources) {
      const allKnown = instr.sources.every((s) => knownValues.has(s));

      if (allKnown && instr.args.every((a) => typeof a === 'number')) {
        // Podemos evaluar en tiempo de compilación
        const sourceValues = instr.sources.map((s) => knownValues.get(s)!);
        const ctx = {
          registers: new Map(),
          time: 0,
          deltaTime: 0,
          frame: 0,
        };
        const result = opcode.execute(ctx, instr.args, sourceValues);

        if (instr.target) {
          knownValues.set(instr.target, result);
          // Reemplazar con SET constante
          optimized.push({
            opcode: 'SET',
            args: [result],
            target: instr.target,
          });
          continue;
        }
      }
    }

    // No se puede optimizar, mantener instrucción
    optimized.push(instr);

    // Si escribe a un registro, ya no es conocido (puede variar)
    if (instr.target && !opcode?.pure) {
      knownValues.delete(instr.target);
    }
  }

  return {
    ...program,
    instructions: optimized,
  };
}

/** Compilar trace a programa optimizado */
export function compileTrace(trace: Instruction[]): Program {
  const usedRegisters = new Set<string>();
  const requiredOpcodes = new Set<string>();

  for (const instr of trace) {
    requiredOpcodes.add(instr.opcode);
    if (instr.target) usedRegisters.add(instr.target);
    for (const src of instr.sources ?? []) {
      usedRegisters.add(src);
    }
  }

  let program: Program = {
    instructions: [...trace],
    usedRegisters,
    requiredOpcodes,
  };

  // Aplicar optimizaciones
  program = foldConstants(program);

  const analysis = analyzeTrace(program.instructions);
  program = eliminateDeadCode(program, analysis);

  return program;
}
