// MMS - Función principal animate()

import type { AnimationOptions, Animation, Tween, Target, Targets, EasingFunction } from './types';
import { getEasing } from './easings';
import { engine } from './engine';

// Propiedades reservadas (no son propiedades a animar)
const RESERVED = new Set([
  'targets',
  'duration',
  'delay',
  'easing',
  'loop',
  'direction',
  'autoplay',
  'onBegin',
  'onUpdate',
  'onComplete',
  'onLoop',
]);

// Propiedades de transform CSS
const TRANSFORMS = new Set([
  'translateX',
  'translateY',
  'translateZ',
  'rotate',
  'rotateX',
  'rotateY',
  'rotateZ',
  'scale',
  'scaleX',
  'scaleY',
  'scaleZ',
  'skew',
  'skewX',
  'skewY',
]);

/** Parsear targets a array */
function parseTargets(targets: Targets): Target[] {
  if (typeof targets === 'string') {
    return Array.from(document.querySelectorAll(targets));
  }
  if (targets instanceof NodeList) {
    return Array.from(targets) as Target[];
  }
  if (Array.isArray(targets)) {
    return targets;
  }
  return [targets];
}

/** Parsear valor numérico con unidad */
function parseValue(value: string | number): { value: number; unit: string } {
  if (typeof value === 'number') {
    return { value, unit: '' };
  }
  const match = value.match(/^(-?\d*\.?\d+)(.*)$/);
  if (match) {
    return { value: parseFloat(match[1]), unit: match[2] || '' };
  }
  return { value: 0, unit: '' };
}

/** Obtener valor actual de una propiedad */
function getCurrentValue(target: Target, property: string): { value: number; unit: string } {
  if (target instanceof HTMLElement || target instanceof SVGElement) {
    // Transform properties
    if (TRANSFORMS.has(property)) {
      // Obtener del transform actual (simplificado)
      const computed = getComputedStyle(target);
      const transform = computed.transform;
      if (transform === 'none') {
        if (property.startsWith('scale')) return { value: 1, unit: '' };
        if (property.startsWith('translate')) return { value: 0, unit: 'px' };
        return { value: 0, unit: 'deg' };
      }
      // Por simplicidad, retornar defaults
      if (property.startsWith('scale')) return { value: 1, unit: '' };
      if (property.startsWith('translate')) return { value: 0, unit: 'px' };
      return { value: 0, unit: 'deg' };
    }

    // CSS properties
    const computed = getComputedStyle(target);
    const value = computed.getPropertyValue(property) || (target as HTMLElement).style.getPropertyValue(property);
    return parseValue(value);
  }

  // Object properties
  const obj = target as Record<string, unknown>;
  const value = obj[property];
  if (typeof value === 'number') {
    return { value, unit: '' };
  }
  if (typeof value === 'string') {
    return parseValue(value);
  }
  return { value: 0, unit: '' };
}

/** Aplicar valor a una propiedad */
function applyValue(target: Target, property: string, value: number, unit: string): void {
  if (target instanceof HTMLElement || target instanceof SVGElement) {
    if (TRANSFORMS.has(property)) {
      // Aplicar transform
      const current = target.style.transform || '';
      const regex = new RegExp(`${property}\\([^)]+\\)`, 'g');
      const newTransform = `${property}(${value}${unit})`;

      if (regex.test(current)) {
        target.style.transform = current.replace(regex, newTransform);
      } else {
        target.style.transform = current ? `${current} ${newTransform}` : newTransform;
      }
    } else {
      // CSS property
      (target as HTMLElement).style.setProperty(property, `${value}${unit}`);
    }
  } else {
    // Object property
    const obj = target as Record<string, unknown>;
    obj[property] = unit ? `${value}${unit}` : value;
  }
}

