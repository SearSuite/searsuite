/** @jest-environment node */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FunctionRegistry, webFunctions } from '../../src';

describe('Web formula source and registration contract', () => {
  it('keeps one documented formula per source file in the Web category', () => {
    expect(webFunctions.map((fn) => fn.name).sort()).toEqual(['ENCODEURL', 'FILTERXML', 'WEBSERVICE']);
    const directory = join(__dirname, '../../src/functions/web');
    const sources = readdirSync(directory).filter((file) => file.endsWith('.ts'));
    for (const fn of webFunctions) {
      const matches = sources
        .map((file) => readFileSync(join(directory, file), 'utf8'))
        .filter((source) => source.includes(`export const ${fn.name}: FormulaFunction`));
      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatch(new RegExp(`/\\*\\*[^]*Example:[^]*\\*/\\s*export const ${fn.name}: FormulaFunction`));
      expect(matches[0].match(/export const [A-Z][A-Z0-9]*: FormulaFunction/g)).toHaveLength(1);
      expect(fn.descriptor?.category).toBe('Web');
      expect(new FunctionRegistry().get(fn.name.toLowerCase())).toEqual(fn);
    }
  });
});
