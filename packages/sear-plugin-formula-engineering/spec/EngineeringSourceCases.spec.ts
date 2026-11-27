import { readFileSync } from 'fs';
import { join } from 'path';
import type { EvalContext } from '@searsuite/sear-domain-formula-engine';
import {
  AggregationCache,
  FormulaEvaluator,
  FormulaParser,
  FunctionRegistry,
} from '@searsuite/sear-domain-formula-engine-ts';
import { engineeringFunctions } from '../src';
import { parseComplex } from '../src/shared/complex';
import { isFormulaError } from '../src/shared/errors';

interface SourceCase {
  readonly formula: string;
  readonly expected: string;
}

const sourceCases = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'source-cases.json'), 'utf8')) as SourceCase[];
const registry = new FunctionRegistry();
for (const formula of engineeringFunctions) registry.register(formula);
const evaluator = new FormulaEvaluator(registry, new AggregationCache());
const parser = new FormulaParser();
const context: EvalContext = { isCellInBounds: () => true, getCellValue: () => 0, iterateRange: () => [] };

describe('all normalized engineering source cases', () => {
  it('retains every source formula as an executable typed assertion', () => expect(sourceCases).toHaveLength(90));

  it.each(sourceCases)('$formula -> $expected', ({ formula, expected }) => {
    const actual = evaluator.evaluate(parser.parse(formula), context);
    if (expected.startsWith('#')) {
      expect(actual).toEqual({ kind: 'error', code: expected });
      return;
    }
    if (typeof actual === 'number') {
      const expectedNumber = Number(expected);
      expect(Number.isFinite(actual)).toBe(true);
      if (/e/i.test(expected))
        expect(Math.abs(actual - expectedNumber) / Math.abs(expectedNumber)).toBeLessThan(0.0005);
      else expect(actual).toBeCloseTo(expectedNumber, Number.isInteger(expectedNumber) ? 10 : 6);
      return;
    }
    if (typeof actual === 'string' && /[ij]$/.test(actual) && /[ij]$/.test(expected)) {
      const actualComplex = parseComplex(actual);
      const expectedComplex = parseComplex(expected);
      expect(isFormulaError(actualComplex)).toBe(false);
      expect(isFormulaError(expectedComplex)).toBe(false);
      if (!isFormulaError(actualComplex) && !isFormulaError(expectedComplex)) {
        expect(actualComplex.real).toBeCloseTo(expectedComplex.real, 11);
        expect(actualComplex.imaginary).toBeCloseTo(expectedComplex.imaginary, 11);
        expect(actualComplex.suffix).toBe(expectedComplex.suffix);
      }
      return;
    }
    expect(actual).toBe(expected);
  });
});
