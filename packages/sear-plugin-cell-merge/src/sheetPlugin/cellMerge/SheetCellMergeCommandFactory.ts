import {
  createSheetTransaction,
  PipelineExecutionCommand,
  TransactionPipelineCommand,
} from '@searsuite/sear-assembly-commands';
import { Pipeline } from '@searsuite/sear-assembly-plugin';
import { createUpdateCellOTOperation, type UpdateCellOTOperation } from '@searsuite/sear-domain-ot';
import { deepEqual } from '@searsuite/sear-foundation-utils';
import {
  type SheetCellMergeActionDataSource,
  type SheetMergeAnalysis,
  type SheetMergeDiscardedCell,
  type SheetMergeInput,
} from './SheetCellMergeCommandContracts';
import { SheetCellMergeConfirmationError } from './SheetCellMergeConfirmationError';
import {
  analyzeMergeCells,
  createMergeCellsOperations,
  createUnmergeCellsOperations,
  normalizeSheetMergeRange,
  sameSheetMergePoint,
  sameSheetMergeRange,
} from './SheetCellMergeOperations';

export function createSheetCellMergeCommand(
  id: string,
  mode: 'merge' | 'unmerge' | 'toggle',
  input: SheetMergeInput,
  dataSource: SheetCellMergeActionDataSource,
): TransactionPipelineCommand | PipelineExecutionCommand {
  const matrix = dataSource.readMatrix();
  const target = normalizeSheetMergeRange(input, matrix.shape);
  const existing = matrix.findRange(target.start[0], target.start[1]);
  const shouldUnmerge =
    mode === 'unmerge' || (mode === 'toggle' && existing !== null && sameSheetMergeRange(target, existing));
  if (shouldUnmerge) {
    return new TransactionPipelineCommand(
      id,
      createSheetTransaction(dataSource.target, createUnmergeCellsOperations(input, dataSource)),
    );
  }
  const operations = createMergeCellsOperations(input, dataSource);
  if (operations.length === 0) return new TransactionPipelineCommand(id, createSheetTransaction(dataSource.target, []));
  const analysis = analyzeMergeCells(input, dataSource);
  if (!analysis) return new TransactionPipelineCommand(id, createSheetTransaction(dataSource.target, operations));
  const discarded = analysis.discardedCells;
  if (discarded.length > 0 && !input.confirmation) throw new SheetCellMergeConfirmationError('required');
  if (input.confirmation && !sameAnalysis(analysis, input.confirmation)) {
    throw new SheetCellMergeConfirmationError('changed');
  }
  const retained = analysis.retainedCell;
  const moveRetained = retained !== null && !sameSheetMergePoint([retained.row, retained.column], analysis.start);
  if (discarded.length === 0 && !moveRetained)
    return new TransactionPipelineCommand(id, createSheetTransaction(dataSource.target, operations));

  const pipeline = new Pipeline(id);
  const cellsToClear = moveRetained && retained ? [retained, ...discarded] : discarded;
  const contentOperations: UpdateCellOTOperation<unknown>[] = cellsToClear.map(({ row, column, value }) =>
    createUpdateCellOTOperation([row, column], null, value),
  );
  if (moveRetained && retained) {
    contentOperations.push(createUpdateCellOTOperation(analysis.start, retained.value, null));
  }
  pipeline.addTransaction(
    'clear-merged-cell-contents',
    createSheetTransaction(dataSource.cellContent.target, contentOperations),
  );
  pipeline.addTransaction('merge-cells', createSheetTransaction(dataSource.target, operations));
  return new PipelineExecutionCommand(id, pipeline);
}

function sameAnalysis(current: SheetMergeAnalysis, expected: SheetMergeAnalysis): boolean {
  return (
    sameSheetMergePoint(current.start, expected.start) &&
    sameSheetMergePoint(current.end, expected.end) &&
    sameOccupiedCell(current.retainedCell, expected.retainedCell) &&
    current.discardedCells.length === expected.discardedCells.length &&
    current.discardedCells.every((cell, index) => {
      const previous = expected.discardedCells[index];
      return previous !== undefined && sameOccupiedCell(cell, previous);
    })
  );
}

function sameOccupiedCell(current: SheetMergeDiscardedCell | null, expected: SheetMergeDiscardedCell | null): boolean {
  if (current === null || expected === null) return current === expected;
  return current.row === expected.row && current.column === expected.column && deepEqual(current.value, expected.value);
}
