import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const workspaceRoot = process.cwd();
const sheetSourceRoots = [
  join(workspaceRoot, 'packages', 'sear-assembly-setup', 'src', 'sheet'),
  join(workspaceRoot, 'packages', 'sear-plugin-cell-editor', 'src'),
  join(workspaceRoot, 'packages', 'sear-render-registry', 'src'),
  join(workspaceRoot, 'packages', 'sear-sheet-editor-contract', 'src'),
];
const forbidden = [
  'SearCoreDoc',
  'DocInputPlugin',
  'DocLayoutEngine',
  'DocCursorManager',
  'DocCompositionManager',
];
const violations = [];

async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'dist' || entry.name === 'node_modules') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await visit(path);
      continue;
    }
    if (!entry.isFile() || !path.endsWith('.ts') || path.endsWith('.d.ts')) continue;
    const source = await readFile(path, 'utf8');
    const importStatements = source.match(/(?:import|export)[\s\S]*?from\s*['"][^'"]+['"];?/g) ?? [];
    for (const statement of importStatements) {
      for (const name of forbidden) {
        if (new RegExp(`\\b${name}\\b`).test(statement)) {
          violations.push(`${relative(workspaceRoot, path)} imports ${name}`);
        }
      }
    }
  }
}

for (const root of sheetSourceRoots) await visit(root);

if (violations.length > 0) {
  console.error(`Sheet/Doc boundary check failed:\n${violations.join('\n')}`);
  process.exit(1);
}

console.log('Sheet/Doc boundary check passed.');
