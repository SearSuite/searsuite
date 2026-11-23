import fs from 'node:fs';
import path from 'node:path';

const googleRoot = path.resolve(__dirname, '../src/functions/google');
const excludedFiles = new Set(['index.ts', 'googleRuntime.ts', 'queryParser.ts', 'queryRuntime.ts', 'sortnRuntime.ts']);

function formulaFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return formulaFiles(entryPath);
    return entry.name.endsWith('.ts') && !excludedFiles.has(entry.name) ? [entryPath] : [];
  });
}

describe('Google-compatible formula structure', () => {
  it('keeps one documented formula with a basic example in each categorized file', () => {
    const files = formulaFiles(googleRoot);
    expect(files).toHaveLength(34);

    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      expect(source.match(/export const [A-Z][A-Z0-9_]*/g) ?? []).toHaveLength(1);
      expect(source).toMatch(/\*\*[\s\S]*Example:/);
    }
  });
});
