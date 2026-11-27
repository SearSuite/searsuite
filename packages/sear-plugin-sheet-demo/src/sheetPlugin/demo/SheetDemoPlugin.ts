import { type SheetCellStyleRegistry } from '@searsuite/sear-domain-cell-types';
import {
  PluginKey,
  SheetRangeMoveRegistry,
  SheetRangeReorderRegistry,
  type PluginDocumentStateContribution,
} from '@searsuite/sear-assembly-plugin';
import { SheetCommandBus, SheetQueryRegistry } from '@searsuite/sear-assembly-commands';
import { SheetPlugin } from '@searsuite/sear-assembly-commands';
import {
  createMatrixRangeMoveOperations,
  createMatrixRangeReorderOperations,
  deserializeSparseMatrix,
  hasMatrixRangeMoveConflict,
  serializeSparseMatrix,
} from '@searsuite/sear-domain-matrix';
import {
  MatrixOT,
  MatrixOTActionName,
  MatrixTransactionOT,
  MatrixTransactionOTRelation,
  type Operation,
} from '@searsuite/sear-domain-ot';
import { Transaction } from '@searsuite/sear-domain-transaction';
import { Inject, Injectable } from '@searsuite/sear-foundation-di';

import { createInvertibleProjectedOperations, SheetDataFieldNamespace } from '@searsuite/sear-domain-sheet';
import { SheetDemoMatrix } from '../../SheetDemoMatrix';
import { SheetDemoMarker } from '../../SheetDemoMarker';
import { registerSheetDemoCommands, registerSheetDemoQueries } from '../../SheetDemoCommands';
import { SheetDemoFieldKey } from '../../SheetDemoDataField';
import { projectMarkerOperation } from '../../SheetDemoOperations';

export interface SheetDemoPluginState {
  readonly markers: SheetDemoMatrix;
}

const pluginKey = new PluginKey('SheetDemoPlugin');
/** The host binds one state object per Sheet editor before plugin construction. */
export const SheetDemoStateToken = Symbol.for('SheetDemoPluginState');

/** Reference implementation of a collaborative, matrix-backed Sheet feature. */
@Injectable()
export class SheetDemoPlugin extends SheetPlugin<SheetDemoPluginState> {
  public registerCellStyles(registry: SheetCellStyleRegistry): void {
    registry.registerOverride({
      id: 'sheet.demo.marker',
      properties: ['fill'],
      priority: 10,
      read: (row, column) => {
        const marker = this.getState().markers.getItem(row, column);
        return marker === SheetDemoMarker.Review
          ? { fill: '#FCE3A1' }
          : marker === SheetDemoMarker.Approved
          ? { fill: '#C9EDD1' }
          : {};
      },
    });
  }

  public static readonly symbol = Symbol.for('SheetDemoPlugin');
  public static readonly pluginKey = pluginKey;
  public static readonly documentState: PluginDocumentStateContribution<SheetDemoPluginState, SheetDemoPluginState> = {
    key: 'sheet.demo.markers',
    capture: (state) => ({ markers: state.markers.clone() }),
    codec: {
      key: 'sheet.demo.markers',
      serialize: (state) => serializeSparseMatrix(state.markers),
      deserialize: (payload, path) => ({
        markers: deserializeSparseMatrix<SheetDemoMarker | null, SheetDemoMatrix>(payload, SheetDemoMatrix, path),
      }),
    },
  };

  public readonly warnOnDuplicateDepth = false;
  public override readonly documentState = SheetDemoPlugin.documentState;
  public override readonly transactionOT = {
    ownerId: 'sheet.demo.marker',
    definition: MatrixTransactionOT,
    relations: [MatrixTransactionOTRelation],
    collaborative: true,
  };
  public override interestedIn = [
    MatrixOTActionName.UpdateCell,
    MatrixOTActionName.RowInsert,
    MatrixOTActionName.RowDelete,
    MatrixOTActionName.RowMove,
    MatrixOTActionName.ColInsert,
    MatrixOTActionName.ColDelete,
    MatrixOTActionName.ColMove,
  ];

  public constructor(@Inject(SheetDemoStateToken) state: SheetDemoPluginState) {
    super({ key: pluginKey, state });
  }

  public registerCommands(commands: SheetCommandBus): void {
    registerSheetDemoCommands(commands, { target: this.key, readMatrix: () => this.getState().markers });
  }

  public registerQueries(queries: SheetQueryRegistry): void {
    registerSheetDemoQueries(queries, () => this.getState().markers);
  }

  public registerState() {
    return {
      key: this.key,
      state: this.getState(),
      dataEngine: {
        dataView: [
          {
            viewKey: SheetDataFieldNamespace,
            fieldKey: SheetDemoFieldKey,
            select: (state: SheetDemoPluginState) => state.markers,
          },
        ],
      },
    };
  }

  public registerRangeMoves(registry: SheetRangeMoveRegistry): void {
    registry.register({
      id: 'sheet.demo.marker',
      hasConflict: ({ source, destination }) =>
        hasMatrixRangeMoveConflict(this.getState().markers, source, destination),
      plan: ({ source, destination }) => [
        {
          target: this.key,
          operations: createMatrixRangeMoveOperations(this.getState().markers, source, destination),
        },
      ],
    });
  }

  public registerRangeReorders(registry: SheetRangeReorderRegistry): void {
    registry.register({
      id: 'sheet.demo.marker',
      plan: ({ range, destinationOf }) => [
        {
          target: this.key,
          operations: createMatrixRangeReorderOperations(this.getState().markers, range, destinationOf),
        },
      ],
    });
  }

  public apply(state: SheetDemoPluginState, transaction: Transaction): SheetDemoPluginState | null {
    const operations = createInvertibleProjectedOperations(
      state.markers,
      transaction.operations as Operation[],
      (matrix, operation) => projectMarkerOperation(matrix, operation, transaction.pluginKey === pluginKey),
    );
    if (operations.length === 0) return null;
    MatrixOT.apply(state.markers, operations);
    return state;
  }
}
