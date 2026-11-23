/** @jest-environment node */
import {
  FormulaCubeServiceDefinition,
  FormulaServiceCacheStatus,
  type FormulaCubeQuery,
  type FormulaCubeResult,
} from '@searsuite/sear-domain-formula-engine';
import {
  CUBEKPIMEMBER,
  CUBEMEMBER,
  CUBEMEMBERPROPERTY,
  CUBERANKEDMEMBER,
  CUBESET,
  CUBESETCOUNT,
  CUBEVALUE,
  FormulaExternalServiceRegistry,
} from '../src';
import { benchmarkContext } from './benchmarkUtils';

const member = { kind: 'cube-member', connection: 'Sales', expression: '[Time].[2004]', caption: 'FY 2004' } as const;
const set = { kind: 'cube-set', connection: 'Sales', expression: '[Product].Members', caption: 'Products', count: 10_000 } as const;

describe('Cube function performance', () => {
  it('performs 10000 synchronous cache reads with valid typed results', () => {
    const registry = new FormulaExternalServiceRegistry();
    registry.register(FormulaCubeServiceDefinition, {
      read: (query: FormulaCubeQuery) => ({ status: FormulaServiceCacheStatus.Ready, value: resultFor(query) }),
      subscribeInvalidation: () => () => void 0,
    });
    const context = { ...benchmarkContext, externalServices: registry };
    const text = (value: string) => ({ kind: 'value' as const, value });
    const number = (value: number) => ({ kind: 'value' as const, value });
    const cases = [
      () => CUBEKPIMEMBER.evaluate([text('Sales'), text('KPI'), number(1)], context),
      () => CUBEMEMBER.evaluate([text('Sales'), text('[Time].[2004]')], context),
      () => CUBEMEMBERPROPERTY.evaluate([text('Sales'), { kind: 'value', value: member }, text('Name')], context),
      () => CUBERANKEDMEMBER.evaluate([text('Sales'), { kind: 'value', value: set }, number(1)], context),
      () => CUBESET.evaluate([text('Sales'), text('[Product].Members')], context),
      () => CUBESETCOUNT.evaluate([{ kind: 'value', value: set }], context),
      () => CUBEVALUE.evaluate([text('Sales'), { kind: 'value', value: member }], context),
    ];

    const run = () => {
      let result: FormulaCubeResult = 0;
      for (let index = 0; index < 10_000; index++) result = cases[index % cases.length]();
      expect(result).not.toEqual(expect.objectContaining({ kind: 'error' }));
    };
    run();
    const samples: number[] = [];
    for (let sample = 0; sample < 30; sample++) {
      const start = performance.now();
      run();
      samples.push(performance.now() - start);
    }
    samples.sort((left, right) => left - right);
    const p95 = samples[Math.ceil(samples.length * 0.95) - 1];
    const limit = Number(process.env['FORMULA_BENCHMARK_MAX_P95_MS'] ?? 2_000);
    expect(p95).toBeLessThan(limit);
    registry.destroy();
  });
});

function resultFor(query: FormulaCubeQuery): FormulaCubeResult {
  if (query.kind === 'set') return set;
  if (query.kind === 'set-count') return set.count;
  if (query.kind === 'member-property') return 'FY 2004';
  if (query.kind === 'value') return 42;
  return member;
}
