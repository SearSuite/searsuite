import { type FormulaAST } from './FormulaAST';
import { FormulaNodeKind } from './FormulaNodeKind';

/** Reference leaves shared by immutable formula transformations. */
export type FormulaReferenceNode = Extract<
  FormulaAST,
  {
    kind:
      | typeof FormulaNodeKind.Cell
      | typeof FormulaNodeKind.Range
      | typeof FormulaNodeKind.WorkbookCell
      | typeof FormulaNodeKind.WorkbookRange
      | typeof FormulaNodeKind.RowRange
      | typeof FormulaNodeKind.ColumnRange;
  }
>;
