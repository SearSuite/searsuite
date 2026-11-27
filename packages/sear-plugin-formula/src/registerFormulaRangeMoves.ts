import { type IFormulaParser, moveFormulaReferences } from '@searsuite/sear-domain-formula-engine';
import { FormulaFormatter } from '@searsuite/sear-domain-formula-engine-ts';
import { SheetRangeMoveRegistry, isPointInSheetMoveRange } from '@searsuite/sear-assembly-plugin';
import { CellType, type CellMatrixElement } from '@searsuite/sear-domain-cell-types';
import { createUpdateCellOTOperation, isUpdateCellOperation, MatrixCellUpdateIntent } from '@searsuite/sear-domain-ot';
import { SheetDataPlugin } from '@searsuite/sear-plugin-sheet-data';
import { readSheetDataMatrix } from '@searsuite/sear-domain-sheet';
import { type DataEngine } from '@searsuite/sear-domain-state';

/** Rewrites the value owner's plan and surviving formulas against one original reference space. */
export function registerFormulaRangeMoves(
  registry: SheetRangeMoveRegistry,
  parser: IFormulaParser,
  data: DataEngine,
): void {
  const formatter = new FormulaFormatter();
  registry.register({
    id: 'sheet.formula.references.rangeMove',
    plan: () => [],
    transformPlans: ({ source, destination }, plans) => {
      const move = {
        start: source.start,
        end: source.end,
        rowOffset: destination.start[0] - source.start[0],
        columnOffset: destination.start[1] - source.start[1],
      };
      const rewrite = (cell: CellMatrixElement | null): CellMatrixElement | null => {
        if (!cell || cell.type !== CellType.Formula || !cell.formula) return cell;
        const ast = parser.parse(cell.formula);
        const next = moveFormulaReferences(ast, move);
        return next === ast ? cell : { ...cell, formula: formatter.format(next) };
      };
      return plans.map((plan) => {
        if (plan.target !== SheetDataPlugin.pluginKey) return plan;
        const operations = plan.operations.map((operation) => {
          if (!isUpdateCellOperation<CellMatrixElement | null>(operation)) return operation;
          const cell = operation.uc.value ?? null;
          const next = rewrite(cell);
          return next === cell
            ? operation
            : createUpdateCellOTOperation(operation.p, next, operation.uc.prev, operation.uc.intent);
        });
        readSheetDataMatrix(data)?.forEachStored((cell, row, column) => {
          if (isPointInSheetMoveRange(source, row, column) || isPointInSheetMoveRange(destination, row, column)) return;
          const next = rewrite(cell);
          if (next !== cell)
            operations.push(createUpdateCellOTOperation([row, column], next, cell, MatrixCellUpdateIntent.Relocation));
        });
        return { ...plan, operations };
      });
    },
  });
}
