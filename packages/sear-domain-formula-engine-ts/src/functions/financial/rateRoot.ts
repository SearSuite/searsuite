import { FormulaErrorCode, createFormulaError, type FormulaError } from '@searsuite/sear-domain-formula-engine';

/** RATE follows the product's finite iteration budget from the supplied guess. */
export function solveRateRoot(
  periods: number,
  payment: number,
  presentValue: number,
  futureValue: number,
  type: number,
  guess: number,
): number | FormulaError {
  const error = createFormulaError(FormulaErrorCode.Number);
  if (periods === 1 && payment === 0 && presentValue !== 0) {
    const rate = -futureValue / presentValue - 1;
    return Number.isFinite(rate) && rate > -1 ? rate : error;
  }
  let rate = guess;
  const scale = Math.max(1, Math.abs(payment), Math.abs(presentValue), Math.abs(futureValue));
  const value = (candidate: number): number => {
    if (candidate <= -1) return NaN;
    if (candidate === 0) return presentValue + payment * periods + futureValue;
    const growth = Math.pow(1 + candidate, periods);
    return presentValue * growth + payment * (1 + candidate * type) * ((growth - 1) / candidate) + futureValue;
  };

  for (let iteration = 0; iteration < 64; iteration++) {
    const current = value(rate);
    if (!Number.isFinite(current)) return error;
    const delta = Math.max(1e-7, Math.abs(rate) * 1e-5);
    const upper = rate + delta;
    const lower = Math.max(-0.999999999999, rate - delta);
    const slope = (value(upper) - value(lower)) / (upper - lower);
    if (!Number.isFinite(slope) || slope === 0) return error;
    const next = rate - current / slope;
    if (!Number.isFinite(next) || next <= -1) return error;
    if (Math.abs(next - rate) <= 1e-12 * Math.max(1, Math.abs(next))) {
      return Math.abs(value(next)) <= 1e-8 * scale ? next : error;
    }
    rate = next;
  }
  return error;
}
