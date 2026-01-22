// MMS - Engine de animación

type TickCallback = (time: number) => void;

class Engine {
  private running = false;
  private callbacks = new Set<TickCallback>();
  private lastTime = 0;
  private rafId: number | null = null;

  /** Agregar callback al loop */
  add(callback: TickCallback): void {
    this.callbacks.add(callback);
    if (!this.running && this.callbacks.size > 0) {
      this.start();
    }
  }

  /** Quitar callback del loop */
  remove(callback: TickCallback): void {
    this.callbacks.delete(callback);
    if (this.running && this.callbacks.size === 0) {
      this.stop();
    }
  }

  /** Iniciar loop */
  private start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.tick(this.lastTime);
  }

  /** Detener loop */
  private stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /** Tick del loop */
  private tick = (time: number): void => {
    if (!this.running) return;

    for (const callback of this.callbacks) {
      callback(time);
    }

    this.lastTime = time;
    this.rafId = requestAnimationFrame(this.tick);
  };
}

/** Instancia global del engine */
export const engine = new Engine();
