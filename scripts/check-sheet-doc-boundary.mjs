import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const workspaceRoot = process.cwd();
const sheetSourceRoots = [
  join(workspaceRoot, 'packages', 'sear-assembly-setup', 'src', 'sheet'),
  join(workspaceRoot, 'packages', 'sear-plugin-cell-editor', 'src'),
  join(workspaceRoot, 'packages', 'sear-render-registry', 'src'),
  join(workspaceRoot, 'packages', 'sear-sheet-editor-contract', 'src'),
];
const forbidden = ['SearCoreDoc', 'DocInputPlugin', 'DocLayoutEngine', 'DocCursorManager', 'DocCompositionManager'];
const violations = [];

async function visit(directory, presentationOnly = false) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'dist' || entry.name === 'node_modules') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await visit(path, presentationOnly);
      continue;
    }
    if (!entry.isFile() || !path.endsWith('.ts') || path.endsWith('.d.ts')) continue;
    const source = await readFile(path, 'utf8');
    if (presentationOnly && /new\s+(?:DocKernel|DocInputPlugin|PluginManager|SearCoreDoc)\s*\(/.test(source))
      violations.push(
        `${relative(workspaceRoot, path)} constructs an unused document business runtime in presentation`,
      );
    const importStatements = source.match(/(?:import|export)[\s\S]*?from\s*['"][^'"]+['"];?/g) ?? [];
    for (const statement of presentationOnly ? [] : importStatements) {
      for (const name of forbidden) {
        if (new RegExp(`\\b${name}\\b`).test(statement)) {
          violations.push(`${relative(workspaceRoot, path)} imports ${name}`);
        }
      }
    }
  }
}

for (const root of sheetSourceRoots) await visit(root);
await visit(join(workspaceRoot, 'packages', 'sear-assembly-sheet-doc', 'src'), true);

if (violations.length > 0) {
  console.error(`Sheet/Doc boundary check failed:\n${violations.join('\n')}`);
  process.exit(1);
}

console.log('Sheet/Doc boundary check passed.');
