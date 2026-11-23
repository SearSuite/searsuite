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
import { Node } from '@searsuite/sear-render-node';
import { Transaction } from '@searsuite/sear-domain-transaction';
import {
  CellProperties,
  type SheetCellVisualReaderRegistrationContext,
  SheetCellVisualReaderRegistry,
} from '@searsuite/sear-render-registry';
import { createInvertibleProjectedOperations, SheetDataFieldNamespace } from '@searsuite/sear-render-engine';
import { VerticalAlignmentMatrix } from '../../VerticalAlignmentMatrix';
import { SheetVerticalAlignment } from '@searsuite/sear-domain-cell-types';
import { SheetCommandBus } from '@searsuite/sear-assembly-commands';
import { registerSheetVerticalAlignmentCommand } from './SheetVerticalAlignmentCommands';
import { SheetVerticalAlignmentFieldKey } from './SheetVerticalAlignmentDataField';

export {
  SheetVerticalAlignment,
  assertSheetVerticalAlignment,
  isSheetVerticalAlignment,
} from '@searsuite/sear-domain-cell-types';

/** State owned by SheetVerticalAlignmentPlugin. */
export interface SheetVerticalAlignmentPluginState {
  /** Sparse matrix containing non-centered vertical alignment overrides. */
  cellVerticalAlignments: VerticalAlignmentMatrix;
}

const pluginKey = new PluginKey('SheetVerticalAlignmentPlugin');

/**
 * Plugin that owns vertical cell alignment data, commands, and structural projections.
 */
@Injectable()
export class SheetVerticalAlignmentPlugin extends Plugin<unknown, CellProperties, SheetVerticalAlignmentPluginState> {
  /** Alignment state is data-only and does not use render-depth diagnostics. */
  public override readonly warnOnDuplicateDepth = false;
  /** Vertical alignment transactions share the registered MatrixOT algebra. */
  public override readonly transactionOT = {
    ownerId: 'sheet.verticalAlignment',
    definition: MatrixTransactionOT,
    relations: [MatrixTransactionOTRelation],
    collaborative: true,
  };

  /** DI token for resolving the vertical alignment plugin. */
  public static readonly symbol: symbol = Symbol.for('SheetVerticalAlignmentPlugin');
  /** Stable plugin key shared by all vertical alignment plugin instances. */
  public static readonly pluginKey = pluginKey;
  /** Document-state export contribution for persisted vertical alignments. */
  public static readonly documentState: PluginDocumentStateContribution<
    SheetVerticalAlignmentPluginState,
    SheetVerticalAlignmentPluginState
  > = {
    key: 'sheet.cellVerticalAlignments',
    capture: (state) => ({ cellVerticalAlignments: state.cellVerticalAlignments.clone() }),
    codec: {
      key: 'sheet.cellVerticalAlignments',
      serialize: (state) => serializeSparseMatrix(state.cellVerticalAlignments),
      deserialize: (payload, path) => ({
        cellVerticalAlignments: deserializeSparseMatrix<string, VerticalAlignmentMatrix>(
          payload,
          VerticalAlignmentMatrix,
          path,
        ),
      }),
    },
  };

  /** SheetVerticalAlignmentPlugin owns its persisted export module. */
  public override readonly documentState = SheetVerticalAlignmentPlugin.documentState;

  /** Vertical alignment follows direct updates and all sheet structure changes. */
  public override interestedIn: string[] = [
    MatrixOTActionName.UpdateCell,
    MatrixOTActionName.RowInsert,
    MatrixOTActionName.RowDelete,
    MatrixOTActionName.RowMove,
    MatrixOTActionName.ColInsert,
    MatrixOTActionName.ColDelete,
    MatrixOTActionName.ColMove,
  ];

  /** Constructs the vertical alignment plugin around a shared sparse matrix. */
  constructor(state: SheetVerticalAlignmentPluginState) {
    super({ key: pluginKey, state });
  }

  /** Registers the vertical alignment command owned by this plugin. */
  public registerCommands(commands: SheetCommandBus): void {
    const plugin = this;
    registerSheetVerticalAlignmentCommand(commands, {
      target: this.key,
      getRowCount: () => plugin.getState().cellVerticalAlignments.shape[0],
      getColumnCount: () => plugin.getState().cellVerticalAlignments.shape[1],
      readCellVerticalAlignment: (row, column) =>
        plugin.getState().cellVerticalAlignments.getItem(row, column) as SheetVerticalAlignment | null,
    });
  }

