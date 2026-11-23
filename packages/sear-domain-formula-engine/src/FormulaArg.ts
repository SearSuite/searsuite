import { type FormulaReferenceArgument } from './FormulaReference';
import { type FormulaAST } from './FormulaAST';
import { FormulaNodeKind } from './FormulaNodeKind';
import { type FormulaValue } from './FormulaValue';

/** Function argument preserving lazy reference and expression semantics. */
export type FormulaArg =
  | { kind: 'value'; value: FormulaValue; sourceKind?: FormulaNodeKind; sourceAst?: FormulaAST }
  | { kind: 'expression'; ast: FormulaAST }
  | { kind: 'missing' }
  | { kind: typeof FormulaNodeKind.Cell; row: number; col: number }
  | { kind: typeof FormulaNodeKind.Range; start: [number, number]; end: [number, number] }
  | { kind: typeof FormulaNodeKind.WorkbookCell; sheetName: string; row: number; col: number }
  | {
      kind: typeof FormulaNodeKind.WorkbookRange;
      sheetName: string;
      start: [number, number];
      end: [number, number];
    }
  | { kind: typeof FormulaNodeKind.ColumnRange; startCol: number; endCol: number }
  | { kind: typeof FormulaNodeKind.RowRange; startRow: number; endRow: number }
  | FormulaReferenceArgument;
