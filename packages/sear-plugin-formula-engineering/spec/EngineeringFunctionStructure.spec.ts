import { readFileSync } from 'fs';
import { join } from 'path';
import { engineeringFunctions } from '../src';

describe('engineering function source structure', () => {
  it('keeps one documented formula in each implementation file', () => {
    for (const formula of engineeringFunctions) {
      const fileName = formula.name.toLowerCase().replace('.precise', 'Precise');
      const category = formula.name.startsWith('BESSEL')
        ? 'bessel'
        : formula.name.startsWith('BIT')
        ? 'bitwise'
        : /^(BIN|DEC|HEX|OCT)2/.test(formula.name)
        ? 'radix'
        : ['DELTA', 'GESTEP'].includes(formula.name)
        ? 'comparison'
        : formula.name.startsWith('ERF')
        ? 'errorFunction'
        : formula.name === 'CONVERT'
        ? 'conversion'
        : 'complex';
      const source = readFileSync(join(__dirname, '..', 'src', category, `${fileName}.ts`), 'utf8');
      expect(source).toContain('/**');
      expect(source).toContain('Example:');
      expect(source.match(/export const /g) ?? []).toHaveLength(1);
    }
  });
});