  /** Contributes vertical alignment to the shared Sheet cell visual pipeline. */
  public registerCellVisualReaders(
    registry: SheetCellVisualReaderRegistry,
    context: SheetCellVisualReaderRegistrationContext,
  ): void {
    const plugin = this;
    registry.register({
      id: 'sheet.alignment.vertical',
      properties: ['verticalAlign'],
      read({ rowIndex, columnIndex }) {
        const configuredDefault = (
          context.readDefaultConfig() as Partial<{
            defaultCellVerticalAlign: SheetVerticalAlignment;
          }>
        ).defaultCellVerticalAlign;
        return {
          verticalAlign:
            (plugin
              .getState()
              .cellVerticalAlignments.getItem(rowIndex, columnIndex) as SheetVerticalAlignment | null) ??
            configuredDefault ??
            SheetVerticalAlignment.Center,
        };
      },
    });
  }

  /** Registers vertical alignment state for commands, projections, and collaboration. */
  public registerState() {
    return {
      key: this.key,
      state: this.getState(),
      dataEngine: {
        dataView: [
          {
            viewKey: SheetDataFieldNamespace,
            fieldKey: SheetVerticalAlignmentFieldKey,
            select: function selectSheetCellVerticalAlignments(state: SheetVerticalAlignmentPluginState) {
              return state.cellVerticalAlignments;
            },
          },
        ],
      },
    };
  }

  /** Contributes this owner's cell state to atomic range moves. */
  /** Transfers only this owner's persisted formats. */
  public registerFormatTransfers(registry: SheetFormatTransferRegistry): void {
    registry.register(
      createMatrixFormatTransfer('sheet.verticalAlignment', this.key, () => this.getState().cellVerticalAlignments),
    );
  }

  public registerRangeMoves(registry: SheetRangeMoveRegistry): void {
    registry.register({
      id: 'sheet.verticalAlignment.rangeMove',
      hasConflict: ({ source, destination }) =>
        hasMatrixRangeMoveConflict(this.getState().cellVerticalAlignments, source, destination),
      plan: ({ source, destination }) => [
        {
          target: this.key,
          operations: createMatrixRangeMoveOperations(this.getState().cellVerticalAlignments, source, destination),
        },
      ],
    });
  }

  public registerRangeReorders(registry: SheetRangeReorderRegistry): void {
    registry.register({
      id: 'sheet.verticalAlignment.rangeReorder',
      plan: ({ range, destinationOf }) => [
        {
          target: this.key,
          operations: createMatrixRangeReorderOperations(this.getState().cellVerticalAlignments, range, destinationOf),
        },
      ],
    });
  }

  /** Applies direct vertical alignment and structural matrix operations. */
  public apply(
    pluginState: SheetVerticalAlignmentPluginState,
    transaction: Transaction,
  ): SheetVerticalAlignmentPluginState | null {
    const operations = createInvertibleProjectedOperations(
      pluginState.cellVerticalAlignments,
      transaction.operations as Operation[],
      (matrix, operation) => createVerticalAlignmentOperation(matrix, operation, transaction.pluginKey === pluginKey),
    );
    if (operations.length === 0) return null;
    MatrixOT.apply(pluginState.cellVerticalAlignments, operations);
    return pluginState;
  }

  /** Vertical alignment data has no render-time configuration. */
  public getPluginConfig(): null {
    return null;
  }

  /** Vertical alignment data does not render scene nodes directly. */
  public render(): Node<CellProperties>[] {
    return [];
  }
}

function createVerticalAlignmentOperation(
  matrix: VerticalAlignmentMatrix,
  operation: Operation,
  direct: boolean,
): MatrixOTOperation<string> | null {
  if (isUpdateCellOperation<string>(operation)) {
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

function readSparseRow(matrix: VerticalAlignmentMatrix, rowIndex: number): (string | null)[] {
  const row: (string | null)[] = Array(matrix.shape[1]).fill(null);
  matrix.forEachStoredInRow(rowIndex, (value, column) => {
    row[column] = value;
  });
  return row;
}

function readSparseColumn(matrix: VerticalAlignmentMatrix, columnIndex: number): (string | null)[] {
  const column: (string | null)[] = Array(matrix.shape[0]).fill(null);
  matrix.forEachStored((value, row, currentColumn) => {
    if (currentColumn === columnIndex) column[row] = value;
  });
  return column;
}
