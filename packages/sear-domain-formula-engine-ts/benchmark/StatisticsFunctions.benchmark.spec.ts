/** @jest-environment node */

import { type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { mathFunctions } from '../src/functions/math';
import { benchmarkFormula } from './benchmarkUtils';
import { statisticsBenchmarkCases } from './statisticsBenchmarkCases';

function expectValidResult(value: FormulaValue): void {
  if (Array.isArray(value)) {
    expect(value.length).toBeGreaterThan(0);
    for (const row of value) for (const cell of row as FormulaValue[]) expectValidResult(cell);
    return;
  }
  expect(typeof value).toBe('number');
  expect(Number.isFinite(value)).toBe(true);
}

describe('statistics function performance coverage', () => {
  it('measures every statistical registration exactly once', () => {
    const names = statisticsBenchmarkCases.map(([name]) => name);
    expect(new Set(names).size).toBe(names.length);
    const registered = new Set(mathFunctions.map((fn) => fn.name));
    expect(names.every((name) => registered.has(name))).toBe(true);
  });

  it.each(statisticsBenchmarkCases)('%s calculates successfully within its threshold', (_name, formula) => {
    expectValidResult(benchmarkFormula(formula).result);
  });
});
