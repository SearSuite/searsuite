import { type SheetCellStyleRegistry } from '@searsuite/sear-domain-cell-types';
import { createMatrixFormatTransfer, type SheetFormatTransferRegistry } from '@searsuite/sear-assembly-plugin';
import { SheetRangeMoveRegistry, SheetRangeReorderRegistry } from '@searsuite/sear-assembly-plugin';
import { createMatrixRangeMoveOperations, hasMatrixRangeMoveConflict } from '@searsuite/sear-domain-matrix';
import { type SheetQueryRegistry } from '@searsuite/sear-assembly-commands';
import { SheetCommandBus } from '@searsuite/sear-assembly-commands';
import { Plugin, PluginKey, type PluginDocumentStateContribution } from '@searsuite/sear-assembly-plugin';
import { type CellFormat } from '@searsuite/sear-domain-cell-types';
import {
  createMatrixRangeReorderOperations,
  deserializeSparseMatrix,
  serializeSparseMatrix,
  type CSRMatrix,
} from '@searsuite/sear-domain-matrix';
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
import { type Transaction } from '@searsuite/sear-domain-transaction';
import { Injectable } from '@searsuite/sear-foundation-di';
import { createInvertibleProjectedOperations, SheetDataFieldNamespace } from '@searsuite/sear-domain-sheet';

import { CellFormatMatrix } from '../../CellFormatMatrix';
import { registerSheetCellFormatCommand } from './SheetCellFormatCommands';
import { SheetCellFormatFieldKey } from './SheetCellFormatDataField';
import { ReadSheetCellFormatQuery } from './ReadSheetCellFormatQuery';
import { type SheetCellFormatPluginState } from './SheetCellFormatPluginState';

const pluginKey = new PluginKey('SheetCellFormatPlugin');

/** Plugin owning per-cell number formats, their commands, OT, rendering projection, and export. */
@Injectable()
export class SheetCellFormatPlugin extends Plugin<SheetCellFormatPluginState> {
  public registerCellStyles(registry: SheetCellStyleRegistry): void {
    registry.register({
      id: 'sheet.cell-format',
      properties: ['format'],
      read: (row, column) => {
        const format = this.getState().cellFormats.getItem(row, column);
        return format == null ? {} : { format };
      },
    });
  }

  public override readonly transactionOT = {
    ownerId: 'sheet.cellFormat',
    definition: MatrixTransactionOT,
    relations: [MatrixTransactionOTRelation],
    collaborative: true,
  };

  public static readonly symbol: symbol = Symbol.for('SheetCellFormatPlugin');
  public static readonly pluginKey = pluginKey;
  public static readonly documentState: PluginDocumentStateContribution<
    SheetCellFormatPluginState,
    SheetCellFormatPluginState
  > = {
    key: 'sheet.cellFormats',
    capture: (state) => ({ cellFormats: state.cellFormats.clone() }),
    codec: {
      key: 'sheet.cellFormats',
      serialize: (state) => serializeSparseMatrix(state.cellFormats),
      deserialize: (payload, path) => ({
        cellFormats: deserializeSparseMatrix<CellFormat | null, CellFormatMatrix>(payload, CellFormatMatrix, path),
      }),
    },
  };

  public override readonly documentState = SheetCellFormatPlugin.documentState;
  public override interestedIn: string[] = [
    MatrixOTActionName.UpdateCell,
    MatrixOTActionName.RowInsert,
    MatrixOTActionName.RowDelete,
    MatrixOTActionName.RowMove,
    MatrixOTActionName.ColInsert,
    MatrixOTActionName.ColDelete,
    MatrixOTActionName.ColMove,
  ];

  public constructor(state: SheetCellFormatPluginState) {
    super({ key: pluginKey, state });
  }

