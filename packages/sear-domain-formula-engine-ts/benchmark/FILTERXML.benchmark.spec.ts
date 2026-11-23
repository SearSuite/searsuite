/** @jest-environment node */
import { NodeXmlXPathEvaluator } from '@searsuite/sear-assembly-headless';
import { FILTERXML } from '../src';
import { benchmarkContext } from './benchmarkUtils';
import { benchmarkWeb } from './WebBenchmarkUtils';

describe('FILTERXML performance', () => {
  it('parses and extracts 2000 XML values within the p95 budget', () => {
    const xml = `<r>${Array.from({ length: 2_000 }, (_, index) => `<v>${index}</v>`).join('')}</r>`;
    const context = { ...benchmarkContext, xmlXPath: new NodeXmlXPathEvaluator() };
    const args = [
      { kind: 'value' as const, value: xml },
      { kind: 'value' as const, value: '//v' },
    ];
    const p95 = benchmarkWeb(() => {
      const result = FILTERXML.evaluate(args, context);
      expect(result).toHaveLength(2_000);
      expect(Array.isArray(result) && result[1_999]).toEqual(['1999']);
    });
    console.log(`FILTERXML 2000 nodes: p95 ${p95.toFixed(2)} ms`);
  });
});
