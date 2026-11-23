import { SheetRangeMoveRegistry, SheetRangeReorderRegistry } from '@searsuite/sear-assembly-plugin';
import { createMatrixRangeMoveOperations, createMatrixRangeReorderOperations, hasMatrixRangeMoveConflict } from '@searsuite/sear-domain-matrix';
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
import { CellClipboardCodecRegistry, SheetDisplayedValueChanges, type CellMatrixElement } from '@searsuite/sear-domain-cell-types';
import { Node } from '@searsuite/sear-render-node';
import { Transaction } from '@searsuite/sear-domain-transaction';
import { CellProperties, SheetCellVisualReaderRegistry } from '@searsuite/sear-render-registry';
import { createInvertibleProjectedOperations, SheetDataFieldNamespace } from '@searsuite/sear-render-engine';
import { SheetCommandBus } from '@searsuite/sear-assembly-commands';
import { SheetDataPlugin } from '@searsuite/sear-render-engine';
import { DuplicateMatrix, type SheetDuplicateHighlight } from '../../DuplicateMatrix';
import { registerSheetDuplicateCommands } from './SheetDuplicateCommands';
import { SheetDuplicateFieldKey } from './SheetDuplicateDataField';

/** State owned by SheetDuplicatePlugin. */
export interface SheetDuplicatePluginState {
  /** Sparse matrix containing duplicate highlight settings. */
  duplicates: DuplicateMatrix;
}

const pluginKey = new PluginKey('SheetDuplicatePlugin');

/** Plugin that owns duplicate-highlight data and duplicate row commands. */
@Injectable()
export class SheetDuplicatePlugin extends Plugin<unknown, CellProperties, SheetDuplicatePluginState> {
  #highlightRevision = 0;
  #visibleHighlights: Set<string> | null = null;
  #visibleHighlightsRevision = -1;
  #visibleHighlightsData: unknown = null;
  #visibleHighlightsMatrix: unknown = null;
  /** Duplicate state is data-only and does not use render-depth diagnostics. */
  public override readonly warnOnDuplicateDepth = false;
  /** Duplicate-highlight transactions share the registered MatrixOT algebra. */
  public override readonly transactionOT = {
    ownerId: 'sheet.duplicate',
    definition: MatrixTransactionOT,
    relations: [MatrixTransactionOTRelation],
    collaborative: true,
  };

  /** DI token for resolving the duplicate plugin. */
  public static readonly symbol: symbol = Symbol.for('SheetDuplicatePlugin');
  /** Stable plugin key shared by all duplicate plugin instances. */
  public static readonly pluginKey = pluginKey;
  /** Document-state export contribution for duplicate highlights. */
  public static readonly documentState: PluginDocumentStateContribution<
    SheetDuplicatePluginState,
    SheetDuplicatePluginState
  > = {
    key: 'sheet.duplicates',
    capture: (state) => ({ duplicates: state.duplicates.clone() }),
    codec: {
      key: 'sheet.duplicates',
      serialize: (state) => serializeSparseMatrix(state.duplicates),
      deserialize: (payload, path) => ({
        duplicates: deserializeSparseMatrix<SheetDuplicateHighlight | null, DuplicateMatrix>(
          payload,
          DuplicateMatrix,
          path,
        ),
      }),
    },
  };

  /** SheetDuplicatePlugin owns its persisted state module. */
  public override readonly documentState = SheetDuplicatePlugin.documentState;
  /** Duplicate highlights follow direct updates and all sheet structure changes. */
  public override interestedIn: string[] = [
    MatrixOTActionName.UpdateCell,
    MatrixOTActionName.RowInsert,
    MatrixOTActionName.RowDelete,
    MatrixOTActionName.RowMove,
    MatrixOTActionName.ColInsert,
    MatrixOTActionName.ColDelete,
    MatrixOTActionName.ColMove,
  ];

