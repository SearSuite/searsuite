import { FormulaRangeSourceKind } from './FormulaRangeSourceKind';

/** Source owner for a resolved formula range. */
export type FormulaRangeSource =
  | { kind: typeof FormulaRangeSourceKind.CurrentSheet }
  | { kind: typeof FormulaRangeSourceKind.WorkbookSheet; sheetName: string };
