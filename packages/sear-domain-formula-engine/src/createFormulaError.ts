import { SearError } from '@searsuite/sear-foundation-error';
import { type ErrorCode } from './ErrorCode';
import { type FormulaError } from './FormulaError';
import { isFormulaErrorCode } from './isFormulaErrorCode';

/** Creates a validated serializable formula error value. */
export function createFormulaError<T extends ErrorCode>(code: T): FormulaError & { code: T } {
  if (!isFormulaErrorCode(code)) throw new SearError(`Invalid formula error code: ${String(code)}`);
  return { kind: 'error', code };
}
