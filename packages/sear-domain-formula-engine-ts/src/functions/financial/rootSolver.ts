import { FormulaErrorCode, createFormulaError, type FormulaError } from '@searsuite/sear-domain-formula-engine';

export interface FinancialRootOptions {
  readonly initialGuess?: number;
  readonly lowerBound?: number;
  readonly upperBound?: number;
  readonly tolerance?: number;
  readonly maxIterations?: number;
}

export type FinancialRootResult = number | FormulaError;

/**
 * Solves a one-dimensional financial equation with a bracketed Newton/bisection method.
 * The fixed iteration budget prevents a malformed cash-flow formula from blocking recalculation.
 */
export function solveFinancialRoot(
  functionValue: (value: number) => number,
  derivative: ((value: number) => number) | undefined,
  options: FinancialRootOptions = {},
): FinancialRootResult {
  const tolerance = options.tolerance ?? 1e-10;
  const maxIterations = options.maxIterations ?? 100;
  const lowerBound = options.lowerBound ?? -0.999999999;
  const upperBound = options.upperBound ?? 1e6;
  const guess = Math.min(upperBound, Math.max(lowerBound, options.initialGuess ?? 0.1));
  if (!(lowerBound < upperBound) || tolerance <= 0 || maxIterations < 1) return numberError();

  let lower = Math.max(lowerBound, guess - 0.1);
  let upper = Math.min(upperBound, guess + 0.1);
  let lowerValue = finite(functionValue(lower));
  let upperValue = finite(functionValue(upper));
  for (
    let attempt = 0;
    attempt < 60 && lowerValue !== null && upperValue !== null && lowerValue * upperValue > 0;
    attempt++
  ) {
    const width = upper - lower;
    lower = Math.max(lowerBound, lower - width * 2);
    upper = Math.min(upperBound, upper + width * 2);
    lowerValue = finite(functionValue(lower));
    upperValue = finite(functionValue(upper));
    if (lower === lowerBound && upper === upperBound) break;
  }
  if (lowerValue === null || upperValue === null) return numberError();
  if (Math.abs(lowerValue) <= tolerance) return lower;
  if (Math.abs(upperValue) <= tolerance) return upper;
  if (lowerValue * upperValue > 0) return numberError();

  let current = guess;
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const currentValue = finite(functionValue(current));
    if (currentValue === null) return numberError();
    if (Math.abs(currentValue) <= tolerance) return current;
    const slope = derivative ? finite(derivative(current)) : null;
    const candidate =
      slope !== null && Math.abs(slope) > Number.EPSILON ? current - currentValue / slope : (lower + upper) / 2;
    const next = candidate > lower && candidate < upper && Number.isFinite(candidate) ? candidate : (lower + upper) / 2;
    const nextValue = finite(functionValue(next));
    if (nextValue === null) return numberError();
    if (Math.abs(nextValue) <= tolerance || Math.abs(upper - lower) <= tolerance) return next;
    if (lowerValue * nextValue <= 0) {
      upper = next;
      upperValue = nextValue;
    } else {
      lower = next;
      lowerValue = nextValue;
    }
    current = next;
  }
  return numberError();
}

function finite(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

function numberError(): FormulaError {
  return createFormulaError(FormulaErrorCode.Number);
}
