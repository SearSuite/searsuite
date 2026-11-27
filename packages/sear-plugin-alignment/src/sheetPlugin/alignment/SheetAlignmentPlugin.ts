import { type SheetCellStyleRegistry, type SheetCellStyleDefaults } from '@searsuite/sear-domain-cell-types';
import {
  createMatrixFormatTransfer,
  type SheetFormatRange,
  type SheetFormatTransferPlan,
  type SheetFormatTransferRegistry,
} from '@searsuite/sear-assembly-plugin';
import { SheetRangeMoveRegistry, SheetRangeReorderRegistry } from '@searsuite/sear-assembly-plugin';
import {
  createMatrixRangeMoveOperations,
  createMatrixRangeReorderOperations,
  hasMatrixRangeMoveConflict,
} from '@searsuite/sear-domain-matrix';
import { SheetDataPlugin } from '@searsuite/sear-plugin-sheet-data';
import { MatrixCellUpdateIntent } from '@searsuite/sear-domain-ot';
import {
  MatrixOT,
  MatrixOTActionName,
  MatrixTransactionOT,
  MatrixTransactionOTRelation,
  createDeleteColOTOperation,
  createDeleteRowOTOperation,
  createInsertColOTOperation,
  createInsertRowOTOperation,
  createMoveColOTOperation,
  createMoveRowOTOperation,
  createUpdateCellOTOperation,
  isMatrixStructureOperation,
  isUpdateCellOperation,
  type MatrixOTOperation,
  type Operation,
} from '@searsuite/sear-domain-ot';
import { Plugin, PluginKey, type PluginDocumentStateContribution } from '@searsuite/sear-assembly-plugin';
import { deserializeSparseMatrix, serializeSparseMatrix } from '@searsuite/sear-domain-matrix';
import { Injectable } from '@searsuite/sear-foundation-di';

import { Transaction } from '@searsuite/sear-domain-transaction';

import {
  createInvertibleProjectedOperations,
  SheetDataFieldNamespace,
  type CellMatrixElement,
  type SheetMatrix,
} from '@searsuite/sear-domain-sheet';
import { AlignmentMatrix } from '../../AlignmentMatrix';
import { SheetHorizontalAlignment } from '@searsuite/sear-domain-cell-types';
import { SheetCommandBus } from '@searsuite/sear-assembly-commands';
import { registerSheetHorizontalAlignmentCommand } from './SheetAlignmentCommands';
import { SheetHorizontalAlignmentFieldKey } from './SheetAlignmentDataField';

export {
  SheetHorizontalAlignment,
  assertSheetHorizontalAlignment,
  isSheetHorizontalAlignment,
} from '@searsuite/sear-domain-cell-types';

/** State owned by SheetAlignmentPlugin. */
export interface SheetAlignmentPluginState {
  /** Sparse matrix containing non-left or cell-type-derived horizontal alignment overrides. */
  cellAlignments: AlignmentMatrix;
}

/** Built-in cell types whose display alignment is derived from type semantics. */
const CELL_TYPE_ALIGNMENTS: Record<string, SheetHorizontalAlignment> = {
  number: SheetHorizontalAlignment.Right,
  date: SheetHorizontalAlignment.Right,
  currency: SheetHorizontalAlignment.Right,
  percent: SheetHorizontalAlignment.Right,
};

const pluginKey = new PluginKey('SheetAlignmentPlugin');

/**
 * Plugin that owns cell alignment data.
 *
 * Alignment state accepts direct alignment transactions owned by this plugin
 * and also tracks sheet-data cell type changes to maintain built-in default
 * alignment projections.
 */
@Injectable()
export class SheetAlignmentPlugin extends Plugin<SheetAlignmentPluginState> {
  public registerCellStyles(registry: SheetCellStyleRegistry, defaults: SheetCellStyleDefaults): void {
    registry.register({
      id: 'sheet.alignment.horizontal',
      properties: ['horizontalAlign'],
      read: (row, column) => ({
        horizontalAlign:
          (this.getState().cellAlignments.getItem(row, column) as SheetHorizontalAlignment | null) ??
          defaults.read().horizontalAlign ??
          SheetHorizontalAlignment.Left,
      }),
    });
  }

  readonly #readCellData: (() => SheetMatrix) | undefined;
  /** Alignment transactions share the registered MatrixOT algebra. */
  public override readonly transactionOT = {
    ownerId: 'sheet.alignment',
    definition: MatrixTransactionOT,
    relations: [MatrixTransactionOTRelation],
    collaborative: true,
  };

  /** DI token for resolving the alignment plugin. */
  public static readonly symbol: symbol = Symbol.for('SheetAlignmentPlugin');
  /** Stable plugin key shared by all alignment plugin instances. */
  public static readonly pluginKey = pluginKey;
  /** Document-state export contribution for persisted cell alignments. */
  public static readonly documentState: PluginDocumentStateContribution<
    SheetAlignmentPluginState,
    SheetAlignmentPluginState
  > = {
    key: 'sheet.cellAlignments',
    capture: (state) => ({ cellAlignments: state.cellAlignments.clone() }),
    codec: {
      key: 'sheet.cellAlignments',
      serialize: (state) => serializeSparseMatrix(state.cellAlignments),
      deserialize: (payload, path) => ({
        cellAlignments: deserializeSparseMatrix<string, AlignmentMatrix>(payload, AlignmentMatrix, path),
      }),
    },
  };

