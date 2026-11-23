import { type FormulaDirectAddInCall } from './FormulaDirectAddInCall';
import { type FormulaRegisteredAddInCall } from './FormulaRegisteredAddInCall';

/** Supported host add-in invocation request. */
export type FormulaAddInCall = FormulaRegisteredAddInCall | FormulaDirectAddInCall;
