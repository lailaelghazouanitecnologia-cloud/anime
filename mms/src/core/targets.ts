// Core - Targets

import { scope } from './globals';
import {
  isRegisteredTargetSymbol,
  isDomSymbol,
  isSvgSymbol,
  transformsSymbol,
  isBrowser,
} from './consts';
import { isSvg, isNil, isArr, isStr } from './helpers';
import type {
  DOMTarget,
  DOMTargetsParam,
  JSTargetsArray,
  TargetsParam,
  JSTargetsParam,
  TargetsArray,
  DOMTargetsArray,
  Target,
} from '../types';

export function getNodeList(v: DOMTargetsParam | TargetsParam): NodeList | HTMLCollection | undefined {
  const n = isStr(v) ? scope.root?.querySelectorAll(v) : v;
  if (n instanceof NodeList || n instanceof HTMLCollection) return n;
  return undefined;
}

export function parseTargets(targets: DOMTargetsParam): DOMTargetsArray;
export function parseTargets(targets: JSTargetsParam): JSTargetsArray;
export function parseTargets(targets: TargetsParam): TargetsArray;
export function parseTargets(targets: DOMTargetsParam | JSTargetsParam | TargetsParam): TargetsArray {
  if (isNil(targets)) return [];

  if (!isBrowser) {
    return isArr(targets) ? (targets as unknown[]).flat(Infinity) as TargetsArray : [targets as Target];
  }

  if (isArr(targets)) {
    const flattened = (targets as unknown[]).flat(Infinity);
    const parsed: TargetsArray = [];

    for (let i = 0, l = flattened.length; i < l; i++) {
      const item = flattened[i];
      if (!isNil(item)) {
        const nodeList = getNodeList(item as DOMTargetsParam);
        if (nodeList) {
          for (let j = 0, jl = nodeList.length; j < jl; j++) {
            const subItem = nodeList[j] as Target;
            if (!isNil(subItem)) {
              let isDuplicate = false;
              for (let k = 0, kl = parsed.length; k < kl; k++) {
                if (parsed[k] === subItem) {
                  isDuplicate = true;
                  break;
                }
              }
              if (!isDuplicate) {
                parsed.push(subItem);
              }
            }
          }
        } else {
          let isDuplicate = false;
          for (let j = 0, jl = parsed.length; j < jl; j++) {
            if (parsed[j] === item) {
              isDuplicate = true;
              break;
            }
          }
          if (!isDuplicate) {
            parsed.push(item as Target);
          }
        }
      }
    }
    return parsed;
  }

  const nodeList = getNodeList(targets as DOMTargetsParam);
  if (nodeList) return Array.from(nodeList) as DOMTargetsArray;
  return [targets as Target];
}

export function registerTargets(targets: DOMTargetsParam): DOMTargetsArray;
export function registerTargets(targets: JSTargetsParam): JSTargetsArray;
export function registerTargets(targets: TargetsParam): TargetsArray;
export function registerTargets(targets: DOMTargetsParam | JSTargetsParam | TargetsParam): TargetsArray {
  const parsedTargetsArray = parseTargets(targets as TargetsParam);
  const parsedTargetsLength = parsedTargetsArray.length;

  if (parsedTargetsLength) {
    for (let i = 0; i < parsedTargetsLength; i++) {
      const target = parsedTargetsArray[i] as Target & Record<symbol, unknown>;
      if (!target[isRegisteredTargetSymbol]) {
        target[isRegisteredTargetSymbol] = true;
        const isSvgType = isSvg(target);
        const isDom = (target as DOMTarget).nodeType || isSvgType;
        if (isDom) {
          target[isDomSymbol] = true;
          target[isSvgSymbol] = isSvgType;
          target[transformsSymbol] = {};
        }
      }
    }
  }

  return parsedTargetsArray;
}
