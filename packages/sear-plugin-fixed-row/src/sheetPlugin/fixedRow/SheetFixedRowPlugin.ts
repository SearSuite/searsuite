import { Plugin, PluginKey, type PluginDocumentStateContribution } from '@searsuite/sear-assembly-plugin';
import { type SheetCommandBus } from '@searsuite/sear-assembly-commands';
import { deserializeSparseMatrix, serializeSparseMatrix } from '@searsuite/sear-domain-matrix';
import {
  MatrixOT,
  MatrixOTActionName,
  createDeleteColOTOperation,
  createInsertColOTOperation,
  createMoveColOTOperation,
  createUpdateCellOTOperation,
  MatrixTransactionOT,
  MatrixTransactionOTRelation,
  isMatrixStructureOperation,
  isUpdateCellOperation,
  type MatrixOTOperation,
  type Operation,
} from '@searsuite/sear-domain-ot';
import { type Transaction } from '@searsuite/sear-domain-transaction';
import { Injectable } from '@searsuite/sear-foundation-di';
import { createInvertibleProjectedOperations, SheetDataFieldNamespace } from '@searsuite/sear-render-engine';
import { type Node } from '@searsuite/sear-render-node';
import { type CellProperties } from '@searsuite/sear-render-registry';
import { FixedRowMatrix } from '../../FixedRowMatrix';
import { registerSheetFixedRowCommands } from './SheetFixedRowCommands';
import { SheetFixedRowsFieldKey } from './SheetFixedRowDataField';

/** State owned exclusively by SheetFixedRowPlugin. */
export interface SheetFixedRowPluginState {
  readonly fixedRows: FixedRowMatrix;
}

const pluginKey = new PluginKey('SheetFixedRowPlugin');

/** Owns fixed-row data, commands, structural projections, export, history, and collaboration. */
@Injectable()
export class SheetFixedRowPlugin extends Plugin<unknown, CellProperties, SheetFixedRowPluginState> {
  public static readonly symbol = Symbol.for('SheetFixedRowPlugin');
  public static readonly pluginKey = pluginKey;
  public override readonly warnOnDuplicateDepth = false;
  public override readonly transactionOT = {
    ownerId: 'sheet.fixedRow',
    definition: MatrixTransactionOT,
    relations: [MatrixTransactionOTRelation],
    collaborative: true,
  };
  public static readonly documentState: PluginDocumentStateContribution<
    SheetFixedRowPluginState,
    SheetFixedRowPluginState
  > = {
    key: 'sheet.fixedRows',
    capture: (state) => (state.fixedRows ? { fixedRows: state.fixedRows.clone() as FixedRowMatrix } : undefined),
    codec: {
      key: 'sheet.fixedRows',
      serialize: (state) => serializeSparseMatrix(state.fixedRows),
      deserialize: (payload, path) => ({
        fixedRows: deserializeSparseMatrix<boolean | null, FixedRowMatrix>(payload, FixedRowMatrix, path),
      }),
    },
  };
  public override readonly documentState = SheetFixedRowPlugin.documentState;
  public override interestedIn = [
    MatrixOTActionName.UpdateCell,
    MatrixOTActionName.RowInsert,
    MatrixOTActionName.RowDelete,
    MatrixOTActionName.RowMove,
  ];

  public constructor(state: SheetFixedRowPluginState) {
    super({ key: pluginKey, state });
  }

  /** Registers the public command that fixes or unfixes a row range. */
  public registerCommands(commands: SheetCommandBus): void {
    const plugin = this;
    registerSheetFixedRowCommands(commands, {
      target: this.key,
      getRowCount: () => plugin.getState().fixedRows.shape[1],
      isRowFixed: (index) => plugin.getState().fixedRows.getItem(0, index) === true,
    });
  }

  /** Publishes the plugin-owned matrix as a read-only Sheet data-view field. */
  public registerState() {
    return {
      key: this.key,
      state: this.getState(),
      dataEngine: {
        dataView: [
          {
            viewKey: SheetDataFieldNamespace,
            fieldKey: SheetFixedRowsFieldKey,
            select: (state: SheetFixedRowPluginState) => state.fixedRows,
          },
        ],
      },
    };
  }

  /** Applies direct fixed-row updates and projects sheet row structure changes. */
  public apply(state: SheetFixedRowPluginState, transaction: Transaction): SheetFixedRowPluginState | null {
    const operations = createInvertibleProjectedOperations(
      state.fixedRows,
      transaction.operations as Operation[],
      (matrix, operation) =>
        createFixedRowOperation(matrix as FixedRowMatrix, operation, transaction.pluginKey === pluginKey),
    );
    if (operations.length === 0) return null;
    MatrixOT.apply(state.fixedRows, operations);
    return state;
  }

  public getPluginConfig(): null {
    return null;
  }

  public render(): Node<CellProperties>[] {
    return [];
  }
}

function createFixedRowOperation(
  matrix: FixedRowMatrix,
  operation: Operation,
  direct: boolean,
): MatrixOTOperation<boolean | null> | null {
  if (isUpdateCellOperation<boolean | null>(operation)) {
    if (!direct) return null;
    const row = operation.p[1];
    return createUpdateCellOTOperation(
      [0, row],
      operation.uc.value === true ? true : null,
      operation.uc.prev === void 0 ? matrix.getItem(0, row) ?? null : operation.uc.prev,
    );
  }
  if (!isMatrixStructureOperation(operation)) return null;
  if (MatrixOTActionName.RowInsert in operation && operation.ri !== void 0) {
    return createInsertColOTOperation(operation.p, [null]);
  }
  if (MatrixOTActionName.RowDelete in operation && operation.rd !== void 0) {
    return createDeleteColOTOperation(operation.p, [matrix.getItem(0, operation.p[0]) ?? null]);
  }
  if (MatrixOTActionName.RowMove in operation && operation.rm !== void 0) {
    return createMoveColOTOperation(operation.p, operation.rm);
  }
  return null;
}
