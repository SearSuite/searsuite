/** @jest-environment node */
import { FormulaWebServiceDefinition } from '@searsuite/sear-domain-formula-engine';
import { FormulaExternalServiceRegistry, FormulaWebServiceCache, WEBSERVICE } from '../src';
import { benchmarkContext } from './benchmarkUtils';
import { benchmarkWeb } from './WebBenchmarkUtils';

describe('WEBSERVICE performance', () => {
  it('reads 10000 cached responses without issuing more network work', async () => {
    const url = 'https://example.com/data.xml';
    const loader = jest.fn(async () => '<r>response</r>');
    const cache = new FormulaWebServiceCache(loader);
    const registry = new FormulaExternalServiceRegistry();
    registry.register(FormulaWebServiceDefinition, cache);
    await Promise.all(Array.from({ length: 1_000 }, () => cache.load(url)));
    const context = { ...benchmarkContext, externalServices: registry };
    const args = [{ kind: 'value' as const, value: url }];
    try {
      const p95 = benchmarkWeb(() => {
        let result;
        for (let index = 0; index < 10_000; index++) result = WEBSERVICE.evaluate(args, context);
        expect(result).toBe('<r>response</r>');
      });
      expect(loader).toHaveBeenCalledTimes(1);
      console.log(`WEBSERVICE 10000 cache hits: p95 ${p95.toFixed(2)} ms`);
    } finally {
      registry.destroy();
      cache.destroy();
    }
  });
});
