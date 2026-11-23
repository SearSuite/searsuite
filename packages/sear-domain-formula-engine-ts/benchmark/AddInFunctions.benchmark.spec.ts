/** @jest-environment node */
import {
  FormulaAddInServiceDefinition,
  FormulaServiceCacheStatus,
  type FormulaValue,
} from '@searsuite/sear-domain-formula-engine';
import { CALL, EUROCONVERT, FormulaExternalServiceRegistry, REGISTER_ID } from '../src';
import { benchmarkContext } from './benchmarkUtils';

const value = (input: FormulaValue) => ({ kind: 'value' as const, value: input });

describe('add-in and automation function performance', () => {
  it('evaluates 10000 conversions and authorized service calls within the formula budget', () => {
    const services = new FormulaExternalServiceRegistry();
    services.register(FormulaAddInServiceDefinition, {
      resolveRegistration: () => ({ status: FormulaServiceCacheStatus.Ready, value: 7 }),
      call: () => ({ status: FormulaServiceCacheStatus.Ready, value: 42 }),
    });
    const context = { ...benchmarkContext, externalServices: services };
    const cases = [
      () => CALL.evaluate([value(7), value(1)], context),
      () => EUROCONVERT.evaluate([value(1), value('FRF'), value('DEM'), value(true), value(3)], context),
      () => REGISTER_ID.evaluate([value('example'), value('entry'), value('JJ')], context),
    ];
    const run = () => {
      let result: FormulaValue = 0;
      for (let index = 0; index < 10_000; index += 1) result = cases[index % cases.length]();
      expect(result).not.toEqual(expect.objectContaining({ kind: 'error' }));
    };
    run();
    const samples: number[] = [];
    for (let sample = 0; sample < 30; sample += 1) {
      const start = performance.now();
      run();
      samples.push(performance.now() - start);
    }
    samples.sort((left, right) => left - right);
    const p95 = samples[Math.ceil(samples.length * 0.95) - 1];
    const limit = Number(process.env['FORMULA_BENCHMARK_MAX_P95_MS'] ?? 2_000);
    expect(p95).toBeLessThan(limit);
    services.destroy();
  });
});
