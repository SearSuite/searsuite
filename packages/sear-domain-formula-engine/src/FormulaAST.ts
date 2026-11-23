import { type BinaryOp } from './BinaryOp';
import { type FormulaErrorCode } from './FormulaErrorCode';
import { FormulaNodeKind } from './FormulaNodeKind';
import { type UnaryOp } from './UnaryOp';

/** Serializable formula abstract syntax tree. */
export type FormulaAST =
  | { kind: typeof FormulaNodeKind.Number; value: number; rawLiteral?: string }
  | { kind: typeof FormulaNodeKind.String; value: string }
  | { kind: typeof FormulaNodeKind.Boolean; value: boolean }
  | { kind: typeof FormulaNodeKind.Error; code: FormulaErrorCode }
  | { kind: typeof FormulaNodeKind.Name; name: string }
  | { kind: typeof FormulaNodeKind.Tuple; items: FormulaAST[] }
  | { kind: typeof FormulaNodeKind.Intersection; left: FormulaAST; right: FormulaAST }
  | { kind: typeof FormulaNodeKind.Array; rows: FormulaAST[][] }
  | { kind: typeof FormulaNodeKind.Missing }
  | { kind: typeof FormulaNodeKind.Cell; row: number; col: number; absRow: boolean; absCol: boolean }
  | {
      kind: typeof FormulaNodeKind.Spill;
      reference: Extract<FormulaAST, { kind: typeof FormulaNodeKind.Cell | typeof FormulaNodeKind.WorkbookCell }>;
    }
  | {
      kind: typeof FormulaNodeKind.Range;
      start: [number, number];
      end: [number, number];
      absStartRow: boolean;
      absStartCol: boolean;
      absEndRow: boolean;
      absEndCol: boolean;
    }
  | {
      kind: typeof FormulaNodeKind.WorkbookCell;
      sheetName: string;
      row: number;
      col: number;
      absRow: boolean;
      absCol: boolean;
    }
  | {
      kind: typeof FormulaNodeKind.WorkbookRange;
      sheetName: string;
      start: [number, number];
      end: [number, number];
      absStartRow: boolean;
      absStartCol: boolean;
      absEndRow: boolean;
      absEndCol: boolean;
    }
  | {
      kind: typeof FormulaNodeKind.ColumnRange;
      startCol: number;
      endCol: number;
      absStartCol: boolean;
      absEndCol: boolean;
    }
  | {
      kind: typeof FormulaNodeKind.RowRange;
      startRow: number;
      endRow: number;
      absStartRow: boolean;
      absEndRow: boolean;
    }
  | { kind: typeof FormulaNodeKind.Call; name: string; args: FormulaAST[] }
  | { kind: typeof FormulaNodeKind.Invoke; callee: FormulaAST; args: FormulaAST[] }
  | { kind: typeof FormulaNodeKind.Binary; op: BinaryOp; left: FormulaAST; right: FormulaAST }
  | { kind: typeof FormulaNodeKind.Unary; op: UnaryOp; operand: FormulaAST };
