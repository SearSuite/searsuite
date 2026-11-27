import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { findKernelPresentationPaths } from '../lib/kernel-package-boundaries.mjs';
const kernel = '@searsuite/sear-assembly-sheet-kernel';
test('accepts business-only dependencies', () => {
  assert.deepEqual(findKernelPresentationPaths(new Map([[kernel, ['@searsuite/sear-domain-sheet']]])), []);
});
test('rejects presentation hidden behind a neutral intermediate package', () => {
  const render = '@searsuite/sear-render-node';
  assert.deepEqual(
    findKernelPresentationPaths(
      new Map([
        [kernel, ['bridge']],
        ['bridge', [render]],
      ]),
    ),
    [[kernel, 'bridge', render]],
  );
});
test('rejects visual Sheet composition from Headless', () => {
  const headless = '@searsuite/sear-assembly-headless',
    setup = '@searsuite/sear-assembly-setup';
  assert.deepEqual(findKernelPresentationPaths(new Map([[headless, [setup]]])), [[headless, setup]]);
});
test('terminates traversal when a malformed dependency graph contains a cycle', () => {
  assert.deepEqual(
    findKernelPresentationPaths(
      new Map([
        [kernel, ['bridge']],
        ['bridge', [kernel]],
      ]),
    ),
    [],
  );
});
