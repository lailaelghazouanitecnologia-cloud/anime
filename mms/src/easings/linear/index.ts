// Easings - Linear

import { isStr, isUnd, parseNumber } from '../../core/helpers';
import { none } from '../none';
import type { EasingFunction } from '../../types';

/**
 * Without parameters, the linear function creates a non-eased transition.
 * Parameters, if used, creates a piecewise linear easing by interpolating linearly between the specified points.
 */
export const linear = (...args: (string | number)[]): EasingFunction => {
  const argsLength = args.length;
  if (!argsLength) return none;

  const totalPoints = argsLength - 1;
  const firstArg = args[0];
  const lastArg = args[totalPoints];
  const xPoints: number[] = [0];
  const yPoints: number[] = [parseNumber(firstArg)];

  for (let i = 1; i < totalPoints; i++) {
    const arg = args[i];
    const splitValue = isStr(arg) ? arg.trim().split(' ') : [arg];
    const value = splitValue[0];
    const percent = splitValue[1];
    xPoints.push(!isUnd(percent) ? parseNumber(percent) / 100 : i / totalPoints);
    yPoints.push(parseNumber(value));
  }

  yPoints.push(parseNumber(lastArg));
  xPoints.push(1);

  return function easeLinear(t: number): number {
    for (let i = 1, l = xPoints.length; i < l; i++) {
      const currentX = xPoints[i];
      if (t <= currentX) {
        const prevX = xPoints[i - 1];
        const prevY = yPoints[i - 1];
        return prevY + ((yPoints[i] - prevY) * (t - prevX)) / (currentX - prevX);
      }
    }
    return yPoints[yPoints.length - 1];
  };
};
