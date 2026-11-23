import { SheetRangeMoveRegistry, SheetRangeReorderRegistry, isPointInSheetMoveRange } from '@searsuite/sear-assembly-plugin';
import { createMatrixRangeMoveOperations, hasMatrixRangeMoveConflict } from '@searsuite/sear-domain-matrix';
import { SearError } from '@searsuite/sear-foundation-error';
import { SheetMergeRangeMoveError } from '../../SheetMergeRangeMoveError';
import { transformMergedRangesByMoves } from '../../transformMergedRangesByMoves';
import { SheetCommandBus, SheetQueryRegistry } from '@searsuite/sear-assembly-commands';
import { Plugin, PluginKey, type PluginDocumentStateContribution } from '@searsuite/sear-assembly-plugin';
import { deserializeSparseMatrix, serializeSparseMatrix } from '@searsuite/sear-domain-matrix';
import {
  isMatrixStructureOperation,
  isUpdateCellOperation,
  MatrixOT,
  MatrixOTActionName,
  createDeleteColOTOperation,
  createDeleteRowOTOperation,
  createInsertColOTOperation,
  createInsertRowOTOperation,
  createMoveColOTOperation,
  createMoveRowOTOperation,
  MatrixTransactionOT,
  MatrixTransactionOTRelation,
  RectOT,
  type MatrixOTOperation,
  type MatrixStructureOTOperation,
  type Operation,
} from '@searsuite/sear-domain-ot';
import { Transaction } from '@searsuite/sear-domain-transaction';
import { Injectable } from '@searsuite/sear-foundation-di';
import { Rect } from '@searsuite/sear-foundation-rect';
import { Node } from '@searsuite/sear-render-node';
import { CellProperties } from '@searsuite/sear-render-registry';
import { SheetDataFieldNamespace } from '@searsuite/sear-render-engine';
import { CellMergeMatrix, type SheetCellMerge } from '../../CellMergeMatrix';
import {
  registerSheetCellMergeCommands,
  registerSheetCellMergeQueries,
  type SheetCellMergeContentSource,
} from './SheetCellMergeCommands';
import { SheetCellMergeFieldKey } from './SheetCellMergeDataField';

export interface SheetCellMergePluginState {
  cellMerges: CellMergeMatrix;
}

const pluginKey = new PluginKey('SheetCellMergePlugin');

/** Owns sparse merged-cell state, commands, structure projection, collaboration, and export. */
@Injectable()
export class SheetCellMergePlugin extends Plugin<unknown, CellProperties, SheetCellMergePluginState> {
  public override readonly warnOnDuplicateDepth = false;
  public override readonly transactionOT = {
    ownerId: 'sheet.cellMerge',
    definition: MatrixTransactionOT,
    relations: [MatrixTransactionOTRelation],
    collaborative: true,
  };

  public static readonly symbol = Symbol.for('SheetCellMergePlugin');
  public static readonly pluginKey = pluginKey;
  public static readonly documentState: PluginDocumentStateContribution<
    SheetCellMergePluginState,
    SheetCellMergePluginState
  > = {
    key: 'sheet.cellMerges',
    capture: (state) => ({ cellMerges: state.cellMerges.clone() }),
    codec: {
      key: 'sheet.cellMerges',
      serialize: (state) => serializeSparseMatrix(state.cellMerges),
      deserialize: (payload, path) => ({
        cellMerges: deserializeSparseMatrix<SheetCellMerge | null, CellMergeMatrix>(payload, CellMergeMatrix, path),
      }),
    },
  };

  public override readonly documentState = SheetCellMergePlugin.documentState;
  public override interestedIn = [
    MatrixOTActionName.UpdateCell,
    MatrixOTActionName.RowInsert,
    MatrixOTActionName.RowDelete,
    MatrixOTActionName.RowMove,
    MatrixOTActionName.ColInsert,
    MatrixOTActionName.ColDelete,
    MatrixOTActionName.ColMove,
  ];

