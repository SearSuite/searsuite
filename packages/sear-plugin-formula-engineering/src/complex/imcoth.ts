/** IMCOTH returns the hyperbolic cotangent. Example: =IMCOTH("1+i") returns a complex value. */
import { engineeringFunction } from '../shared/functionFactory';
import { unaryComplex, operations } from '../shared/complexOperations';
import { complex } from '../shared/complex';
export const IMCOTH = engineeringFunction({ name:'IMCOTH', summary:'Returns the hyperbolic cotangent of a complex number.', example:'=IMCOTH("1+i")', minArgs:1, maxArgs:1, parameters:['inumber'], operation(values){ return unaryComplex(values[0]!, (z) => complex.divide(operations.cosh(z), operations.sinh(z))); } });
