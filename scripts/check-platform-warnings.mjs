import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const sourceRoots = [join(process.cwd(), 'packages')];
const ignoredDirectories = new Set(['dist', 'node_modules']);
const violations = [];

async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue;

    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await visit(path);
      continue;
    }

    if (!entry.isFile() || !path.endsWith('.ts') || path.endsWith('.d.ts')) continue;

    const relativePath = relative(process.cwd(), path);
    const source = await readFile(path, 'utf8');
    if (
      /\bconsole\.warn\s*\(/.test(source) &&
      // NodePlatform implements the host warning sink for headless editors.
      relativePath !== join('packages', 'sear-node-adapters', 'src', 'NodePlatform.ts')
    ) {
      violations.push(`${relativePath}: reusable packages must report diagnostics through Platform.warn`);
    }
    if (/\bnew\s+Error\s*\(/.test(source) && relativePath.includes('/src/')) {
      violations.push(`${relativePath}: runtime failures must use SearError or a package-specific SearError subtype`);
    }
  }
}

for (const sourceRoot of sourceRoots) await visit(sourceRoot);

if (violations.length) {
  console.error('Platform warning check failed:\n' + violations.join('\n'));
  process.exit(1);
}

console.log('Platform warning check passed.');
