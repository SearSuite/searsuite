import { type SheetRangeInput } from '@searsuite/sear-assembly-commands';
import { type PluginKey } from '@searsuite/sear-assembly-plugin';
import { type CellMergeMatrix } from '../../CellMergeMatrix';

export interface SheetMergeDiscardedCell {
  readonly row: number;
  readonly column: number;
  readonly value: unknown;
}

export interface SheetMergeAnalysis {
  readonly start: readonly [number, number];
  readonly end: readonly [number, number];
  readonly retainedCell: SheetMergeDiscardedCell | null;
  readonly discardedCells: readonly SheetMergeDiscardedCell[];
}

export interface SheetMergeInput extends SheetRangeInput {
  readonly confirmation?: SheetMergeAnalysis;
}

export interface SheetCellMergeCommandDataSource {
  readonly target: PluginKey;
  readMatrix(): CellMergeMatrix;
}

export interface SheetCellMergeContentSource {
  readonly target: PluginKey;
  readCell(row: number, column: number): unknown | null;
}

export interface SheetCellMergeActionDataSource extends SheetCellMergeCommandDataSource {
  readonly cellContent: SheetCellMergeContentSource;
}
