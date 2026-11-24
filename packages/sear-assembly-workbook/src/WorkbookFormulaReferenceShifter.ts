import {
  FormulaNodeKind,
  StructureChangeAxis,
  shiftStructureCoordinate,
  type FormulaAST,
  type StructureChange,
} from '@searsuite/sear-domain-formula-engine';
import { type WorkbookFormulaReference, type WorkbookSheetId } from '@searsuite/sear-domain-workbook';

/** Result of shifting workbook-qualified formula references in one AST. */
export interface WorkbookFormulaReferenceShiftResult {
  /** Shifted AST, or the original AST when no workbook reference changed. */
  readonly ast: FormulaAST;
  /** Whether the AST identity changed. */
  readonly changed: boolean;
  /** References that became invalid because the target row or column was deleted. */
  readonly brokenReferences: readonly WorkbookFormulaReference[];
}

/** Shifts workbook-qualified AST references for one structurally changed sheet. */
export class WorkbookFormulaReferenceShifter {
  /** Shifts workbook references whose stable binding points at the changed sheet. */
  public shiftReferences(input: {
    ast: FormulaAST;
    sheetBindings: ReadonlyMap<string, WorkbookSheetId>;
    changedSheetId: WorkbookSheetId;
    changes: readonly StructureChange[];
  }): WorkbookFormulaReferenceShiftResult {
    const brokenReferences: WorkbookFormulaReference[] = [];
    const ast = this.#shiftNode(input.ast, input, brokenReferences);
    return {
      ast,
      changed: ast !== input.ast,
      brokenReferences,
    };
  }

  #shiftNode(
    ast: FormulaAST,
    input: {
      sheetBindings: ReadonlyMap<string, WorkbookSheetId>;
      changedSheetId: WorkbookSheetId;
      changes: readonly StructureChange[];
    },
    brokenReferences: WorkbookFormulaReference[],
  ): FormulaAST {
    switch (ast.kind) {
      case FormulaNodeKind.WorkbookCell:
        return this.#shiftWorkbookCell(ast, input, brokenReferences);
      case FormulaNodeKind.WorkbookRange:
        return this.#shiftWorkbookRange(ast, input, brokenReferences);
      case FormulaNodeKind.Spill: {
        const reference = this.#shiftNode(ast.reference, input, brokenReferences);
        if (reference.kind !== FormulaNodeKind.Cell && reference.kind !== FormulaNodeKind.WorkbookCell) return reference;
        return reference === ast.reference ? ast : { ...ast, reference };
      }
      case FormulaNodeKind.Binary:
      case FormulaNodeKind.Intersection: {
        const left = this.#shiftNode(ast.left, input, brokenReferences);
        const right = this.#shiftNode(ast.right, input, brokenReferences);
        if (left === ast.left && right === ast.right) return ast;
        return { ...ast, left, right };
      }
      case FormulaNodeKind.Unary: {
        const operand = this.#shiftNode(ast.operand, input, brokenReferences);
        if (operand === ast.operand) return ast;
        return { ...ast, operand };
      }
      case FormulaNodeKind.Call: {
        let changed = false;
        const args = ast.args.map((arg) => {
          const shifted = this.#shiftNode(arg, input, brokenReferences);
          if (shifted !== arg) changed = true;
          return shifted;
        });
        if (!changed) return ast;
        return { ...ast, args };
      }
      case FormulaNodeKind.Invoke: {
        const callee = this.#shiftNode(ast.callee, input, brokenReferences);
        let changed = callee !== ast.callee;
        const args = ast.args.map((arg) => {
          const shifted = this.#shiftNode(arg, input, brokenReferences);
          if (shifted !== arg) changed = true;
          return shifted;
        });
        return changed ? { ...ast, callee, args } : ast;
      }
      case FormulaNodeKind.Tuple: {
        let changed = false;
        const items = ast.items.map((item) => {
          const shifted = this.#shiftNode(item, input, brokenReferences);
          if (shifted !== item) changed = true;
          return shifted;
        });
        return changed ? { ...ast, items } : ast;
      }
      default:
        return ast;
    }
  }

  #shiftWorkbookCell(
    ast: Extract<FormulaAST, { kind: typeof FormulaNodeKind.WorkbookCell }>,
    input: {
      sheetBindings: ReadonlyMap<string, WorkbookSheetId>;
      changedSheetId: WorkbookSheetId;
      changes: readonly StructureChange[];
    },
    brokenReferences: WorkbookFormulaReference[],
  ): FormulaAST {
    const sheetId = input.sheetBindings.get(ast.sheetName);
    if (sheetId !== input.changedSheetId) return ast;

    const row = this.#shiftCoordinate(ast.row, ast.absRow, input.changes, StructureChangeAxis.Row);
    const col = this.#shiftCoordinate(ast.col, ast.absCol, input.changes, StructureChangeAxis.Col);
    if (row.deleted || col.deleted) {
      brokenReferences.push({ sheetId, row: ast.row, col: ast.col });
      return { ...ast, row: -1, col: -1, absRow: false, absCol: false };
    }
    if (row.value === ast.row && col.value === ast.col) return ast;
    return { ...ast, row: row.value, col: col.value };
  }

  #shiftWorkbookRange(
    ast: Extract<FormulaAST, { kind: typeof FormulaNodeKind.WorkbookRange }>,
    input: {
      sheetBindings: ReadonlyMap<string, WorkbookSheetId>;
      changedSheetId: WorkbookSheetId;
      changes: readonly StructureChange[];
    },
    brokenReferences: WorkbookFormulaReference[],
  ): FormulaAST {
    const sheetId = input.sheetBindings.get(ast.sheetName);
    if (sheetId !== input.changedSheetId) return ast;

    const startRow = this.#shiftCoordinate(ast.start[0], ast.absStartRow, input.changes, StructureChangeAxis.Row);
    const startCol = this.#shiftCoordinate(ast.start[1], ast.absStartCol, input.changes, StructureChangeAxis.Col);
    const endRow = this.#shiftCoordinate(ast.end[0], ast.absEndRow, input.changes, StructureChangeAxis.Row);
    const endCol = this.#shiftCoordinate(ast.end[1], ast.absEndCol, input.changes, StructureChangeAxis.Col);
    if (startRow.deleted || startCol.deleted || endRow.deleted || endCol.deleted) {
      brokenReferences.push({ sheetId, start: ast.start, end: ast.end });
      return {
        ...ast,
        start: [-1, -1],
        end: [-1, -1],
        absStartRow: false,
        absStartCol: false,
        absEndRow: false,
        absEndCol: false,
      };
    }
    if (
      startRow.value === ast.start[0] &&
      startCol.value === ast.start[1] &&
      endRow.value === ast.end[0] &&
      endCol.value === ast.end[1]
    ) {
      return ast;
    }
    return {
      ...ast,
      start: [Math.min(startRow.value, endRow.value), Math.min(startCol.value, endCol.value)],
      end: [Math.max(startRow.value, endRow.value), Math.max(startCol.value, endCol.value)],
    };
  }

  #shiftCoordinate(
    coordinate: number,
    isAbsolute: boolean,
    changes: readonly StructureChange[],
    axis: StructureChangeAxis,
  ): { value: number; deleted: boolean } {
    return shiftStructureCoordinate({ coordinate, absolute: isAbsolute, changes, axis });
  }
}
