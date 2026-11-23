import { numberError, type NumericResult } from '../shared/mathUtils';

export function boundedTrig(operation: (value: number) => number): (value: number) => NumericResult {
  return (value) => Math.abs(value) >= 2 ** 27 ? numberError() : operation(value);
}
