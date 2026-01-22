// Utils - Random

export type RandomNumberGenerator = (min?: number, max?: number, decimalLength?: number) => number;

/**
 * Generates a random number between min and max (inclusive) with optional decimal precision
 */
export const random: RandomNumberGenerator = (min = 0, max = 1, decimalLength = 0): number => {
  const m = 10 ** decimalLength;
  return Math.floor((Math.random() * (max - min + (1 / m)) + min) * m) / m;
};

let _seed = 0;

/**
 * Creates a seeded pseudorandom number generator function
 */
export function createSeededRandom(
  seed?: number,
  seededMin: number = 0,
  seededMax: number = 1,
  seededDecimalLength: number = 0
): RandomNumberGenerator {
  let t = seed === undefined ? _seed++ : seed;
  return (min = seededMin, max = seededMax, decimalLength = seededDecimalLength): number => {
    t += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    const m = 10 ** decimalLength;
    return Math.floor(((((t ^ t >>> 14) >>> 0) / 4294967296) * (max - min + (1 / m)) + min) * m) / m;
  };
}

/**
 * Picks a random element from an array or a string
 */
export function randomPick<T>(items: T[]): T;
export function randomPick(items: string): string;
export function randomPick<T>(items: string | T[]): string | T {
  return items[random(0, items.length - 1)];
}

/**
 * Shuffles an array in-place using the Fisher-Yates algorithm
 */
export function shuffle<T>(items: T[]): T[] {
  let m = items.length, t: T, i: number;
  while (m) {
    i = random(0, --m);
    t = items[m];
    items[m] = items[i];
    items[i] = t;
  }
  return items;
}