  /** Constructs the plugin around a shared sparse duplicate-highlight matrix. */
  public constructor(
    state: SheetDuplicatePluginState,
    private readonly sheetData: SheetDataPlugin,
    private readonly cellCodecs: CellClipboardCodecRegistry,
    private readonly readDisplayText?: (row: number, column: number, cell: CellMatrixElement | null) => string,
    displayedValueChanges?: SheetDisplayedValueChanges,
  ) {
    super({ key: pluginKey, state });
    displayedValueChanges?.subscribe(() => { this.#highlightRevision += 1; });
  }

  /** Registers duplicate commands owned by this plugin. */
  public registerCommands(commands: SheetCommandBus): void {
    const plugin = this;
    registerSheetDuplicateCommands(commands, {
      duplicateTarget: this.key,
      sheetDataTarget: SheetDataPlugin.pluginKey,
      getRowCount: () => plugin.getState().duplicates.shape[0],
      getColumnCount: () => plugin.getState().duplicates.shape[1],
      readCell: (row, column) => plugin.sheetData.getState().sheetData.getItem(row, column),
      readCellText: (cell, row, column) => plugin.readDisplayText?.(row, column, cell) ?? plugin.cellCodecs.toPlainText(cell),
      readDisplayedText: (row, column) => {
        const cell = plugin.sheetData.getState().sheetData.getItem(row, column);
        return plugin.readDisplayText?.(row, column, cell) ?? (cell ? plugin.cellCodecs.toPlainText(cell) : '');
      },
      readDuplicateHighlight: (row, column) => plugin.getState().duplicates.getItem(row, column),
    });
  }

  /** Contributes duplicate highlights to the shared Sheet cell visual pipeline. */
  public registerCellVisualReaders(registry: SheetCellVisualReaderRegistry): void {
    const plugin = this;
    registry.registerOverride({
      id: 'sheet.duplicate.rangeMove',
      properties: ['fill'],
      priority: 100,
      read({ rowIndex, columnIndex }) {
        const fill = plugin.getState().duplicates.getItem(rowIndex, columnIndex);
        return fill != null && plugin.visibleHighlights().has(`${rowIndex}:${columnIndex}`) ? { fill } : {};
      },
    });
  }

  private visibleHighlights(): Set<string> {
    const data = this.sheetData.getState().sheetData;
    const highlights = this.getState().duplicates;
    if (this.#visibleHighlights && this.#visibleHighlightsRevision === this.#highlightRevision &&
      this.#visibleHighlightsData === data && this.#visibleHighlightsMatrix === highlights) {
      return this.#visibleHighlights;
    }
    const groups = new Map<string, string[]>();
    highlights.forEachStored((fill, row, column) => {
      const cell = data.getItem(row, column);
      if (!fill) return;
      const value = this.readDisplayText?.(row, column, cell) ?? (cell ? this.cellCodecs.toPlainText(cell) : '');
      if (!value) return;
      const key = JSON.stringify([fill, value.toLowerCase()]);
      const group = groups.get(key) ?? [];
      group.push(`${row}:${column}`);
      groups.set(key, group);
    });
    const visible = new Set<string>();
    groups.forEach((group) => { if (group.length > 1) group.forEach((key) => visible.add(key)); });
    this.#visibleHighlights = visible;
    this.#visibleHighlightsRevision = this.#highlightRevision;
    this.#visibleHighlightsData = data;
    this.#visibleHighlightsMatrix = highlights;
    return visible;
  }

  public override onTransactionCommitted(transaction: Transaction): void {
    if (transaction.pluginKey === SheetDataPlugin.pluginKey || transaction.pluginKey === this.key) {
      this.#highlightRevision += 1;
    }
  }

  /** Registers duplicate state for commands, projections, and collaboration. */
  public registerState() {
    return {
      key: this.key,
      state: this.getState(),
      dataEngine: {
        dataView: [
          {
            viewKey: SheetDataFieldNamespace,
            fieldKey: SheetDuplicateFieldKey,
            select: function selectSheetDuplicates(state: SheetDuplicatePluginState) {
              return state.duplicates;
            },
          },
        ],
      },
    };
  }

  /** Contributes this owner's cell state to atomic range moves. */
  public registerRangeMoves(registry: SheetRangeMoveRegistry): void {
    registry.register({
      id: 'sheet.duplicate',
      hasConflict: ({ source, destination }) =>
        hasMatrixRangeMoveConflict(this.getState().duplicates, source, destination),
      plan: ({ source, destination }) => [
        {
          target: this.key,
          operations: createMatrixRangeMoveOperations(this.getState().duplicates, source, destination),
        },
      ],
    });
  }

  public registerRangeReorders(registry: SheetRangeReorderRegistry): void {
    registry.register({
      id: 'sheet.duplicate.rangeReorder',
      plan: ({ range, destinationOf }) => [{
        target: this.key,
        operations: createMatrixRangeReorderOperations(this.getState().duplicates, range, destinationOf),
      }],
    });
  }

  /** Applies direct duplicate-highlight and structural matrix operations. */
  public apply(pluginState: SheetDuplicatePluginState, transaction: Transaction): SheetDuplicatePluginState | null {
    const operations = createInvertibleProjectedOperations(
      pluginState.duplicates,
      transaction.operations as Operation[],
      (matrix, operation) => createDuplicateOperation(matrix, operation, transaction.pluginKey === pluginKey),
    );
    if (operations.length === 0) return null;
    MatrixOT.apply(pluginState.duplicates, operations);
    return pluginState;
  }

  /** Duplicate state has no render-time configuration. */
  public getPluginConfig(): null {
    return null;
  }

  /** Duplicate state contributes through grid cell properties, not scene nodes. */
  public render(): Node<CellProperties>[] {
    return [];
  }
}

function createDuplicateOperation(
  matrix: CSRMatrix<SheetDuplicateHighlight | null>,
  operation: Operation,
  direct: boolean,
): MatrixOTOperation<SheetDuplicateHighlight | null> | null {
  if (isUpdateCellOperation<SheetDuplicateHighlight | null>(operation)) {
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

function readSparseRow(
  matrix: CSRMatrix<SheetDuplicateHighlight | null>,
  rowIndex: number,
): (SheetDuplicateHighlight | null)[] {
  const row: (SheetDuplicateHighlight | null)[] = Array(matrix.shape[1]).fill(null);
  matrix.forEachStoredInRow(rowIndex, (value, column) => {
    row[column] = value;
  });
  return row;
}

function readSparseColumn(
  matrix: CSRMatrix<SheetDuplicateHighlight | null>,
  columnIndex: number,
): (SheetDuplicateHighlight | null)[] {
  const column: (SheetDuplicateHighlight | null)[] = Array(matrix.shape[0]).fill(null);
  matrix.forEachStored((value, row, currentColumn) => {
    if (currentColumn === columnIndex) column[row] = value;
  });
  return column;
}
