import {
  defineSheetCommand,
  defineSheetQuery,
  SheetCommandBus,
  SheetQueryRegistry,
  type SheetRangeInput,
} from '@searsuite/sear-assembly-commands';
import { createSheetCellMergeCommand } from './SheetCellMergeCommandFactory';
import {
  type SheetCellMergeActionDataSource,
  type SheetMergeAnalysis,
  type SheetMergeInput,
} from './SheetCellMergeCommandContracts';
import { analyzeMergeCells } from './SheetCellMergeOperations';

export const AnalyzeMergeCellsQuery = defineSheetQuery<SheetRangeInput, SheetMergeAnalysis | null>(
  'range.analyzeMergeCells',
);
export const MergeCellsCommand = defineSheetCommand<SheetMergeInput>('range.mergeCells');
export const UnmergeCellsCommand = defineSheetCommand<SheetRangeInput>('range.unmergeCells');
export const ToggleMergeCellsCommand = defineSheetCommand<SheetMergeInput>('range.toggleMergeCells');

/** Registers every command owned by SheetCellMergePlugin. */
export function registerSheetCellMergeCommands(
  commands: SheetCommandBus,
  dataSource: SheetCellMergeActionDataSource,
): void {
  commands.register(MergeCellsCommand, (input) =>
    createSheetCellMergeCommand(MergeCellsCommand.id, 'merge', input, dataSource),
  );
  commands.register(UnmergeCellsCommand, (input) =>
    createSheetCellMergeCommand(UnmergeCellsCommand.id, 'unmerge', input, dataSource),
  );
  commands.register(ToggleMergeCellsCommand, (input) =>
    createSheetCellMergeCommand(ToggleMergeCellsCommand.id, 'toggle', input, dataSource),
  );
}

export function registerSheetCellMergeQueries(
  queries: SheetQueryRegistry,
  dataSource: SheetCellMergeActionDataSource,
): void {
  queries.register(AnalyzeMergeCellsQuery, (input) => analyzeMergeCells(input, dataSource));
}

export {
  type SheetCellMergeActionDataSource,
  type SheetCellMergeCommandDataSource,
  type SheetCellMergeContentSource,
  type SheetMergeAnalysis,
  type SheetMergeDiscardedCell,
  type SheetMergeInput,
} from './SheetCellMergeCommandContracts';
export {
  analyzeMergeCells,
  createMergeCellsOperations,
  createUnmergeCellsOperations,
} from './SheetCellMergeOperations';
