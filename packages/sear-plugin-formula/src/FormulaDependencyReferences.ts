import { FormulaNodeKind, type CellKey, type Dependency } from '@searsuite/sear-domain-formula-engine';
import { fromCellKey, toCellRef } from '@searsuite/sear-domain-formula-engine-ts';
import type { FormulaDependencyCellRef, FormulaDependencyReference } from './FormulaStatusCommands';

export function toFormulaDependencyCellRef(row: number, col: number): FormulaDependencyCellRef {
  return { row, col, ref: toCellRef(row, col) };
}

export function toFormulaDependencyCellRefFromKey(key: CellKey): FormulaDependencyCellRef {
  const [row, col] = fromCellKey(key);
  return toFormulaDependencyCellRef(row, col);
}

export function toFormulaDependencyReference(dependency: Dependency): FormulaDependencyReference {
  switch (dependency.kind) {
    case FormulaNodeKind.Cell:
      return { kind: FormulaNodeKind.Cell, ...toFormulaDependencyCellRef(dependency.row, dependency.col) };
    case FormulaNodeKind.Range: {
      const start = toFormulaDependencyCellRef(dependency.start[0], dependency.start[1]);
      const end = toFormulaDependencyCellRef(dependency.end[0], dependency.end[1]);
      return { kind: FormulaNodeKind.Range, start, end, ref: `${start.ref}:${end.ref}` };
    }
    case FormulaNodeKind.WorkbookCell:
      return { kind: FormulaNodeKind.WorkbookCell, sheetName: dependency.sheetName, ...toFormulaDependencyCellRef(dependency.row, dependency.col), ref: `${quoteSheetNameForFormula(dependency.sheetName)}!${toCellRef(dependency.row, dependency.col)}` };
    case FormulaNodeKind.WorkbookRange: {
      const start = toFormulaDependencyCellRef(dependency.start[0], dependency.start[1]);
      const end = toFormulaDependencyCellRef(dependency.end[0], dependency.end[1]);
      return { kind: FormulaNodeKind.WorkbookRange, sheetName: dependency.sheetName, start, end, ref: `${quoteSheetNameForFormula(dependency.sheetName)}!${start.ref}:${end.ref}` };
    }
    case FormulaNodeKind.ColumnRange:
      return { kind: FormulaNodeKind.ColumnRange, startCol: dependency.startCol, endCol: dependency.endCol, ref: `${toCellRef(0, dependency.startCol).replace(/\d+$/, '')}:${toCellRef(0, dependency.endCol).replace(/\d+$/, '')}` };
    case FormulaNodeKind.RowRange:
      return { kind: FormulaNodeKind.RowRange, startRow: dependency.startRow, endRow: dependency.endRow, ref: `${dependency.startRow + 1}:${dependency.endRow + 1}` };
  }
}

function quoteSheetNameForFormula(sheetName: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(sheetName)) return sheetName;
  return `'${sheetName.replace(/'/g, "''")}'`;
}
