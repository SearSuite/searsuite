import { type FormulaDateTimeMeridiemSymbol } from './FormulaDateTimeMeridiemSymbol';
import { type FormulaDateTimeMonthSymbol } from './FormulaDateTimeMonthSymbol';
import { type FormulaDateTimeUnitSymbols } from './FormulaDateTimeUnitSymbols';

/** Locale-specific symbols consumed by the shared date/time parser. */
export interface FormulaDateTimeSymbols {
  readonly months?: readonly FormulaDateTimeMonthSymbol[];
  readonly meridiems?: readonly FormulaDateTimeMeridiemSymbol[];
  readonly units?: FormulaDateTimeUnitSymbols;
}
