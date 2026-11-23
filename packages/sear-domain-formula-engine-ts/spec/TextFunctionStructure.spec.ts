import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FunctionRegistry } from '../src/functions';

const documentedTextFunctions = [
  'ARRAYTOTEXT', 'ASC', 'BAHTTEXT', 'CHAR', 'CLEAN', 'CODE', 'CONCAT', 'CONCATENATE', 'DBCS',
  'DETECTLANGUAGE', 'DOLLAR', 'EXACT', 'FIND', 'FINDB', 'FIXED', 'JIS', 'LEFT', 'LEFTB', 'LEN',
  'LENB', 'LOWER', 'MID', 'MIDB', 'NUMBERVALUE', 'PHONETIC', 'PROPER', 'REGEXEXTRACT',
  'REGEXREPLACE', 'REGEXTEST', 'REPLACE', 'REPLACEB', 'REPT', 'RIGHT', 'RIGHTB', 'SEARCH',
  'SEARCHB', 'SUBSTITUTE', 'T', 'TEXT', 'TEXTAFTER', 'TEXTBEFORE', 'TEXTJOIN', 'TEXTSPLIT',
  'TRANSLATE', 'TRIM', 'UNICHAR', 'UNICODE', 'UPPER', 'VALUE', 'VALUETOTEXT',
] as const;

describe('text function source structure', () => {
  it('registers every function in the text documentation', () => {
    const registry = new FunctionRegistry();
    for (const name of documentedTextFunctions) expect(registry.has(name)).toBe(true);
  });

  it('keeps every formula definition in one documented source file', () => {
    const directory = join(__dirname, '../src/functions/text');
    const sources = readdirSync(directory).filter((name) => name.endsWith('.ts'));
    for (const name of documentedTextFunctions) {
      const matches = sources.flatMap((file) => {
        const source = readFileSync(join(directory, file), 'utf8');
        return source.includes(`export const ${name}: FormulaFunction`) ? [{ file, source }] : [];
      });
      expect(matches).toHaveLength(1);
      expect(matches[0].source).toMatch(new RegExp(`/\\*\\*[^]*Example:[^]*\\*/\\s*export const ${name}: FormulaFunction`));
      expect(matches[0].source.match(/export const [A-Z][A-Z0-9]*: FormulaFunction/g)).toHaveLength(1);
    }
  });
});
