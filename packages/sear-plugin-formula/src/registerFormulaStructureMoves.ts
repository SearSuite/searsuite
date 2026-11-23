import {
  type IFormulaParser,
  matrixOperationsToStructureChanges,
  reorderFormulaReferences,
  shiftStructureCoordinate,
  StructureChangeAxis,
  type StructureMoveChange,
} from '@searsuite/sear-domain-formula-engine';
import { FormulaFormatter } from '@searsuite/sear-domain-formula-engine-ts';
import { type SheetStructureMoveRegistry } from '@searsuite/sear-assembly-plugin';
import { CellType } from '@searsuite/sear-domain-cell-types';
import { createUpdateCellOTOperation, MatrixCellUpdateIntent, type MatrixOTOperation } from '@searsuite/sear-domain-ot';
import { readSheetDataMatrix, SheetDataPlugin, type DataEngine } from '@searsuite/sear-render-engine';

/** Persists formula text changes after the original-state structure permutation in the same transaction. */
export function registerFormulaStructureMoves(
  registry: SheetStructureMoveRegistry,
  parser: IFormulaParser,
  data: DataEngine,
): void {
  const formatter = new FormulaFormatter();
  registry.register({
    id: 'sheet.formula.references.structureMove',
    transformOperations: ({ target, operations }) => {
      if (target !== SheetDataPlugin.pluginKey) return operations;
      const changes = matrixOperationsToStructureChanges(operations as MatrixOTOperation<unknown>[]);
      if (changes.length === 0) return operations;
      const next = [...operations];
      readSheetDataMatrix(data)?.forEachStored((cell, row, col) => {
        if (cell.type !== CellType.Formula || !cell.formula) return;
        const shiftedRow = shiftStructureCoordinate({ coordinate: row, axis: StructureChangeAxis.Row, changes });
        const shiftedCol = shiftStructureCoordinate({ coordinate: col, axis: StructureChangeAxis.Col, changes });
        if (shiftedRow.deleted || shiftedCol.deleted) return;
        // Relocation updates also reset runtime ASTs when a structural edit leaves source text unchanged.
        let formula = cell.formula;
        try {
          const ast = parser.parse(formula);
          const rewritten = changes.reduce(
            (current, change) =>
              'fromIndex' in change
                ? reorderFormulaReferences(current, [change as StructureMoveChange])
                : parser.shiftReferences(current, [change]),
            ast,
          );
          if (rewritten !== ast) formula = formatter.format(rewritten);
        } catch {
          formula = cell.formula;
        }
        const position = [shiftedRow.value, shiftedCol.value];
        next.push(createUpdateCellOTOperation(position, { ...cell, formula }, cell, MatrixCellUpdateIntent.Relocation));
      });
      return next;
    },
  });
}
