import {
  FormulaErrorCode,
  FormulaNodeKind,
  mapFormulaReferenceNodes,
  type IFormulaParser,
} from '@searsuite/sear-domain-formula-engine';
import { FormulaFormatter } from '@searsuite/sear-domain-formula-engine-ts';
import { type SheetRangeReorderRegistry } from '@searsuite/sear-assembly-plugin';
import { CellType, type CellMatrixElement } from '@searsuite/sear-domain-cell-types';
import { createUpdateCellOTOperation, isUpdateCellOperation, type Operation } from '@searsuite/sear-domain-ot';
import { SheetDataPlugin } from '@searsuite/sear-plugin-sheet-data';
import { readSheetDataMatrix } from '@searsuite/sear-domain-sheet';
import { type DataEngine } from '@searsuite/sear-domain-state';
import { SearError } from '@searsuite/sear-foundation-error';
import { type FormulaResultStore } from './FormulaResultStore';

/** Rebases relative references in formulas that move with sorted rows. */
export function registerFormulaRangeReorders(
  registry: SheetRangeReorderRegistry,
  parser: IFormulaParser,
  data: DataEngine,
  results: FormulaResultStore,
): void {
  const formatter = new FormulaFormatter();
  registry.register({
    id: 'sheet.formula.references.rangeReorder',
    validate: ({ range }) => {
      let intersectsSpill = false;
      results.forEachSpillInRange(...range.start, ...range.end, () => {
        intersectsSpill = true;
      });
      if (!intersectsSpill) {
        readSheetDataMatrix(data)?.forEachStoredInRange(...range.start, ...range.end, (cell, row, column) => {
          if (cell?.type === CellType.Formula && Array.isArray(results.getAt(row, column))) intersectsSpill = true;
        });
      }
      if (intersectsSpill) {
        throw new SearError('The sort range contains spilled array results. Edit or clear the anchor formula first.');
      }
    },
    plan: () => [],
    transformPlans: ({ range, destinationOf }, plans) => {
      const rewrites = new Map<string, CellMatrixElement>();
      readSheetDataMatrix(data)?.forEachStoredInRange(...range.start, ...range.end, (cell, row, column) => {
        if (cell?.type !== CellType.Formula || !cell.formula) return;
        const destination = destinationOf(row);
        const delta = destination - row;
        if (!delta) return;
        const ast = parser.parse(cell.formula);
        const shifted = mapFormulaReferenceNodes(ast, (node) => {
          switch (node.kind) {
            case FormulaNodeKind.Cell:
            case FormulaNodeKind.WorkbookCell: {
              const next = node.absRow ? node.row : node.row + delta;
              if (next < 0) return { kind: FormulaNodeKind.Error, code: FormulaErrorCode.Reference };
              return next === node.row ? node : { ...node, row: next };
            }
            case FormulaNodeKind.Range:
            case FormulaNodeKind.WorkbookRange: {
              const start = node.absStartRow ? node.start[0] : node.start[0] + delta;
              const end = node.absEndRow ? node.end[0] : node.end[0] + delta;
              if (start < 0 || end < 0) return { kind: FormulaNodeKind.Error, code: FormulaErrorCode.Reference };
              return start === node.start[0] && end === node.end[0]
                ? node
                : {
                    ...node,
                    start: [start, node.start[1]],
                    end: [end, node.end[1]],
                  };
            }
            case FormulaNodeKind.RowRange: {
              const start = node.absStartRow ? node.startRow : node.startRow + delta;
              const end = node.absEndRow ? node.endRow : node.endRow + delta;
              if (start < 0 || end < 0) return { kind: FormulaNodeKind.Error, code: FormulaErrorCode.Reference };
              return start === node.startRow && end === node.endRow ? node : { ...node, startRow: start, endRow: end };
            }
            default:
              return node;
          }
        });
        if (shifted !== ast) rewrites.set(`${destination}:${column}`, { ...cell, formula: formatter.format(shifted) });
      });
      if (!rewrites.size) return plans;
      return plans.map((plan) => {
        if (plan.target !== SheetDataPlugin.pluginKey) return plan;
        const operations: Operation[] = plan.operations.map((operation) => {
          if (!isUpdateCellOperation<CellMatrixElement | null>(operation)) return operation;
          const cell = rewrites.get(`${operation.p[0]}:${operation.p[1]}`);
          return cell
            ? createUpdateCellOTOperation(operation.p, cell, operation.uc.prev, operation.uc.intent)
            : operation;
        });
        return { ...plan, operations };
      });
    },
  });
}
