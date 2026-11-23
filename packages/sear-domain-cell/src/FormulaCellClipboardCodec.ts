import { FormulaNodeKind, type FormulaAST } from '@searsuite/sear-domain-formula-engine';
import { FormulaFormatter, FormulaParser } from '@searsuite/sear-domain-formula-engine-ts';
import { CellType, type CellClipboardCodecDefinition } from '@searsuite/sear-domain-cell-types';

/** Clipboard behavior for formula source text and relative references. */
export function createFormulaCellClipboardCodec(): CellClipboardCodecDefinition {
  return {
    cellType: CellType.Formula,
    encode: (cell) => ({
      formula: cell.formula,
      ...(cell.value !== void 0 ? { value: cloneValue(cell.value) } : {}),
    }),
    decode: (data) => {
      if (!data || typeof data !== 'object') return null;
      const stored = data as { formula?: unknown; value?: unknown };
      return typeof stored.formula === 'string'
        ? {
            type: CellType.Formula,
            formula: stored.formula,
            ...(stored.value !== void 0 ? { value: cloneValue(stored.value) } : {}),
          }
        : null;
    },
    toPlainText: (cell) => cell.formula ?? '',
    rebase: (cell, context) => {
      if (!cell.formula || (context.rowDelta === 0 && context.columnDelta === 0)) return cell;
      try {
        const ast = parser.parse(cell.formula);
        return { ...cell, formula: formatter.format(shiftFormulaAst(ast, context.rowDelta, context.columnDelta)) };
      } catch {
        return cell;
      }
    },
  };
}

const parser = new FormulaParser();
const formatter = new FormulaFormatter();

function shiftFormulaAst(ast: FormulaAST, rowDelta: number, columnDelta: number): FormulaAST {
  switch (ast.kind) {
    case FormulaNodeKind.Cell:
    case FormulaNodeKind.WorkbookCell:
      return {
        ...ast,
        row: ast.absRow ? ast.row : ast.row + rowDelta,
        col: ast.absCol ? ast.col : ast.col + columnDelta,
      };
    case FormulaNodeKind.Range:
    case FormulaNodeKind.WorkbookRange:
      return {
        ...ast,
        start: [
          ast.absStartRow ? ast.start[0] : ast.start[0] + rowDelta,
          ast.absStartCol ? ast.start[1] : ast.start[1] + columnDelta,
        ],
        end: [
          ast.absEndRow ? ast.end[0] : ast.end[0] + rowDelta,
          ast.absEndCol ? ast.end[1] : ast.end[1] + columnDelta,
        ],
      };
    case FormulaNodeKind.Call:
      return { ...ast, args: ast.args.map((arg) => shiftFormulaAst(arg, rowDelta, columnDelta)) };
    case FormulaNodeKind.Invoke:
      return {
        ...ast,
        callee: shiftFormulaAst(ast.callee, rowDelta, columnDelta),
        args: ast.args.map((arg) => shiftFormulaAst(arg, rowDelta, columnDelta)),
      };
    case FormulaNodeKind.Tuple:
      return { ...ast, items: ast.items.map((item) => shiftFormulaAst(item, rowDelta, columnDelta)) };
    case FormulaNodeKind.Binary:
    case FormulaNodeKind.Intersection:
      return {
        ...ast,
        left: shiftFormulaAst(ast.left, rowDelta, columnDelta),
        right: shiftFormulaAst(ast.right, rowDelta, columnDelta),
      };
    case FormulaNodeKind.Unary:
      return { ...ast, operand: shiftFormulaAst(ast.operand, rowDelta, columnDelta) };
    default:
      return ast;
  }
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)]));
}
