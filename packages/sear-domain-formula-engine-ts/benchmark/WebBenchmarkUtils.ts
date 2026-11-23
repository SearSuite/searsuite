import { SearError } from '@searsuite/sear-foundation-error';
/** Measures a warmed path, asserting a configurable p95 limit even without CI configuration. */
export function benchmarkWeb(operation: () => void, defaultLimit = 2_000): number {
  operation();
  const samples: number[] = [];
  for (let sample = 0; sample < 10; sample++) {
    const start = performance.now();
    operation();
    samples.push(performance.now() - start);
  }
  samples.sort((left, right) => left - right);
  const p95 = samples[Math.ceil(samples.length * 0.95) - 1];
  const limit = Number(process.env['FORMULA_BENCHMARK_MAX_P95_MS'] ?? defaultLimit);
  if (!Number.isFinite(limit) || limit <= 0) throw new SearError('FORMULA_BENCHMARK_MAX_P95_MS must be positive.');
  expect(p95).toBeLessThan(limit);
  return p95;
}