  /** SheetAlignmentPlugin owns the persisted alignment export module. */
  public override readonly documentState = SheetAlignmentPlugin.documentState;

  /** Alignment reacts to direct cell updates and sheet-structure changes. */
  public override interestedIn: string[] = [
    MatrixOTActionName.UpdateCell,
    MatrixOTActionName.RowInsert,
    MatrixOTActionName.RowDelete,
    MatrixOTActionName.RowMove,
    MatrixOTActionName.ColInsert,
    MatrixOTActionName.ColDelete,
    MatrixOTActionName.ColMove,
  ];

  /**
   * Constructs the alignment plugin.
   * @param state - Shared alignment state.
   */
  constructor(state: SheetAlignmentPluginState, readCellData?: () => SheetMatrix) {
    super({ key: pluginKey, state });
    this.#readCellData = readCellData;
  }

  /** Registers the horizontal alignment command owned by this plugin. */
  public registerCommands(commands: SheetCommandBus): void {
    const plugin = this;
    registerSheetHorizontalAlignmentCommand(commands, {
      target: this.key,
      getRowCount: () => plugin.getState().cellAlignments.shape[0],
      getColumnCount: () => plugin.getState().cellAlignments.shape[1],
      readCellAlignment: (row, column) =>
        plugin.getState().cellAlignments.getItem(row, column) as SheetHorizontalAlignment | null,
    });
  }

  /** Registers alignment state for commands, projections, and collaboration. */
  public registerState() {
    return {
      key: this.key,
      state: this.getState(),
      dataEngine: {
        dataView: [
          {
            viewKey: SheetDataFieldNamespace,
            fieldKey: SheetHorizontalAlignmentFieldKey,
            select: function selectSheetCellAlignments(state: SheetAlignmentPluginState) {
              return state.cellAlignments;
            },
          },
        ],
      },
    };
  }

  /** Contributes this owner's cell state to atomic range moves. */
  /** Transfers only this owner's persisted formats. */
  public registerFormatTransfers(registry: SheetFormatTransferRegistry): void {
    const transfer = createMatrixFormatTransfer('sheet.alignment', this.key, () => this.getState().cellAlignments);
    registry.register(this.#readCellData ? { ...transfer, clear: (range) => this.#clearAlignment(range) } : transfer);
  }

  #clearAlignment(range: SheetFormatRange): readonly SheetFormatTransferPlan[] {
    const matrix = this.getState().cellAlignments;
    const cellData = this.#readCellData?.();
    const operations = new Map<string, MatrixOTOperation<string>>();
    const append = (row: number, column: number): void => {
      const current = matrix.getItem(row, column) as SheetHorizontalAlignment;
      const desired = getCellAlignment(cellData?.getItem(row, column) ?? null);
      if (current === (desired ?? SheetHorizontalAlignment.Left)) return;
      const previous = current === SheetHorizontalAlignment.Left ? null : current;
      operations.set(`${row}:${column}`, createUpdateCellOTOperation([row, column], desired, previous));
    };
    matrix.forEachStoredInRange(...range.start, ...range.end, (_alignment, row, column) => append(row, column));
    cellData?.forEachStoredInRange(...range.start, ...range.end, (cell, row, column) => {
      if (getCellAlignment(cell)) append(row, column);
    });
    return operations.size ? [{ target: this.key, operations: [...operations.values()] }] : [];
  }

  public registerRangeMoves(registry: SheetRangeMoveRegistry): void {
    registry.register({
      id: 'sheet.alignment.rangeMove',
      hasConflict: ({ source, destination }) =>
        hasMatrixRangeMoveConflict(this.getState().cellAlignments, source, destination),
      plan: ({ source, destination }) => [
        {
          target: this.key,
          operations: createMatrixRangeMoveOperations(this.getState().cellAlignments, source, destination),
        },
      ],
    });
  }

  public registerRangeReorders(registry: SheetRangeReorderRegistry): void {
    registry.register({
      id: 'sheet.alignment.rangeReorder',
      plan: ({ range, destinationOf }) => [
        {
          target: this.key,
          operations: createMatrixRangeReorderOperations(this.getState().cellAlignments, range, destinationOf),
        },
      ],
    });
  }

  /**
   * Applies alignment operations to the alignment matrix.
   * @param pluginState - Current alignment state.
   * @param transaction - Transaction containing direct or derived MatrixOT-compatible operations.
   * @returns Updated plugin state, or null when the transaction has no relevant operations.
   */
  public apply(pluginState: SheetAlignmentPluginState, transaction: Transaction): SheetAlignmentPluginState | null {
    const operations = this.#createInvertibleAlignmentOperations(pluginState.cellAlignments, transaction);
    if (operations.length === 0) return null;
    MatrixOT.apply(pluginState.cellAlignments, operations);
    return pluginState;
  }

