// Easings - Irregular

import { clamp } from '../../core/helpers';
import { linear } from '../linear';
import type { EasingFunction } from '../../types';

/**
 * Generate random steps
 * @param length - The number of steps
 * @param randomness - How strong the randomness is
 */
export const irregular = (length = 10, randomness = 1): EasingFunction => {
  const values: number[] = [0];
  const total = length - 1;

  for (let i = 1; i < total; i++) {
    const previousValue = values[i - 1];
    const spacing = i / total;
    const segmentEnd = (i + 1) / total;
    const randomVariation = spacing + (segmentEnd - spacing) * Math.random();
    const randomValue = spacing * (1 - randomness) + randomVariation * randomness;
    values.push(clamp(randomValue, previousValue, 1));
  }

  values.push(1);
  return linear(...values);
};
