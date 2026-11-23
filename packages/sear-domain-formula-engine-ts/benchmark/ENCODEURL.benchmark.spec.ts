/** @jest-environment node */
import { ENCODEURL } from '../src';
import { benchmarkContext } from './benchmarkUtils';
import { benchmarkWeb } from './WebBenchmarkUtils';

describe('ENCODEURL performance', () => {
  it('encodes 200 substantial Unicode URL components within the p95 budget', () => {
    const input = 'A&B 中文 😀'.repeat(500);
    const args = [{ kind: 'value' as const, value: input }];
    const expected = encodeURIComponent(input);
    const p95 = benchmarkWeb(() => {
      for (let index = 0; index < 200; index++) expect(ENCODEURL.evaluate(args, benchmarkContext)).toBe(expected);
    });
    console.log(`ENCODEURL 200 x ${input.length} characters: p95 ${p95.toFixed(2)} ms`);
  });
});