  #createInvertibleAlignmentOperations(matrix: AlignmentMatrix, transaction: Transaction): MatrixOTOperation<string>[] {
    const createOperation =
      transaction.pluginKey === SheetAlignmentPlugin.pluginKey
        ? createInvertibleDirectAlignmentOperation
        : createInvertibleCellAlignmentOperation;
    const operations =
      transaction.pluginKey === SheetAlignmentPlugin.pluginKey || transaction.pluginKey === SheetDataPlugin.pluginKey
        ? (transaction.operations as Operation[])
        : (transaction.operations as Operation[]).filter(isMatrixStructureOperation);
    return createInvertibleProjectedOperations(matrix, operations, createOperation);
  }
}

/**
 * Resolves the default alignment derived from a cell's persisted type.
 * @param cell - Sheet cell value.
 * @returns Alignment string, or null when no built-in alignment is implied.
 */
function getCellAlignment(cell: CellMatrixElement | null): SheetHorizontalAlignment | null {
  const cellType = cell?.type;
  return cellType ? CELL_TYPE_ALIGNMENTS[cellType] ?? null : null;
}

/**
 * Converts one sheet-data operation into the corresponding alignment projection operation.
 * @param matrix - Current alignment matrix snapshot.
 * @param operation - Incoming operation from a sheet-data transaction.
 * @returns Alignment matrix operation, or null when unrelated.
 */
function createInvertibleCellAlignmentOperation(
  matrix: AlignmentMatrix,
  operation: Operation,
): MatrixOTOperation<string> | null {
  if (isUpdateCellOperation<CellMatrixElement>(operation)) {
    if (operation.uc.intent === MatrixCellUpdateIntent.Relocation) return null;
    const [row, col] = operation.p;
    return createUpdateCellOTOperation([row, col], getCellAlignment(operation.uc.value), matrix.getItem(row, col));
  }
  return createInvertibleAlignmentStructureOperation(matrix, operation);
}

/**
 * Converts one direct alignment operation into an invertible alignment matrix operation.
 * @param matrix - Current alignment matrix snapshot.
 * @param operation - Incoming operation owned by SheetAlignmentPlugin.
 * @returns Alignment matrix operation, or null when unrelated.
 */
function createInvertibleDirectAlignmentOperation(
  matrix: AlignmentMatrix,
  operation: Operation,
): MatrixOTOperation<string> | null {
  if (isUpdateCellOperation<string>(operation)) {
    const [row, col] = operation.p;
    return createUpdateCellOTOperation(
      [row, col],
      operation.uc.value,
      operation.uc.prev === void 0 ? matrix.getItem(row, col) : operation.uc.prev,
    );
  }
  return createInvertibleAlignmentStructureOperation(matrix, operation);
}

/**
 * Converts row/column structure edits into alignment matrix structure operations.
 * @param matrix - Current alignment matrix snapshot.
 * @param operation - Incoming operation from a transaction.
 * @returns Alignment matrix operation, or null when unrelated.
 */
function createInvertibleAlignmentStructureOperation(
  matrix: AlignmentMatrix,
  operation: Operation,
): MatrixOTOperation<string> | null {
  if (!isMatrixStructureOperation(operation)) return null;
  if (MatrixOTActionName.RowInsert in operation && operation.ri !== void 0) {
    return createInsertRowOTOperation(operation.p, Array(matrix.shape[1]).fill(null));
  }
  if (MatrixOTActionName.RowDelete in operation && operation.rd !== void 0) {
    return createDeleteRowOTOperation(operation.p, readSparseAlignmentRow(matrix, operation.p[0]));
  }
  if (MatrixOTActionName.RowMove in operation && operation.rm !== void 0) {
    return createMoveRowOTOperation(operation.p, operation.rm);
  }
  if (MatrixOTActionName.ColInsert in operation && operation.ci !== void 0) {
    return createInsertColOTOperation(operation.p, Array(matrix.shape[0]).fill(null));
  }
  if (MatrixOTActionName.ColDelete in operation && operation.cd !== void 0) {
    return createDeleteColOTOperation(operation.p, readSparseAlignmentColumn(matrix, operation.p[0]));
  }
  if (MatrixOTActionName.ColMove in operation && operation.cm !== void 0) {
    return createMoveColOTOperation(operation.p, operation.cm);
  }
  return null;
}

/** Reads a dense structural row payload without materializing the default left alignment. */
function readSparseAlignmentRow(matrix: AlignmentMatrix, rowIndex: number): (string | null)[] {
  const row: (string | null)[] = Array(matrix.shape[1]).fill(null);
  matrix.forEachStoredInRow(rowIndex, (value, column) => {
    row[column] = value;
  });
  return row;
}

/** Reads a dense structural column payload without materializing the default left alignment. */
function readSparseAlignmentColumn(matrix: AlignmentMatrix, columnIndex: number): (string | null)[] {
  const column: (string | null)[] = Array(matrix.shape[0]).fill(null);
  matrix.forEachStored((value, row, columnIndexInMatrix) => {
    if (columnIndexInMatrix === columnIndex) column[row] = value;
  });
  return column;
}
