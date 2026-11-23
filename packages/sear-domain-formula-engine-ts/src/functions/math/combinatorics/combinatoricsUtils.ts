import { numberError } from '../shared/mathUtils';

export function combination(number: number, chosen: number, repeat: boolean): number | ReturnType<typeof numberError> {
  if (number < 0 || number > Number.MAX_SAFE_INTEGER || chosen < 0 ||
    chosen > (repeat ? Number.MAX_SAFE_INTEGER : number)) return numberError();
  if (repeat) {
    if (chosen === 0) return 1;
    return combination(number + chosen - 1, chosen, false);
  }
  if (!Number.isInteger(number) || !Number.isInteger(chosen)) return numberError();
  const k = Math.min(chosen, number - chosen);
  let result = 1;
  for (let index = 1; index <= k; index++) {
    result = (result * (number - k + index)) / index;
    if (!Number.isFinite(result)) return numberError();
  }
  return result;
}

export function gcd(left: number, right: number): number {
  left = Math.abs(left);
  right = Math.abs(right);
  while (right !== 0) [left, right] = [right, left % right];
  return left;
}

export function factorial(value: number): number | ReturnType<typeof numberError> {
  if (value < 0 || !Number.isFinite(value)) return numberError();
  let result = 1;
  for (let index = 2; index <= value; index++) {
    result *= index;
    if (!Number.isFinite(result)) return numberError();
  }
  return result;
}

export function romanValue(value: string): number {
  return { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 }[value] ?? 0;
}

export function roman(value: number, form: number): string {
  const tables: Record<number, Array<[number, string]>> = {
    0: [
      [1000, 'M'],
      [900, 'CM'],
      [500, 'D'],
      [400, 'CD'],
      [100, 'C'],
      [90, 'XC'],
      [50, 'L'],
      [40, 'XL'],
      [10, 'X'],
      [9, 'IX'],
      [5, 'V'],
      [4, 'IV'],
      [1, 'I'],
    ],
    1: [
      [1000, 'M'],
      [950, 'LM'],
      [500, 'D'],
      [450, 'LD'],
      [100, 'C'],
      [95, 'VC'],
      [50, 'L'],
      [45, 'VL'],
      [10, 'X'],
      [9, 'IX'],
      [5, 'V'],
      [4, 'IV'],
      [1, 'I'],
    ],
    2: [
      [1000, 'M'],
      [990, 'XM'],
      [500, 'D'],
      [490, 'XD'],
      [100, 'C'],
      [99, 'IC'],
      [50, 'L'],
      [40, 'XL'],
      [10, 'X'],
      [9, 'IX'],
      [5, 'V'],
      [4, 'IV'],
      [1, 'I'],
    ],
    3: [
      [1000, 'M'],
      [995, 'VM'],
      [500, 'D'],
      [495, 'VD'],
      [100, 'C'],
      [95, 'VC'],
      [50, 'L'],
      [45, 'VL'],
      [10, 'X'],
      [9, 'IX'],
      [5, 'V'],
      [4, 'IV'],
      [1, 'I'],
    ],
    4: [
      [1000, 'M'],
      [999, 'IM'],
      [500, 'D'],
      [499, 'ID'],
      [100, 'C'],
      [99, 'IC'],
      [50, 'L'],
      [49, 'IL'],
      [10, 'X'],
      [9, 'IX'],
      [5, 'V'],
      [4, 'IV'],
      [1, 'I'],
    ],
  };
  let remaining = value;
  let result = '';
  for (const [unit, token] of tables[form] ?? tables[0]) {
    while (remaining >= unit) {
      result += token;
      remaining -= unit;
    }
  }
  return result;
}