  public registerCommands(commands: SheetCommandBus): void {
    registerSheetCellFormatCommand(commands, {
      target: this.key,
      getRowCount: () => this.getState().cellFormats.shape[0],
      getColumnCount: () => this.getState().cellFormats.shape[1],
      readCellFormat: (row, column) => this.getState().cellFormats.getItem(row, column),
    });
  }

  public registerQueries(queries: SheetQueryRegistry): void {
    const plugin = this;
    queries.register(ReadSheetCellFormatQuery, () => {
      return {
        get shape(): [number, number] {
          const shape = plugin.getState().cellFormats.shape;
          return [shape[0], shape[1]];
        },
        getItem: (row: number, column: number) => {
          const format = this.getState().cellFormats.getItem(row, column);
          return format === null ? null : { ...format };
        },
      };
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
            fieldKey: SheetCellFormatFieldKey,
            select: function selectSheetCellFormats(state: SheetCellFormatPluginState) {
              return state.cellFormats;
            },
          },
        ],
      },
    };
  }

  /** Contributes this owner's cell state to atomic range moves. */
  /** Transfers only this owner's persisted formats. */
  public registerFormatTransfers(registry: SheetFormatTransferRegistry): void {
    registry.register({
      ...createMatrixFormatTransfer('sheet.cellFormat', this.key, () => this.getState().cellFormats),
      singleCellFillStep: (row, column) => {
        const format = this.getState().cellFormats.getItem(row, column);
        return format?.kind === 'date' || format?.kind === 'dateTime' ? 1 : null;
      },
    });
  }

  public registerRangeMoves(registry: SheetRangeMoveRegistry): void {
    registry.register({
      id: 'sheet.cellFormat.rangeMove',
      hasConflict: ({ source, destination }) =>
        hasMatrixRangeMoveConflict(this.getState().cellFormats, source, destination),
      plan: ({ source, destination }) => [
        {
          target: this.key,
          operations: createMatrixRangeMoveOperations(this.getState().cellFormats, source, destination),
        },
      ],
    });
  }

  public registerRangeReorders(registry: SheetRangeReorderRegistry): void {
    registry.register({
      id: 'sheet.cellFormat.rangeReorder',
      plan: ({ range, destinationOf }) => [
        {
          target: this.key,
          operations: createMatrixRangeReorderOperations(this.getState().cellFormats, range, destinationOf),
        },
      ],
    });
  }

  public apply(state: SheetCellFormatPluginState, transaction: Transaction): SheetCellFormatPluginState | null {
    const operations = createInvertibleProjectedOperations(
      state.cellFormats,
      transaction.operations as Operation[],
      (matrix, operation) => createCellFormatOperation(matrix, operation, transaction.pluginKey === pluginKey),
    );
    if (operations.length === 0) return null;
    MatrixOT.apply(state.cellFormats, operations);
    return state;
  }
}

function createCellFormatOperation(
  matrix: CSRMatrix<CellFormat | null>,
  operation: Operation,
  direct: boolean,
): MatrixOTOperation<CellFormat | null> | null {
  if (isUpdateCellOperation<CellFormat | null>(operation)) {
    if (!direct) return null;
    const [row, column] = operation.p;
    return createUpdateCellOTOperation(
      [row, column],
      operation.uc.value,
      operation.uc.prev === void 0 ? matrix.getItem(row, column) : operation.uc.prev,
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

function readSparseRow(matrix: CSRMatrix<CellFormat | null>, rowIndex: number): (CellFormat | null)[] {
  const row: (CellFormat | null)[] = Array(matrix.shape[1]).fill(null);
  matrix.forEachStoredInRow(rowIndex, (value, column) => {
    row[column] = value;
  });
  return row;
}

function readSparseColumn(matrix: CSRMatrix<CellFormat | null>, columnIndex: number): (CellFormat | null)[] {
  const column: (CellFormat | null)[] = Array(matrix.shape[0]).fill(null);
  matrix.forEachStored((value, row, currentColumn) => {
    if (currentColumn === columnIndex) column[row] = value;
  });
  return column;
}
