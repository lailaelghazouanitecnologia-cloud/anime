// MMS VM - Máquina Virtual

import type { VMContext, Instruction, Program, Register, Value } from './types';
import { registry } from './registry';

/** Máquina Virtual de Animación */
export class VM {
  private ctx: VMContext;
  private program: Program | null = null;
  private recording = false;
  private trace: Instruction[] = [];

  constructor() {
    this.ctx = {
      registers: new Map(),
      time: 0,
      deltaTime: 0,
      frame: 0,
    };
  }

  /** Obtener/crear registro */
  private getRegister(name: string): Register {
    let reg = this.ctx.registers.get(name);
    if (!reg) {
      reg = { value: 0, dirty: false };
      this.ctx.registers.set(name, reg);
    }
    return reg;
  }

  /** Leer valor de registro */
  read(name: string): Value {
    return this.getRegister(name).value;
  }

  /** Escribir valor en registro */
  write(name: string, value: Value): void {
    const reg = this.getRegister(name);
    reg.value = value;
    reg.dirty = true;
  }

  /** Cargar programa */
  load(program: Program): void {
    this.program = program;
    // Verificar que todos los opcodes requeridos estén cargados
    for (const opName of program.requiredOpcodes) {
      if (!registry.has(opName)) {
        throw new Error(`Opcode no registrado: ${opName}`);
      }
    }
  }

  /** Ejecutar una instrucción */
  private executeInstruction(instr: Instruction): Value {
    const opcode = registry.get(instr.opcode);
    if (!opcode) {
      throw new Error(`Opcode no encontrado: ${instr.opcode}`);
    }

    // Obtener valores de registros fuente
    const sourceValues = (instr.sources ?? []).map((s) => this.read(s));

    // Ejecutar
    const result = opcode.execute(this.ctx, instr.args, sourceValues);

    // Guardar en registro destino si existe
    if (instr.target) {
      this.write(instr.target, result);
    }

    // Grabar si estamos en modo recording
    if (this.recording) {
      this.trace.push({ ...instr });
    }

    return result;
  }

  /** Ejecutar programa completo */
  run(deltaTime: number): void {
    if (!this.program) return;

    // Actualizar contexto
    this.ctx.deltaTime = deltaTime;
    this.ctx.time += deltaTime;
    this.ctx.frame++;

    // Limpiar flags dirty
    for (const reg of this.ctx.registers.values()) {
      reg.dirty = false;
    }

    // Ejecutar instrucciones
    for (const instr of this.program.instructions) {
      this.executeInstruction(instr);
    }
  }

  /** Ejecutar una sola instrucción (para uso interactivo) */
  exec(instr: Instruction): Value {
    return this.executeInstruction(instr);
  }

  /** Iniciar grabación de trace */
  startRecording(): void {
    this.recording = true;
    this.trace = [];
  }

  /** Detener grabación y retornar trace */
  stopRecording(): Instruction[] {
    this.recording = false;
    const captured = this.trace;
    this.trace = [];
    return captured;
  }

  /** Obtener contexto actual */
  getContext(): Readonly<VMContext> {
    return this.ctx;
  }

  /** Reset de la VM */
  reset(): void {
    this.ctx.registers.clear();
    this.ctx.time = 0;
    this.ctx.deltaTime = 0;
    this.ctx.frame = 0;
    this.program = null;
  }

  /** Obtener registros que cambiaron */
  getDirtyRegisters(): Map<string, Value> {
    const dirty = new Map<string, Value>();
    for (const [name, reg] of this.ctx.registers) {
      if (reg.dirty) {
        dirty.set(name, reg.value);
      }
    }
    return dirty;
  }
}

/** Crear instancia de VM */
export function createVM(): VM {
  return new VM();
}
