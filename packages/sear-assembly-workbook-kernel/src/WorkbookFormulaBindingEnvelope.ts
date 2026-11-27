import { FormulaNodeKind, type Dependency } from '@searsuite/sear-domain-formula-engine';
import { FormulaParser } from '@searsuite/sear-domain-formula-engine-ts';
import { CellType } from '@searsuite/sear-domain-cell-types';
import type { SheetDocumentState } from '@searsuite/sear-assembly-sheet-state';
import type { WorkbookDocumentState } from '@searsuite/sear-domain-workbook';
import type { SearFormulaBindingFile } from '@searsuite/sear-plugin-export';

/** Runtime metadata holding bindings restored from a durable workbook file. */
export const WorkbookFormulaBindingsMetadataKey = 'searsuite.workbook.formulaBindings';

/** Captures workbook-qualified targets using stable ids. */
export function collectWorkbookFormulaBindings(
  state: WorkbookDocumentState<SheetDocumentState>,
): SearFormulaBindingFile[] {
  const parser = new FormulaParser();
  const saved = state.metadata?.[WorkbookFormulaBindingsMetadataKey] as readonly SearFormulaBindingFile[] | undefined;
  const entries: SearFormulaBindingFile[] = [];
  state.sheets.forEach((sheet) =>
    state.sheetStates[sheet.id]?.sheetData.forEachStored((cell, row, col) => {
      if (cell.type !== CellType.Formula || typeof cell.formula !== 'string') return;
      let dependencies: Dependency[];
      try {
        dependencies = parser.extractDependencies(parser.parse(cell.formula));
      } catch {
        return;
      }
      const prior = saved?.find(
        (entry) =>
          entry.sheetId === sheet.id && entry.row === row && entry.col === col && entry.formula === cell.formula,
      );
      const references = new Map<string, string>();
      dependencies.forEach((dependency) => {
        if (dependency.kind !== FormulaNodeKind.WorkbookCell && dependency.kind !== FormulaNodeKind.WorkbookRange)
          return;
        const sheetId =
          prior?.references.find((reference) => reference.sheetName === dependency.sheetName)?.sheetId ??
          state.sheets.find((candidate) => candidate.name.toUpperCase() === dependency.sheetName.toUpperCase())?.id;
        if (sheetId) references.set(dependency.sheetName, sheetId);
      });
      if (references.size > 0) {
        entries.push({
          sheetId: sheet.id,
          row,
          col,
          formula: cell.formula,
          references: [...references].map(([sheetName, sheetId]) => ({ sheetName, sheetId })),
        });
      }
    }),
  );
  return entries;
}

/** Reads valid persisted bindings for one unchanged formula source. */
export function readWorkbookFormulaBindings(
  state: WorkbookDocumentState<SheetDocumentState>,
  cell: { sheetId: string; row: number; col: number },
  formula: string,
): ReadonlyMap<string, string> {
  const entries = state.metadata?.[WorkbookFormulaBindingsMetadataKey] as readonly SearFormulaBindingFile[] | undefined;
  const entry = entries?.find(
    (candidate) =>
      candidate.sheetId === cell.sheetId &&
      candidate.row === cell.row &&
      candidate.col === cell.col &&
      candidate.formula === formula,
  );
  return new Map(entry?.references.map((reference) => [reference.sheetName, reference.sheetId]) ?? []);
}
