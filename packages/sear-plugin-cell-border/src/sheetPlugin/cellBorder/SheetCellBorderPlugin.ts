import { createCellBorderFormatTransfer } from '../../createCellBorderFormatTransfer';
import { type SheetFormatTransferRegistry } from '@searsuite/sear-assembly-plugin';
import { SheetRangeMoveRegistry, SheetRangeReorderRegistry } from '@searsuite/sear-assembly-plugin';
import {
  createMatrixRangeMoveOperations,
  createMatrixRangeReorderOperations,
  hasMatrixRangeMoveConflict,
} from '@searsuite/sear-domain-matrix';
import {
  MatrixOT,
  MatrixOTActionName,
  MatrixTransactionOT,
  MatrixTransactionOTRelation,
  type Operation,
} from '@searsuite/sear-domain-ot';
import { createCellBorderOperation } from '../../CellBorderProjection';
import { Plugin, PluginKey, type PluginDocumentStateContribution } from '@searsuite/sear-assembly-plugin';
import { deserializeSparseMatrix, serializeSparseMatrix } from '@searsuite/sear-domain-matrix';
import { Injectable } from '@searsuite/sear-foundation-di';

import { Transaction } from '@searsuite/sear-domain-transaction';

import { createInvertibleProjectedOperations, SheetDataFieldNamespace } from '@searsuite/sear-domain-sheet';
import { SheetCommandBus } from '@searsuite/sear-assembly-commands';
import { CellBorderMatrix } from '../../CellBorderMatrix';
import { type SheetCellBorder } from '../../SheetCellBorder';
import { registerCellBorderCommands } from '../../SheetCellBorderCommands';
import { registerCellBorderQueries } from '../../SheetCellBorderQueries';
import { type SheetQueryRegistry } from '@searsuite/sear-assembly-commands';

import { SheetCellBorderFieldKey } from '../../SheetCellBorderDataField';

/** State owned by SheetCellBorderPlugin. */
export interface SheetCellBorderPluginState {
  /** Sparse matrix containing explicit per-cell edge strokes. */
  cellBorders: CellBorderMatrix;
}

const pluginKey = new PluginKey('SheetCellBorderPlugin');

/** Plugin that owns cell border data, commands, structural projections, and export. */
@Injectable()
export class SheetCellBorderPlugin extends Plugin<SheetCellBorderPluginState> {
  /** Border transactions share the registered MatrixOT algebra. */
  public override readonly transactionOT = {
    ownerId: 'sheet.cellBorder',
    definition: MatrixTransactionOT,
    relations: [MatrixTransactionOTRelation],
    collaborative: true,
  };

  /** DI token for resolving the cell-border plugin. */
  public static readonly symbol: symbol = Symbol.for('SheetCellBorderPlugin');
  /** Stable plugin key shared by all cell-border plugin instances. */
  public static readonly pluginKey = pluginKey;
  /** Document-state export contribution for cell borders. */
  public static readonly documentState: PluginDocumentStateContribution<
    SheetCellBorderPluginState,
    Partial<SheetCellBorderPluginState>
  > = {
    key: 'sheet.cellBorders',
    capture: (state) => ({ cellBorders: state.cellBorders.clone() }),
    codec: {
      key: 'sheet.cellBorders',
      serialize: (state) => (state.cellBorders === undefined ? undefined : serializeSparseMatrix(state.cellBorders)),
      deserialize: (payload, path) => ({
        cellBorders: deserializeSparseMatrix<SheetCellBorder | null, CellBorderMatrix>(payload, CellBorderMatrix, path),
      }),
    },
  };

  /** SheetCellBorderPlugin owns its persisted state module. */
  public override readonly documentState = SheetCellBorderPlugin.documentState;
  /** Border follows direct updates and all sheet structure changes. */
  public override interestedIn: string[] = [
    MatrixOTActionName.UpdateCell,
    MatrixOTActionName.ResizeRow,
    MatrixOTActionName.ResizeCol,
    MatrixOTActionName.RowInsert,
    MatrixOTActionName.RowDelete,
    MatrixOTActionName.RowMove,
    MatrixOTActionName.ColInsert,
    MatrixOTActionName.ColDelete,
    MatrixOTActionName.ColMove,
  ];

  /** Constructs the plugin around its independently owned sparse border matrix. */
  public constructor(state: SheetCellBorderPluginState) {
    super({ key: pluginKey, state });
  }

  /** Registers the cell-border command owned by this plugin. */
  public registerCommands(commands: SheetCommandBus): void {
    registerCellBorderCommands(commands, this.key, () => this.getState().cellBorders);
  }

  /** Publishes the border owner's typed read-only queries. */
  public registerQueries(queries: SheetQueryRegistry): void {
    registerCellBorderQueries(queries, () => this.getState().cellBorders);
  }

  /** Registers border state for commands, projections, and collaboration. */
  public registerState() {
    return {
      key: this.key,
      state: this.getState(),
      dataEngine: {
        dataView: [
          {
            viewKey: SheetDataFieldNamespace,
            fieldKey: SheetCellBorderFieldKey,
            select: function selectSheetCellBorders(state: SheetCellBorderPluginState) {
              return state.cellBorders;
            },
          },
        ],
      },
    };
  }

  /** Contributes this owner's cell state to atomic range moves. */
  /** Transfers only this owner's persisted formats. */
  public registerFormatTransfers(registry: SheetFormatTransferRegistry): void {
    registry.register(createCellBorderFormatTransfer(this.key, () => this.getState().cellBorders));
  }

  public registerRangeMoves(registry: SheetRangeMoveRegistry): void {
    registry.register({
      id: 'sheet.cellBorder.rangeMove',
      hasConflict: ({ source, destination }) =>
        hasMatrixRangeMoveConflict(this.getState().cellBorders, source, destination),
      plan: ({ source, destination }) => [
        {
          target: this.key,
          operations: createMatrixRangeMoveOperations(this.getState().cellBorders, source, destination),
        },
      ],
    });
  }

  public registerRangeReorders(registry: SheetRangeReorderRegistry): void {
    registry.register({
      id: 'sheet.cellBorder.rangeReorder',
      plan: ({ range, destinationOf }) => [
        {
          target: this.key,
          operations: createMatrixRangeReorderOperations(this.getState().cellBorders, range, destinationOf),
        },
      ],
    });
  }

  /** Applies direct border and structural matrix operations. */
  public apply(pluginState: SheetCellBorderPluginState, transaction: Transaction): SheetCellBorderPluginState | null {
    const operations = createInvertibleProjectedOperations(
      pluginState.cellBorders,
      transaction.operations as Operation[],
      (matrix, operation) => createCellBorderOperation(matrix, operation, transaction.pluginKey === pluginKey),
    );
    if (operations.length === 0) return pluginState;
    MatrixOT.apply(pluginState.cellBorders, operations);
    return pluginState;
  }
}
