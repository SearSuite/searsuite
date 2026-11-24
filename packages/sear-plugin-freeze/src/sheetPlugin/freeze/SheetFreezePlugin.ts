import { Plugin, PluginKey, type PluginDocumentStateContribution } from '@searsuite/sear-assembly-plugin';
import { type SheetCommandBus } from '@searsuite/sear-assembly-commands';
import { deserializeSparseMatrix, serializeSparseMatrix } from '@searsuite/sear-domain-matrix';
import {
  MatrixOT, MatrixOTActionName, MatrixTransactionOT, MatrixTransactionOTRelation,
  createUpdateCellOTOperation, isMatrixStructureOperation, isUpdateCellOperation,
  type MatrixOTOperation, type Operation,
} from '@searsuite/sear-domain-ot';
import { type Transaction } from '@searsuite/sear-domain-transaction';
import { Injectable } from '@searsuite/sear-foundation-di';
import { createInvertibleProjectedOperations, SheetDataFieldNamespace } from '@searsuite/sear-render-engine';
import { type Node } from '@searsuite/sear-render-node';
import { type CellProperties } from '@searsuite/sear-render-registry';
import { registerSheetFreezeCommands } from '../../SheetFreezeCommands';
import { SheetFreezeFieldKey } from '../../SheetFreezeField';
import { SheetFreezeMatrix } from '../../SheetFreezeMatrix';

/** Document-owned state for one Sheet editor's freeze boundaries. */
export interface SheetFreezePluginState {
  /** Sparse freeze boundary matrix. */
  readonly freeze: SheetFreezeMatrix;
}

const key = new PluginKey('SheetFreezePlugin');

/** Owns the persistent row and column prefix kept visible during scrolling. */
@Injectable()
export class SheetFreezePlugin extends Plugin<unknown, CellProperties, SheetFreezePluginState> {
  readonly #shape: () => readonly [number, number];

  public static readonly symbol = Symbol.for('SheetFreezePlugin');
  public static readonly pluginKey = key;
  public override readonly warnOnDuplicateDepth = false;
  public override readonly transactionOT = {
    ownerId: 'sheet.freeze', definition: MatrixTransactionOT,
    relations: [MatrixTransactionOTRelation], collaborative: true,
  };
  public static readonly documentState: PluginDocumentStateContribution<SheetFreezePluginState, SheetFreezePluginState> = {
    key: 'sheet.freeze',
    capture: (state) => state.freeze ? { freeze: state.freeze.clone() as SheetFreezeMatrix } : undefined,
    codec: {
      key: 'sheet.freeze',
      serialize: (state) => state.freeze ? serializeSparseMatrix(state.freeze) : undefined,
      deserialize: (payload, path) => ({
        freeze: deserializeSparseMatrix<number | null, SheetFreezeMatrix>(payload, SheetFreezeMatrix, path),
      }),
    },
  };
  public override readonly documentState = SheetFreezePlugin.documentState;
  public override readonly interestedIn = [
    MatrixOTActionName.UpdateCell,
    MatrixOTActionName.RowInsert, MatrixOTActionName.RowDelete, MatrixOTActionName.RowMove,
    MatrixOTActionName.ColInsert, MatrixOTActionName.ColDelete, MatrixOTActionName.ColMove,
  ];

  public constructor(state: SheetFreezePluginState, shape: () => readonly [number, number]) {
    super({ key, state });
    this.#shape = shape;
  }

  public registerCommands(commands: SheetCommandBus): void {
    registerSheetFreezeCommands(commands, {
      target: this.key,
      read: () => ({
        rows: this.getState().freeze.getItem(0, 0) ?? 0,
        columns: this.getState().freeze.getItem(0, 1) ?? 0,
      }),
      shape: this.#shape,
    });
  }

  public registerState() {
    return {
      key: this.key, state: this.getState(),
      dataEngine: { dataView: [{
        viewKey: SheetDataFieldNamespace,
        fieldKey: SheetFreezeFieldKey,
        select: (state: SheetFreezePluginState) => state.freeze,
      }] },
    };
  }

  public apply(state: SheetFreezePluginState, transaction: Transaction): SheetFreezePluginState | null {
    const operations = createInvertibleProjectedOperations(
      state.freeze, transaction.operations as Operation[],
      (matrix, operation) => createFreezeOperation(matrix as SheetFreezeMatrix, operation, transaction.pluginKey === key),
    );
    if (operations.length === 0) return null;
    MatrixOT.apply(state.freeze, operations);
    return state;
  }

  public getPluginConfig(): null { return null; }
  public render(): Node<CellProperties>[] { return []; }
}

function createFreezeOperation(
  matrix: SheetFreezeMatrix, operation: Operation, direct: boolean,
): MatrixOTOperation<number | null> | null {
  if (isUpdateCellOperation<number | null>(operation)) {
    if (!direct) return null;
    const axis = operation.p[1];
    if (axis !== 0 && axis !== 1) return null;
    return createUpdateCellOTOperation([0, axis], operation.uc.value,
      operation.uc.prev === void 0 ? matrix.getItem(0, axis) : operation.uc.prev);
  }
  if (!isMatrixStructureOperation(operation)) return null;
  const rowAxis = MatrixOTActionName.RowInsert in operation || MatrixOTActionName.RowDelete in operation ||
    MatrixOTActionName.RowMove in operation;
  const axis = rowAxis ? 0 : 1;
  const previous = matrix.getItem(0, axis) ?? 0;
  let next = previous;
  const index = operation.p[0];
  if ((MatrixOTActionName.RowInsert in operation || MatrixOTActionName.ColInsert in operation) && index < previous) {
    next += 1;
  } else if ((MatrixOTActionName.RowDelete in operation || MatrixOTActionName.ColDelete in operation) && index < previous) {
    next -= 1;
  } else if ((MatrixOTActionName.RowMove in operation || MatrixOTActionName.ColMove in operation)) {
    const destination = 'rm' in operation ? operation.rm?.[0] : 'cm' in operation ? operation.cm?.[0] : void 0;
    if (destination !== void 0) {
      if (index < previous && destination >= previous) next -= 1;
      if (index >= previous && destination < previous) next += 1;
    }
  }
  return next === previous ? null : createUpdateCellOTOperation([0, axis], next || null, previous || null);
}
