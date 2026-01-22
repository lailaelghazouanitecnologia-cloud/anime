// Easings - Steps

import { ceil, clamp, floor } from '../../core/helpers';
import type { EasingFunction } from '../../types';

/**
 * Steps ease implementation
 * https://developer.mozilla.org/fr/docs/Web/CSS/transition-timing-function
 * Only covers 'end' and 'start' jumpterms
 */
export const steps = (numSteps = 10, fromStart?: boolean): EasingFunction => {
  const roundMethod = fromStart ? ceil : floor;
  return (t) => roundMethod(clamp(t, 0, 1) * numSteps) * (1 / numSteps);
};
