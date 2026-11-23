import { type CellFormatTransferRegistry } from '@searsuite/sear-domain-cell-types';
import { type SheetFormatTransferRegistry } from '@searsuite/sear-assembly-plugin';
import { createSheetDataFormatTransfer } from './createSheetDataFormatTransfer';
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
  type MatrixOTOperation,
  type Operation,
} from '@searsuite/sear-domain-ot';
import { deserializeSparseMatrix, serializeSparseMatrix } from '@searsuite/sear-domain-matrix';
import { Plugin, PluginKey, type PluginDocumentStateContribution } from '@searsuite/sear-assembly-plugin';
import { Injectable } from '@searsuite/sear-foundation-di';
import { Node } from '@searsuite/sear-render-node';
import { Transaction } from '@searsuite/sear-domain-transaction';
import { CellProperties } from '@searsuite/sear-render-registry';
import {
  createInvertibleProjectedOperations,
  createInvertibleSheetDataOperation,
} from '../../SheetMatrixProjectionOperations';
import { SheetMatrix, type CellMatrixElement } from '../../SheetMatrices';
import { SheetDataFieldNamespace } from '../../SheetDataView';
import { SheetDataMatrixFieldKey } from './SheetDataMatrixField';
import { type DataEngine } from '../../DataEngine';
import { registerReadSheetCellDataQuery } from './registerReadSheetCellDataQuery';
import { type SheetDataQueryRegistry } from './SheetDataQueryRegistry';

/** State owned by SheetDataPlugin. */
export interface SheetDataPluginState {
  /** Main sheet matrix containing persisted cell values. */
  sheetData: SheetMatrix;
}

const pluginKey = new PluginKey('SheetDataPlugin');

/**
 * Plugin that owns the persisted sheet cell matrix.
 *
 * It applies cell and sheet-structure transactions through MatrixOT and builds
 * inverse OT payloads for inversion. Derived projections such as alignment and
 * dimensions live in their own feature plugins.
 */
@Injectable()
export class SheetDataPlugin extends Plugin<unknown, CellProperties, SheetDataPluginState> {
  /** Sheet data is state-only; duplicate render/event depth diagnostics do not apply. */
  public override readonly warnOnDuplicateDepth = false;
  /** Sheet data transactions share the registered MatrixOT algebra. */
  public override readonly transactionOT = {
    ownerId: 'sheet.data',
    definition: MatrixTransactionOT,
    relations: [MatrixTransactionOTRelation],
    collaborative: true,
  };

  /** DI token for resolving the sheet data plugin. */
  public static readonly symbol: symbol = Symbol.for('SheetDataPlugin');
  /** Stable plugin key shared by all sheet data plugin instances. */
  public static readonly pluginKey = pluginKey;
  /** Document-state export contribution for persisted sheet cells. */
  public static readonly documentState: PluginDocumentStateContribution<SheetDataPluginState, SheetDataPluginState> = {
    key: 'sheet.data',
    capture: (state) => ({ sheetData: state.sheetData.clone() }),
    codec: {
      key: 'sheet.data',
      serialize: (state) => serializeSparseMatrix(state.sheetData),
      deserialize: (payload, path) => ({
        sheetData: deserializeSparseMatrix<CellMatrixElement, SheetMatrix>(payload, SheetMatrix, path),
      }),
    },
  };

  /** SheetDataPlugin owns the persisted sheet-data export module. */
  public override readonly documentState = SheetDataPlugin.documentState;

  /** Sheet data reacts to cell changes and row/column structure edits from any command owner. */
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
   * Constructs the sheet data plugin.
   * @param state - Shared sheet data state.
   */
  constructor(state: SheetDataPluginState, private readonly formatCodecs?: () => CellFormatTransferRegistry) {
    super({ key: pluginKey, state });
  }

  /** Registers the sheet data matrix for commands, rendering, and collaboration. */
  public registerState() {
    return {
      key: this.key,
      state: this.getState(),
      dataEngine: {
        dataView: [
          {
            viewKey: SheetDataFieldNamespace,
            fieldKey: SheetDataMatrixFieldKey,
            select: function selectSheetDataMatrix(state: SheetDataPluginState) {
              return state.sheetData;
            },
          },
        ],
      },
    };
  }

  /** Contributes this owner's cell state to atomic range moves. */
  public registerFormatTransfers(registry: SheetFormatTransferRegistry): void {
    if (this.formatCodecs)
      registry.register(createSheetDataFormatTransfer(this.key, () => this.getState().sheetData, this.formatCodecs()));
  }

  public registerRangeMoves(registry: SheetRangeMoveRegistry): void {
    registry.register({
      id: 'sheet.data.rangeMove',
      hasConflict: ({ source, destination }) =>
        hasMatrixRangeMoveConflict(this.getState().sheetData, source, destination),
      plan: ({ source, destination }) => [
        {
          target: this.key,
          operations: createMatrixRangeMoveOperations(this.getState().sheetData, source, destination),
        },
      ],
    });
  }

  public registerRangeReorders(registry: SheetRangeReorderRegistry): void {
    registry.register({
      id: 'sheet.data.rangeReorder',
      plan: ({ range, destinationOf }) => [
        {
          target: this.key,
          operations: createMatrixRangeReorderOperations(this.getState().sheetData, range, destinationOf),
        },
      ],
    });
  }

  /** Publishes a live read-only projection for consumers that do not need an export snapshot. */
  public registerQueries(queries: SheetDataQueryRegistry): void {
    registerReadSheetCellDataQuery(queries, () => this.getState().sheetData);
  }

  /**
   * Applies sheet-data operations to the persisted cell matrix.
   * @param pluginState - Current sheet data state.
   * @param transaction - Transaction containing MatrixOT-compatible operations.
   * @returns Updated plugin state, or null when the transaction has no relevant operations.
   */
  public apply(pluginState: SheetDataPluginState, transaction: Transaction): SheetDataPluginState | null {
    const operations = this.createInvertibleSheetDataOperations(pluginState.sheetData, transaction);
    if (operations.length === 0) return null;
    MatrixOT.apply(pluginState.sheetData, operations);
    return pluginState;
  }

  /** Sheet data has no render-time configuration. */
  public getPluginConfig(): null {
    return null;
  }

  /**
   * Sheet data does not render scene nodes directly.
   * @returns An empty node list.
   */
  public render(): Node<CellProperties>[] {
    return [];
  }

  private createInvertibleSheetDataOperations(
    matrix: SheetMatrix,
    transaction: Transaction,
  ): MatrixOTOperation<CellMatrixElement>[] {
    if (transaction.pluginKey !== SheetDataPlugin.pluginKey) return [];
    return createInvertibleProjectedOperations(
      matrix,
      transaction.operations as Operation[],
      createInvertibleSheetDataOperation,
    );
  }
}