  public constructor(state: SheetCellMergePluginState, private readonly cellContent?: SheetCellMergeContentSource) {
    super({ key: pluginKey, state });
  }

  public registerCommands(commands: SheetCommandBus): void {
    if (!this.cellContent)
      throw new SearError('SheetCellMergePlugin requires a cell content reader to register commands.');
    const plugin = this;
    registerSheetCellMergeCommands(commands, {
      target: this.key,
      readMatrix: () => plugin.getState().cellMerges,
      cellContent: this.cellContent,
    });
  }

  public registerQueries(queries: SheetQueryRegistry): void {
    if (!this.cellContent)
      throw new SearError('SheetCellMergePlugin requires a cell content reader to register queries.');
    const plugin = this;
    registerSheetCellMergeQueries(queries, {
      target: this.key,
      readMatrix: () => plugin.getState().cellMerges,
      cellContent: this.cellContent,
    });
  }

  public isMergedCell(row: number, column: number): Rect | null {
    return this.getState().cellMerges.findRange(row, column);
  }

  /** Moves complete merged ranges and rejects moves that split a merge. */
  public registerRangeMoves(registry: SheetRangeMoveRegistry): void {
    registry.register({
      id: 'sheet.cellMerge.rangeMove',
      validate: (context) => {
        const { source, destination } = context;
        for (const merge of this.getState().cellMerges.getRanges()) {
          const start = merge.getPoint(0);
          const end = merge.getPoint(1);
          for (const range of [source, destination]) {
            const intersects =
              start[0] <= range.end[0] &&
              end[0] >= range.start[0] &&
              start[1] <= range.end[1] &&
              end[1] >= range.start[1];
            if (intersects && !(isPointInSheetMoveRange(range, ...start) && isPointInSheetMoveRange(range, ...end))) {
              // A merge wholly owned by the source is removed before the destination is written.
              if (
                range === destination &&
                isPointInSheetMoveRange(source, ...start) &&
                isPointInSheetMoveRange(source, ...end)
              )
                continue;
              throw new SheetMergeRangeMoveError(context);
            }
          }
        }
      },
      hasConflict: ({ source, destination }) =>
        hasMatrixRangeMoveConflict(this.getState().cellMerges, source, destination),
      plan: ({ source, destination }) => [
        {
          target: this.key,
          operations: createMatrixRangeMoveOperations(this.getState().cellMerges, source, destination, (value) => ({
            endRow: value.endRow + destination.start[0] - source.start[0],
            endColumn: value.endColumn + destination.start[1] - source.start[1],
          })),
        },
      ],
    });
  }

  public registerRangeReorders(registry: SheetRangeReorderRegistry): void {
    registry.register({
      id: 'sheet.cellMerge.rangeReorder',
      validate: ({ range }) => {
        for (const merge of this.getState().cellMerges.getRanges()) {
          const start = merge.getPoint(0);
          const end = merge.getPoint(1);
          if (start[0] <= range.end[0] && end[0] >= range.start[0] &&
              start[1] <= range.end[1] && end[1] >= range.start[1]) {
            throw new SearError('Cannot sort a range intersecting merged cells.', { range, merge: [start, end] });
          }
        }
      },
      plan: () => [],
    });
  }

  public registerState() {
    return {
      key: this.key,
      state: this.getState(),
      dataEngine: {
        dataView: [
          {
            viewKey: SheetDataFieldNamespace,
            fieldKey: SheetCellMergeFieldKey,
            select: (state: SheetCellMergePluginState) => state.cellMerges,
          },
        ],
      },
    };
  }

