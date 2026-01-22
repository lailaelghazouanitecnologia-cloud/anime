// Timeline - Position parser

import { minValue, relativeValuesExecRgx } from '../core/consts';
import { isNil, isNum, isUnd, stringStartsWith } from '../core/helpers';
import { getRelativeValue } from '../core/values';
import type { Tickable, TimelinePosition } from '../types';

// Forward declaration for Timeline type to avoid circular imports
interface Timeline {
  iterationDuration: number;
  labels: Record<string, number>;
  _tail: Tickable | null;
}

function getPrevChildOffset(timeline: Timeline, timePosition: string): number | undefined {
  if (stringStartsWith(timePosition, '<')) {
    const goToPrevAnimationOffset = timePosition[1] === '<';
    const prevAnimation = timeline._tail as Tickable;
    const prevOffset = prevAnimation ? prevAnimation._offset + prevAnimation._delay : 0;
    return goToPrevAnimationOffset ? prevOffset : prevOffset + prevAnimation.duration;
  }
  return undefined;
}

export function parseTimelinePosition(timeline: Timeline, timePosition?: TimelinePosition): number {
  let tlDuration = timeline.iterationDuration;
  if (tlDuration === minValue) tlDuration = 0;
  if (isUnd(timePosition)) return tlDuration;
  if (isNum(+timePosition!)) return +timePosition!;
  const timePosStr = timePosition as string;
  const tlLabels = timeline ? timeline.labels : null;
  const hasLabels = !isNil(tlLabels);
  const prevOffset = getPrevChildOffset(timeline, timePosStr);
  const hasSibling = !isUnd(prevOffset);
  const matchedRelativeOperator = relativeValuesExecRgx.exec(timePosStr);
  if (matchedRelativeOperator) {
    const fullOperator = matchedRelativeOperator[0];
    const split = timePosStr.split(fullOperator);
    const labelOffset = hasLabels && split[0] ? tlLabels![split[0]] : tlDuration;
    const parsedOffset = hasSibling ? prevOffset! : hasLabels ? labelOffset : tlDuration;
    const parsedNumericalOffset = +split[1];
    return getRelativeValue(parsedOffset, parsedNumericalOffset, fullOperator[0]);
  } else {
    return hasSibling ? prevOffset! :
           hasLabels ? !isUnd(tlLabels![timePosStr]) ? tlLabels![timePosStr] :
           tlDuration : tlDuration;
  }
}
