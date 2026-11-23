import { type ErrorCode } from './ErrorCode';
import { FormulaErrorCode } from './FormulaErrorCode';

const formulaErrorCodes = Object.values(FormulaErrorCode) as readonly ErrorCode[];

/** Reports whether a runtime value is a canonical formula error code. */
export function isFormulaErrorCode(code: unknown): code is ErrorCode {
  return typeof code === 'string' && formulaErrorCodes.some((candidate) => candidate === code);
}
