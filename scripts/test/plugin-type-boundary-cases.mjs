import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const script = fileURLToPath(new URL('../check-plugin-type-boundaries.mjs', import.meta.url));
function audit(files) {
  const root = mkdtempSync(join(tmpdir(), 'searsuite-plugin-boundary-'));
  try {
    const sources = {
      'package.json': JSON.stringify({ name: 'extension-contract-fixture' }),
      'tsconfig.json': JSON.stringify({
        compilerOptions: { target: 'ES2022', module: 'commonjs', strict: true, noEmit: true },
        include: ['**/*.ts'],
      }),
      'base.ts': 'export abstract class Plugin<T> { abstract read(): T; }',
      ...files,
    };
    for (const [file, contents] of Object.entries(sources)) {
      const target = resolve(root, file);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, contents);
    }
    const result = spawnSync(
      process.execPath,
      [script, '--project', join(root, 'tsconfig.json'), '--json', join(root, 'audit.json')],
      { encoding: 'utf8' },
    );
    const report =
      result.status === 0 || result.stderr.includes('Plugin type boundary check failed')
        ? JSON.parse(readFileSync(join(root, 'audit.json'), 'utf8'))
        : null;
    return { ...result, report };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('accepts neutral state and inherited plugin contracts even when the implementation has another name', () => {
  const result = audit({
    'main.ts':
      "import {Plugin as Base} from './base'; export class Feature extends Base<readonly string[]> { read(){return ['value'];} }",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.report.declarations.some((name) => name.endsWith('Feature')));
});

test('rejects render types hidden behind an imported alias and a neutral wrapper', () => {
  const result = audit({
    'render/package.json': '{"name":"@searsuite/sear-render-context"}',
    'render/types.ts': 'export interface PaintContext { paint(): void; }',
    'wrapper.ts':
      "import type {PaintContext as Drawing} from './render/types'; export interface Options { adapter: Drawing; }",
    'main.ts':
      "import {Plugin} from './base'; import type {Options} from './wrapper'; export class Feature extends Plugin<null>{ constructor(options:Options){super();} read(){return null;} }",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /wrapper\.ts.*Options[\s\S]*render\/types\.ts/);
});

test('rejects Core references reached through plugin state', () => {
  const result = audit({
    'core/package.json': '{"name":"@searsuite/sear-assembly-core"}',
    'core/types.ts': 'export interface Runtime { execute(): void; }',
    'main.ts':
      "import {Plugin} from './base'; import type {Runtime} from './core/types'; type State={runtime:Runtime}; export class Feature extends Plugin<State> { constructor(readonly state:State){super();} read(){return this.state;} }",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /core\/types\.ts/);
});

test('rejects old rendering hooks inherited from a helper class', () => {
  const result = audit({
    'main.ts':
      "import {Plugin} from './base'; abstract class Presentation extends Plugin<null>{render(){return null;}} export class Feature extends Presentation {read(){return null;}}",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /obsolete view hook render/);
});

test('checks anonymous plugin implementations', () => {
  const result = audit({
    'main.ts':
      "import {Plugin} from './base'; export const Feature = class extends Plugin<null>{read(){return null;} onRender(){} };",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /obsolete view hook onRender/);
});

test('fails unresolved types instead of treating them as proof of neutrality', () => {
  const result = audit({
    'main.ts':
      "import {Plugin} from './base'; import type {Context} from './missing'; export class Feature extends Plugin<Context>{read():Context{throw 0;}}",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Cannot find module/);
});

test('rejects compatibility exports through a composition package', () => {
  const result = audit({
    'assembly/package.json': '{"name":"@searsuite/sear-assembly-setup"}',
    'assembly/index.ts': "export {Plugin} from '../base';",
    'main.ts': "import {Plugin} from './assembly'; export class Feature extends Plugin<null>{read(){return null;}}",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /composition entry point re-exports plugin Plugin/);
});

for (const path of ['spec/fixture.ts', 'scripts/fixture.ts', 'spec/fixture.js', 'scripts/fixture.mjs']) {
  test(`checks old hooks in ${path}`, () => {
    const result = audit({
      [path]:
        "import {Plugin} from '../base'; export class Feature extends Plugin { read(){return null;} render(){return [];} }",
    });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /obsolete view hook render/);
  });
}
test('does not mistake a neutral test fixture for its surrounding visual package', () => {
  const result = audit({
    'package.json': '{"name":"@searsuite/sear-assembly-core"}',
    'base.ts': '',
    'spec/base.ts': 'export abstract class Plugin<T> { abstract read(): T; }',
    'spec/fixture.ts': "import {Plugin} from './base'; export class Feature extends Plugin<null>{read(){return null;}}",
  });
  assert.equal(result.status, 0, result.stderr);
});

test('rejects state reduction hooks left on presentation extensions', () => {
  const result = audit({
    'main.ts':
      'class ViewExtensionBase {} export class FeatureView extends ViewExtensionBase { apply(){return null;} registerState(){return null;} }',
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /business state hook on view apply/);
  assert.match(result.stderr, /business state hook on view registerState/);
});

test('rejects presentation options silently accepted by JavaScript Headless callers', () => {
  const result = audit({
    'scripts/fixture.mjs':
      'function createHeadlessEditor(options) {} createHeadlessEditor({viewport:{width:1,height:1}});',
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /obsolete option viewport on createHeadlessEditor/);
});
