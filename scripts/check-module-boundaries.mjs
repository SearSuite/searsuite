import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const roots = [join(process.cwd(), 'packages')];
const ignoredDirectories = new Set(['dist', 'node_modules', 'spec']);
const violations = [];

async function visit(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue;

    const entryPath = join(path, entry.name);
    if (entry.isDirectory()) {
      await visit(entryPath);
      continue;
    }

    if (!entry.isFile() || !entryPath.endsWith('.ts') || entryPath.endsWith('.d.ts')) continue;

    const source = await readFile(entryPath, 'utf8');
    const relativePath = relative(process.cwd(), entryPath);
    const declaredClasses = [...source.matchAll(/^(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/gm)].map(
      (match) => match[1],
    );
    if (declaredClasses.length > 1) {
      violations.push(`${relativePath} declares multiple classes: ${declaredClasses.join(', ')}`);
    }

    if (requiresSingleExport(relativePath)) {
      const exportedNames = new Set(
        [
          ...source.matchAll(
            /^export\s+(?:(?:declare|abstract)\s+)*(?:class|interface|type|enum|function|const|let|var|namespace)\s+([A-Za-z_$][\w$]*)/gm,
          ),
        ].map((match) => match[1]),
      );
      if (exportedNames.size > 1) {
        violations.push(`${relativePath} exports multiple symbols: ${[...exportedNames].join(', ')}`);
      }
    }
  }
}

function requiresSingleExport(path) {
  if (path.endsWith('/index.ts')) return false;
  if (path.startsWith('packages/sear-domain-formula-engine/src/')) return true;
  if (/^packages\/sear-domain-formula-engine-ts\/src\/[^/]+\.ts$/.test(path)) return true;
  return /^packages\/sear-domain-ot\/src\/(?:Matrix|.*MatrixOperation|.*MatrixComponent|.*MatrixSequence)/.test(path);
}

for (const root of roots) {
  await visit(root);
}

if (violations.length) {
  console.error('Module boundary check failed:\n' + violations.join('\n'));
  process.exit(1);
}

console.log('Module boundary check passed.');
