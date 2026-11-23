/** IMTANH returns the hyperbolic tangent. Example: =IMTANH("1+i") returns a complex value. */
import { engineeringFunction } from '../shared/functionFactory';
import { unaryComplex, operations } from '../shared/complexOperations';
import { complex } from '../shared/complex';
export const IMTANH = engineeringFunction({ name:'IMTANH', summary:'Returns the hyperbolic tangent of a complex number.', example:'=IMTANH("1+i")', minArgs:1, maxArgs:1, parameters:['inumber'], operation(values){ return unaryComplex(values[0]!, (z) => complex.divide(operations.sinh(z), operations.cosh(z))); } });