  public apply(pluginState: SheetCellMergePluginState, transaction: Transaction): SheetCellMergePluginState | null {
    let changed = false;
    const moves = transaction.operations
      .filter(isMatrixStructureOperation)
      .filter((operation) => MatrixOTActionName.RowMove in operation || MatrixOTActionName.ColMove in operation);
    const batchedMoves =
      moves.length > 0 && moves.length === transaction.operations.filter(isMatrixStructureOperation).length;
    if (batchedMoves) {
      const ranges = pluginState.cellMerges.getRanges();
      transformMergedRangesByMoves(ranges, moves);
      MatrixOT.apply(
        pluginState.cellMerges,
        moves.map((operation) => projectStructureOperation(pluginState.cellMerges, operation)),
      );
      pluginState.cellMerges.replaceRanges(ranges);
      changed = true;
    }
    transaction.operations.forEach((operation) => {
      if (isUpdateCellOperation<SheetCellMerge | null>(operation)) {
        if (transaction.pluginKey !== pluginKey) return;
        MatrixOT.apply(pluginState.cellMerges, [operation]);
        changed = true;
        return;
      }
      if (!isMatrixStructureOperation(operation)) return;
      if (batchedMoves) return;
      const ranges = pluginState.cellMerges.getRanges();
      applyStructureToRanges(ranges, operation);
      MatrixOT.apply(pluginState.cellMerges, [projectStructureOperation(pluginState.cellMerges, operation)]);
      pluginState.cellMerges.replaceRanges(ranges);
      changed = true;
    });
    return changed ? pluginState : null;
  }

  public getPluginConfig(): null {
    return null;
  }

  public render(): Node<CellProperties>[] {
    return [];
  }
}

function applyStructureToRanges(ranges: Rect[], operation: MatrixStructureOTOperation<unknown>): void {
  ranges.forEach((range) => {
    const start = range.getPoint(0);
    const end = range.getPoint(1);
    if (MatrixOTActionName.RowInsert in operation && operation.ri !== void 0 &&
      operation.p[0] === end[0] && start[0] < end[0]) {
      end[0] += 1;
    } else if (MatrixOTActionName.ColInsert in operation && operation.ci !== void 0 &&
      operation.p[0] === end[1] && start[1] < end[1]) {
      end[1] += 1;
    } else {
      RectOT.apply(range, [operation]);
    }
  });
  for (let index = ranges.length - 1; index >= 0; index -= 1) {
    const range = ranges[index];
    const start = range?.getPoint(0);
    const end = range?.getPoint(1);
    if (
      range === undefined ||
      start === undefined ||
      end === undefined ||
      start[0] > end[0] ||
      start[1] > end[1] ||
      (start[0] === end[0] && start[1] === end[1])
    ) {
      ranges.splice(index, 1);
    }
  }
}

function projectStructureOperation(
  matrix: CellMergeMatrix,
  operation: Operation,
): MatrixOTOperation<SheetCellMerge | null> {
  if (MatrixOTActionName.RowInsert in operation && operation.ri !== void 0) {
    return createInsertRowOTOperation(operation.p, Array(matrix.shape[1]).fill(null));
  }
  if (MatrixOTActionName.RowDelete in operation && operation.rd !== void 0) {
    return createDeleteRowOTOperation(operation.p, readRow(matrix, operation.p[0]));
  }
  if (MatrixOTActionName.RowMove in operation && operation.rm !== void 0) {
    return createMoveRowOTOperation(operation.p, operation.rm);
  }
  if (MatrixOTActionName.ColInsert in operation && operation.ci !== void 0) {
    return createInsertColOTOperation(operation.p, Array(matrix.shape[0]).fill(null));
  }
  if (MatrixOTActionName.ColDelete in operation && operation.cd !== void 0) {
    return createDeleteColOTOperation(operation.p, readColumn(matrix, operation.p[0]));
  }
  if (MatrixOTActionName.ColMove in operation && operation.cm !== void 0) {
    return createMoveColOTOperation(operation.p, operation.cm);
  }
  throw new SearError('Unsupported Sheet cell merge structure operation.');
}

function readRow(matrix: CellMergeMatrix, row: number): (SheetCellMerge | null)[] {
  return Array.from({ length: matrix.shape[1] }, (_, column) => matrix.getItem(row, column));
}

function readColumn(matrix: CellMergeMatrix, column: number): (SheetCellMerge | null)[] {
  return Array.from({ length: matrix.shape[0] }, (_, row) => matrix.getItem(row, column));
}
