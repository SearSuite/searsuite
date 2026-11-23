/** IMLOG returns a complex logarithm in a chosen base. Example: =IMLOG("8",2) returns 3. */
import { engineeringFunction, numbers } from '../shared/functionFactory';
import { parsed } from '../shared/complexOperations';
import { complex, formatComplex } from '../shared/complex';
import { isFormulaError, valueError } from '../shared/errors';
export const IMLOG = engineeringFunction({ name:'IMLOG', summary:'Returns the logarithm of a complex number in a specified base.', example:'=IMLOG("8",2)', minArgs:2, maxArgs:2, parameters:['inumber','base'], operation(values){ const z=parsed(values[0]!);const base=numbers([values[1]!]);if(isFormulaError(z)||isFormulaError(base))return isFormulaError(z)?z:base;if(base[0]!<=0||base[0]===1)return valueError();const result=complex.log(z);return formatComplex(result.real/Math.log(base[0]!),result.imaginary/Math.log(base[0]!),z.suffix); } });
