import { type EvalContext } from '@searsuite/sear-domain-formula-engine';

export function randomValue(context: Pick<EvalContext, 'random'>): number {
  const value = context.random?.() ?? Math.random();
  return Number.isFinite(value) ? Math.min(1 - Number.EPSILON, Math.max(0, value)) : 0;
}
