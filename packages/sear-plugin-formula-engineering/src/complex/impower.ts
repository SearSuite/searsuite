/** IMPOWER raises a complex number to a real power. Example: =IMPOWER("2+3i",3) returns "-46+9i". */
import { engineeringFunction } from '../shared/functionFactory';
import { parsed } from '../shared/complexOperations';
import { complexPower, formatComplex } from '../shared/complex';
import { numeric } from '../shared/arguments';
import { isFormulaError } from '../shared/errors';
export const IMPOWER = engineeringFunction({
  name: 'IMPOWER',
  summary: 'Raises a complex number to a real power.',
  example: '=IMPOWER("2+3i",3)',
  minArgs: 2,
  maxArgs: 2,
  parameters: ['inumber', 'number'],
  operation(values) {
    const z = parsed(values[0]!);
    if (isFormulaError(z)) return z;
    const power = numeric(values[1]!);
    if (isFormulaError(power)) return power;
    const result = complexPower(z, power);
    return formatComplex(result.real, result.imaginary, z.suffix);
  },
});
