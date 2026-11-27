import { type SheetCellStyleRegistry } from '@searsuite/sear-domain-cell-types';
import { createMatrixFormatTransfer, type SheetFormatTransferRegistry } from '@searsuite/sear-assembly-plugin';
import { SheetRangeMoveRegistry, SheetRangeReorderRegistry } from '@searsuite/sear-assembly-plugin';
import {
  createMatrixRangeMoveOperations,
  createMatrixRangeReorderOperations,
  hasMatrixRangeMoveConflict,
} from '@searsuite/sear-domain-matrix';
import {
  MatrixOT,
  MatrixOTActionName,
  createDeleteColOTOperation,
  createDeleteRowOTOperation,
  createInsertColOTOperation,
  createInsertRowOTOperation,
  createMoveColOTOperation,
  createMoveRowOTOperation,
  createUpdateCellOTOperation,
  MatrixTransactionOT,
  MatrixTransactionOTRelation,
  isMatrixStructureOperation,
  isUpdateCellOperation,
  type MatrixOTOperation,
  type Operation,
} from '@searsuite/sear-domain-ot';
import { Plugin, PluginKey, type PluginDocumentStateContribution } from '@searsuite/sear-assembly-plugin';
import { deserializeSparseMatrix, serializeSparseMatrix, type CSRMatrix } from '@searsuite/sear-domain-matrix';
import { Injectable } from '@searsuite/sear-foundation-di';

import { Transaction } from '@searsuite/sear-domain-transaction';

import { createInvertibleProjectedOperations, SheetDataFieldNamespace } from '@searsuite/sear-domain-sheet';
import { SheetCommandBus } from '@searsuite/sear-assembly-commands';
import { CellFillMatrix, type SheetCellFill } from '../../CellFillMatrix';
import { registerSheetCellFillCommand } from './SheetCellFillCommands';
import { SheetCellFillFieldKey } from './SheetCellFillDataField';

/** State owned by SheetCellFillPlugin. */
export interface SheetCellFillPluginState {
  /** Sparse matrix containing explicit cell fill colors. */
  cellFills: CellFillMatrix;
}

const pluginKey = new PluginKey('SheetCellFillPlugin');

/** Plugin that owns cell fill data, commands, structural projections, and export. */
@Injectable()
export class SheetCellFillPlugin extends Plugin<SheetCellFillPluginState> {
  public registerCellStyles(registry: SheetCellStyleRegistry): void {
    registry.register({
      id: 'sheet.cell-fill',
      properties: ['fill'],
      read: (row, column) => {
        const fill = this.getState().cellFills.getItem(row, column);
        return fill == null ? {} : { fill };
      },
    });
  }

  /** Fill transactions share the registered MatrixOT algebra. */
  public override readonly transactionOT = {
    ownerId: 'sheet.cellFill',
    definition: MatrixTransactionOT,
    relations: [MatrixTransactionOTRelation],
    collaborative: true,
  };

  /** DI token for resolving the cell-fill plugin. */
  public static readonly symbol: symbol = Symbol.for('SheetCellFillPlugin');
  /** Stable plugin key shared by all cell-fill plugin instances. */
  public static readonly pluginKey = pluginKey;
  /** Document-state export contribution for cell fills. */
  public static readonly documentState: PluginDocumentStateContribution<
    SheetCellFillPluginState,
    SheetCellFillPluginState
  > = {
    key: 'sheet.cellFills',
    capture: (state) => ({ cellFills: state.cellFills.clone() }),
    codec: {
      key: 'sheet.cellFills',
      serialize: (state) => serializeSparseMatrix(state.cellFills),
      deserialize: (payload, path) => ({
        cellFills: deserializeSparseMatrix<SheetCellFill | null, CellFillMatrix>(payload, CellFillMatrix, path),
      }),
    },
  };

  /** SheetCellFillPlugin owns its persisted state module. */
  public override readonly documentState = SheetCellFillPlugin.documentState;
  /** Fill follows direct updates and all sheet structure changes. */
  public override interestedIn: string[] = [
    MatrixOTActionName.UpdateCell,
    MatrixOTActionName.RowInsert,
    MatrixOTActionName.RowDelete,
    MatrixOTActionName.RowMove,
    MatrixOTActionName.ColInsert,
    MatrixOTActionName.ColDelete,
    MatrixOTActionName.ColMove,
  ];

  /** Constructs the plugin around a shared sparse fill matrix. */
  public constructor(state: SheetCellFillPluginState) {
    super({ key: pluginKey, state });
  }

