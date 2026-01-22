// MMS VM - Sistema de registro de opcodes

import type { OpcodeDefinition } from './types';

/** Registro global de opcodes */
class OpcodeRegistry {
  private opcodes = new Map<string, OpcodeDefinition>();
  private refCount = new Map<string, number>();

  /** Registrar un opcode */
  register(def: OpcodeDefinition): void {
    if (this.opcodes.has(def.name)) {
      // Ya existe, incrementar referencia
      this.refCount.set(def.name, (this.refCount.get(def.name) ?? 0) + 1);
      return;
    }
    this.opcodes.set(def.name, def);
    this.refCount.set(def.name, 1);
  }

  /** Desregistrar un opcode (decrementa ref, elimina si llega a 0) */
  unregister(name: string): boolean {
    const count = this.refCount.get(name) ?? 0;
    if (count <= 1) {
      this.opcodes.delete(name);
      this.refCount.delete(name);
      return true; // eliminado de memoria
    }
    this.refCount.set(name, count - 1);
    return false; // aún en uso
  }

  /** Obtener un opcode */
  get(name: string): OpcodeDefinition | undefined {
    return this.opcodes.get(name);
  }

  /** Verificar si existe */
  has(name: string): boolean {
    return this.opcodes.has(name);
  }

  /** Registrar múltiples opcodes de un módulo */
  registerModule(opcodes: OpcodeDefinition[]): () => void {
    for (const op of opcodes) {
      this.register(op);
    }
    // Retorna función para desregistrar todo el módulo
    return () => {
      for (const op of opcodes) {
        this.unregister(op.name);
      }
    };
  }

  /** Listar opcodes cargados */
  list(): string[] {
    return Array.from(this.opcodes.keys());
  }

  /** Obtener uso de memoria (cantidad de opcodes) */
  size(): number {
    return this.opcodes.size;
  }
}

/** Instancia global del registro */
export const registry = new OpcodeRegistry();

/** Helper para crear definición de opcode */
export function defineOpcode(
  name: string,
  execute: OpcodeDefinition['execute'],
  options?: { pure?: boolean; arity?: number }
): OpcodeDefinition {
  return {
    name,
    execute,
    pure: options?.pure ?? false,
    arity: options?.arity,
  };
}
