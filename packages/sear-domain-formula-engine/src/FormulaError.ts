import { type ErrorCode } from './ErrorCode';

/** Serializable formula error value. */
export interface FormulaError {
  kind: 'error';
  code: ErrorCode;
}
