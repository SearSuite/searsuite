import { FormulaNodeKind } from './FormulaNodeKind';

/** Formula dependency preserving cell and range reference semantics. */
export type Dependency =
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
  | { kind: typeof FormulaNodeKind.RowRange; startRow: number; endRow: number };