  /** Registers the cell-fill command owned by this plugin. */
  public registerCommands(commands: SheetCommandBus): void {
    const plugin = this;
    registerSheetCellFillCommand(commands, {
      target: this.key,
      getRowCount: () => plugin.getState().cellFills.shape[0],
      getColumnCount: () => plugin.getState().cellFills.shape[1],
      readCellFill: (row, column) => plugin.getState().cellFills.getItem(row, column),
    });
  }

  /** Registers fill state for commands, projections, and collaboration. */
  public registerState() {
    return {
      key: this.key,
      state: this.getState(),
      dataEngine: {
        dataView: [
          {
            viewKey: SheetDataFieldNamespace,
            fieldKey: SheetCellFillFieldKey,
            select: function selectSheetCellFills(state: SheetCellFillPluginState) {
              return state.cellFills;
            },
          },
        ],
      },
    };
  }

  /** Contributes this owner's cell state to atomic range moves. */
  /** Transfers only this owner's persisted formats. */
  public registerFormatTransfers(registry: SheetFormatTransferRegistry): void {
    registry.register(createMatrixFormatTransfer('sheet.cellFill', this.key, () => this.getState().cellFills));
  }

  public registerRangeMoves(registry: SheetRangeMoveRegistry): void {
    registry.register({
      id: 'sheet.cellFill.rangeMove',
      hasConflict: ({ source, destination }) =>
        hasMatrixRangeMoveConflict(this.getState().cellFills, source, destination),
      plan: ({ source, destination }) => [
        {
          target: this.key,
          operations: createMatrixRangeMoveOperations(this.getState().cellFills, source, destination),
        },
      ],
    });
  }

  public registerRangeReorders(registry: SheetRangeReorderRegistry): void {
    registry.register({
      id: 'sheet.cellFill.rangeReorder',
      plan: ({ range, destinationOf }) => [
        {
          target: this.key,
          operations: createMatrixRangeReorderOperations(this.getState().cellFills, range, destinationOf),
        },
      ],
    });
  }

  /** Applies direct fill and structural matrix operations. */
  public apply(pluginState: SheetCellFillPluginState, transaction: Transaction): SheetCellFillPluginState | null {
    const operations = createInvertibleProjectedOperations(
      pluginState.cellFills,
      transaction.operations as Operation[],
      (matrix, operation) => createCellFillOperation(matrix, operation, transaction.pluginKey === pluginKey),
    );
    if (operations.length === 0) return null;
    MatrixOT.apply(pluginState.cellFills, operations);
    return pluginState;
  }
}

function createCellFillOperation(
  matrix: CSRMatrix<SheetCellFill | null>,
  operation: Operation,
  direct: boolean,
): MatrixOTOperation<SheetCellFill | null> | null {
  if (isUpdateCellOperation<SheetCellFill | null>(operation)) {
    if (!direct) return null;
    const [row, col] = operation.p;
    return createUpdateCellOTOperation(
      [row, col],
      operation.uc.value,
      operation.uc.prev === void 0 ? matrix.getItem(row, col) : operation.uc.prev,
    );
  }
  if (!isMatrixStructureOperation(operation)) return null;
  if (MatrixOTActionName.RowInsert in operation && operation.ri !== void 0)
    return createInsertRowOTOperation(operation.p, Array(matrix.shape[1]).fill(null));
  if (MatrixOTActionName.RowDelete in operation && operation.rd !== void 0)
    return createDeleteRowOTOperation(operation.p, readSparseRow(matrix, operation.p[0]));
  if (MatrixOTActionName.RowMove in operation && operation.rm !== void 0)
    return createMoveRowOTOperation(operation.p, operation.rm);
  if (MatrixOTActionName.ColInsert in operation && operation.ci !== void 0)
    return createInsertColOTOperation(operation.p, Array(matrix.shape[0]).fill(null));
  if (MatrixOTActionName.ColDelete in operation && operation.cd !== void 0)
    return createDeleteColOTOperation(operation.p, readSparseColumn(matrix, operation.p[0]));
  if (MatrixOTActionName.ColMove in operation && operation.cm !== void 0)
    return createMoveColOTOperation(operation.p, operation.cm);
  return null;
}

function readSparseRow(matrix: CSRMatrix<SheetCellFill | null>, rowIndex: number): (SheetCellFill | null)[] {
  const row: (SheetCellFill | null)[] = Array(matrix.shape[1]).fill(null);
  matrix.forEachStoredInRow(rowIndex, (value, column) => {
    row[column] = value;
  });
  return row;
}

function readSparseColumn(matrix: CSRMatrix<SheetCellFill | null>, columnIndex: number): (SheetCellFill | null)[] {
  const column: (SheetCellFill | null)[] = Array(matrix.shape[0]).fill(null);
  matrix.forEachStored((value, row, currentColumn) => {
    if (currentColumn === columnIndex) column[row] = value;
  });
  return column;
}