/** Crear animación */
export function animate(options: AnimationOptions): Animation {
  const targets = parseTargets(options.targets);
  const duration = typeof options.duration === 'number' ? options.duration : 1000;
  const baseDelay = typeof options.delay === 'number' ? options.delay : 0;
  const easing = getEasing(options.easing ?? 'easeOutQuad');
  const loop = options.loop ?? false;
  const direction = options.direction ?? 'normal';
  const autoplay = options.autoplay ?? true;

  // Crear tweens
  const tweens: Tween[] = [];

  for (const [key, targetValue] of Object.entries(options)) {
    if (RESERVED.has(key)) continue;

    targets.forEach((target, index) => {
      const current = getCurrentValue(target, key);
      const parsed = parseValue(targetValue as string | number);

      // Soporte para [from, to]
      let from = current.value;
      let to = parsed.value;
      let unit = parsed.unit || current.unit;

      if (Array.isArray(targetValue)) {
        const fromParsed = parseValue(targetValue[0]);
        const toParsed = parseValue(targetValue[1]);
        from = fromParsed.value;
        to = toParsed.value;
        unit = toParsed.unit || fromParsed.unit || current.unit;
      }

      // Calcular delay por target
      let targetDelay = baseDelay;
      if (typeof options.delay === 'function') {
        const result = options.delay(target, index, targets.length);
        targetDelay = typeof result === 'number' ? result : parseFloat(result as string) || 0;
      }

      // Calcular duration por target
      let targetDuration = duration;
      if (typeof options.duration === 'function') {
        const result = options.duration(target, index, targets.length);
        targetDuration = typeof result === 'number' ? result : parseFloat(result as string) || 1000;
      }

      tweens.push({
        target,
        property: key,
        from,
        to,
        unit,
        duration: targetDuration,
        delay: targetDelay,
        easing,
      });
    });
  }

  // Calcular duración total
  const totalDuration = Math.max(...tweens.map((t) => t.delay + t.duration));

  // Estado de la animación
  let paused = !autoplay;
  let startTime: number | null = null;
  let currentTime = 0;
  let completed = false;
  let reversed = direction === 'reverse';
  let loopCount = 0;
  let began = false;

  // Función de tick
  const tick = (time: number): void => {
    if (paused) return;

    if (startTime === null) {
      startTime = time;
      if (!began && options.onBegin) {
        options.onBegin(anim);
        began = true;
      }
    }

    currentTime = time - startTime;
    let progress = Math.min(currentTime / totalDuration, 1);

    if (reversed) {
      progress = 1 - progress;
    }

    // Actualizar tweens
    for (const tween of tweens) {
      const tweenProgress = Math.max(0, Math.min(1, (currentTime - tween.delay) / tween.duration));
      if (tweenProgress <= 0 || (tweenProgress >= 1 && !reversed)) continue;

      const easedProgress = reversed
        ? tween.easing(1 - tweenProgress)
        : tween.easing(tweenProgress);
      const value = tween.from + (tween.to - tween.from) * easedProgress;

      applyValue(tween.target, tween.property, value, tween.unit);
    }

    // Callback onUpdate
    if (options.onUpdate) {
      options.onUpdate(anim);
    }

    // Verificar si terminó
    if (currentTime >= totalDuration) {
      // Aplicar valores finales
      for (const tween of tweens) {
        const finalValue = reversed ? tween.from : tween.to;
        applyValue(tween.target, tween.property, finalValue, tween.unit);
      }

      if (loop === true || (typeof loop === 'number' && loopCount < loop - 1)) {
        // Loop
        loopCount++;
        startTime = null;
        if (direction === 'alternate') {
          reversed = !reversed;
        }
        if (options.onLoop) {
          options.onLoop(anim);
        }
      } else {
        // Completado
        completed = true;
        paused = true;
        engine.remove(tick);
        if (options.onComplete) {
          options.onComplete(anim);
        }
      }
    }
  };

  // Objeto Animation
  const anim: Animation = {
    get paused() {
      return paused;
    },
    get progress() {
      return Math.min(currentTime / totalDuration, 1);
    },
    get currentTime() {
      return currentTime;
    },
    get duration() {
      return totalDuration;
    },
    get completed() {
      return completed;
    },

    play() {
      if (completed) {
        this.restart();
        return this;
      }
      if (paused) {
        paused = false;
        startTime = null; // Recalcular startTime
        engine.add(tick);
      }
      return this;
    },

    pause() {
      paused = true;
      return this;
    },

    restart() {
      paused = false;
      completed = false;
      startTime = null;
      currentTime = 0;
      loopCount = 0;
      reversed = direction === 'reverse';
      began = false;
      engine.add(tick);
      return this;
    },

    reverse() {
      reversed = !reversed;
      return this;
    },

    seek(time: number) {
      currentTime = Math.max(0, Math.min(time, totalDuration));
      startTime = performance.now() - currentTime;

      // Actualizar valores
      for (const tween of tweens) {
        const tweenProgress = Math.max(0, Math.min(1, (currentTime - tween.delay) / tween.duration));
        const easedProgress = tween.easing(tweenProgress);
        const value = tween.from + (tween.to - tween.from) * easedProgress;
        applyValue(tween.target, tween.property, value, tween.unit);
      }

      return this;
    },
  };

  // Autoplay
  if (autoplay) {
    engine.add(tick);
  }

  return anim;
}
