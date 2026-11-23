import { type FormulaCubeMemberValue } from './FormulaCubeMemberValue';
import { type FormulaCubeSetValue } from './FormulaCubeSetValue';
import { type FormulaError } from './FormulaError';
import { type FormulaValue } from './FormulaValue';

/** Value returned from a host-owned CUBE service. */
export type FormulaCubeResult = FormulaValue | FormulaCubeMemberValue | FormulaCubeSetValue | FormulaError;
