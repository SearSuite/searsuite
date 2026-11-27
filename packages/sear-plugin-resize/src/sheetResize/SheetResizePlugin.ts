import { registerSheetResizeDimensionCommands } from '../SheetResizeDimensionCommands';

import { SearError } from '@searsuite/sear-foundation-error';
import { Injectable } from '@searsuite/sear-foundation-di';
import { Plugin, PluginKey, type PluginDocumentStateContribution } from '@searsuite/sear-assembly-plugin';

import {
  SheetDataFieldNamespace,
  SheetColumnHiddenOriginalSizesFieldKey,
  SheetColumnSizesFieldKey,
  SheetRowHiddenOriginalSizesFieldKey,
  SheetRowSizesFieldKey,
} from '@searsuite/sear-domain-sheet';

import { SheetCommandBus } from '@searsuite/sear-assembly-commands';

import {
  MatrixOT,
  MatrixOTActionName,
  MatrixTransactionOT,
  MatrixTransactionOTRelation,
  type Operation,
} from '@searsuite/sear-domain-ot';
import {
  ColumnShapeDimensionsCSRMatrix,
  CSRMatrix,
  RowShapeDimensionsCSRMatrix,
  deserializeSparseMatrix,
  serializeSparseMatrix,
  type DimensionsCSRMatrix,
} from '@searsuite/sear-domain-matrix';

import { Transaction } from '@searsuite/sear-domain-transaction';

import { createInvertibleDimensionOperationSet, hasInvertibleDimensionOperations } from './SheetResizeOperations';

export interface SheetResizeDimensions {
  /** Row dimension matrix used for row height state. */
  rowSizes: DimensionsCSRMatrix;
  /** Column dimension matrix used for column width state. */
  columnSizes: DimensionsCSRMatrix;
  /** Original row sizes captured while rows are hidden. */
  rowHiddenOriginalSizes: CSRMatrix<number>;
  /** Original column sizes captured while columns are hidden. */
  columnHiddenOriginalSizes: CSRMatrix<number>;
}

interface ResizeState {
  dimensions: SheetResizeDimensions | null;
}

interface RowSizesDocumentState {
  rowSizes: RowShapeDimensionsCSRMatrix;
}

interface ColumnSizesDocumentState {
  columnSizes: ColumnShapeDimensionsCSRMatrix;
}

interface RowHiddenOriginalSizesDocumentState {
  rowHiddenOriginalSizes?: CSRMatrix<number>;
}

interface ColumnHiddenOriginalSizesDocumentState {
  columnHiddenOriginalSizes?: CSRMatrix<number>;
}

const key = new PluginKey('SheetResize');

/** Owns dimensions, structural reducers, semantic commands, and persistence. */
@Injectable()
export class SheetResizePlugin extends Plugin<ResizeState> {
  public static readonly symbol: symbol = Symbol.for('SheetResizePlugin');

  public static readonly pluginKey = key;

  public override readonly transactionOT = {
    ownerId: 'sheet.resize',
    definition: MatrixTransactionOT,
    relations: [MatrixTransactionOTRelation],
    collaborative: true,
  };

  public static readonly documentState = [
    {
      key: 'sheet.rowSizes',
      capture: (state: ResizeState) =>
        state.dimensions ? { rowSizes: state.dimensions.rowSizes.clone() as RowShapeDimensionsCSRMatrix } : undefined,
      codec: {
        key: 'sheet.rowSizes',
        serialize: (state: RowSizesDocumentState) => serializeSparseMatrix(state.rowSizes),
        deserialize: (payload, path) => ({
          rowSizes: deserializeSparseMatrix<number, RowShapeDimensionsCSRMatrix>(
            payload,
            RowShapeDimensionsCSRMatrix,
            path,
          ),
        }),
      },
    },
    {
      key: 'sheet.columnSizes',
      capture: (state: ResizeState) =>
        state.dimensions
          ? { columnSizes: state.dimensions.columnSizes.clone() as ColumnShapeDimensionsCSRMatrix }
          : undefined,
      codec: {
        key: 'sheet.columnSizes',
        serialize: (state: ColumnSizesDocumentState) => serializeSparseMatrix(state.columnSizes),
        deserialize: (payload, path) => ({
          columnSizes: deserializeSparseMatrix<number, ColumnShapeDimensionsCSRMatrix>(
            payload,
            ColumnShapeDimensionsCSRMatrix,
            path,
          ),
        }),
      },
    },
    {
      key: 'sheet.rowHiddenOriginalSizes',
      capture: (state: ResizeState) =>
        state.dimensions ? { rowHiddenOriginalSizes: state.dimensions.rowHiddenOriginalSizes.clone() } : undefined,
      codec: {
        key: 'sheet.rowHiddenOriginalSizes',
        serialize: (state: RowHiddenOriginalSizesDocumentState) =>
          state.rowHiddenOriginalSizes === void 0 ? void 0 : serializeSparseMatrix(state.rowHiddenOriginalSizes),
        deserialize: (payload, path) => ({
          rowHiddenOriginalSizes: deserializeSparseMatrix<number, CSRMatrix<number>>(payload, CSRMatrix, path),
        }),
      },
    },
    {
      key: 'sheet.columnHiddenOriginalSizes',
      capture: (state: ResizeState) =>
        state.dimensions
          ? { columnHiddenOriginalSizes: state.dimensions.columnHiddenOriginalSizes.clone() }
          : undefined,
      codec: {
        key: 'sheet.columnHiddenOriginalSizes',
        serialize: (state: ColumnHiddenOriginalSizesDocumentState) =>
          state.columnHiddenOriginalSizes === void 0 ? void 0 : serializeSparseMatrix(state.columnHiddenOriginalSizes),
        deserialize: (payload, path) => ({
          columnHiddenOriginalSizes: deserializeSparseMatrix<number, CSRMatrix<number>>(payload, CSRMatrix, path),
        }),
      },
    },
  ] satisfies readonly PluginDocumentStateContribution<ResizeState, object>[];

  public override readonly documentState = SheetResizePlugin.documentState;

  public override interestedIn: string[] = [
    MatrixOTActionName.ResizeRow,
    MatrixOTActionName.ResizeCol,
    MatrixOTActionName.RowInsert,
    MatrixOTActionName.RowDelete,
    MatrixOTActionName.RowMove,
    MatrixOTActionName.ColInsert,
    MatrixOTActionName.ColDelete,
    MatrixOTActionName.ColMove,
  ];

  public apply(pluginState: ResizeState, transaction: Transaction): ResizeState | null {
    const operationSet = createInvertibleDimensionOperationSet(
      pluginState.dimensions,
      transaction.operations as Operation[],
    );
    if (!operationSet || !hasInvertibleDimensionOperations(operationSet)) return null;

    const dimensions = pluginState.dimensions;
    if (!dimensions) return null;
    if (operationSet.rowSizes.length > 0) MatrixOT.apply(dimensions.rowSizes, operationSet.rowSizes);
    if (operationSet.columnSizes.length > 0) MatrixOT.apply(dimensions.columnSizes, operationSet.columnSizes);
    if (operationSet.rowHiddenOriginalSizes.length > 0) {
      MatrixOT.apply(dimensions.rowHiddenOriginalSizes, operationSet.rowHiddenOriginalSizes);
    }
    if (operationSet.columnHiddenOriginalSizes.length > 0) {
      MatrixOT.apply(dimensions.columnHiddenOriginalSizes, operationSet.columnHiddenOriginalSizes);
    }

    return pluginState;
  }

  public registerState() {
    const state = this.getState();
    return [
      {
        key: this.key,
        state,
        dataEngine: {
          dataView: [
            {
              viewKey: SheetDataFieldNamespace,
              fieldKey: SheetRowSizesFieldKey,
              select: function selectSheetRowSizes(resizeState: ResizeState) {
                return resizeState.dimensions?.rowSizes;
              },
            },
            {
              viewKey: SheetDataFieldNamespace,
              fieldKey: SheetColumnSizesFieldKey,
              select: function selectSheetColumnSizes(resizeState: ResizeState) {
                return resizeState.dimensions?.columnSizes;
              },
            },
            {
              viewKey: SheetDataFieldNamespace,
              fieldKey: SheetRowHiddenOriginalSizesFieldKey,
              select: function selectSheetRowHiddenOriginalSizes(resizeState: ResizeState) {
                return resizeState.dimensions?.rowHiddenOriginalSizes;
              },
            },
            {
              viewKey: SheetDataFieldNamespace,
              fieldKey: SheetColumnHiddenOriginalSizesFieldKey,
              select: function selectSheetColumnHiddenOriginalSizes(resizeState: ResizeState) {
                return resizeState.dimensions?.columnHiddenOriginalSizes;
              },
            },
          ],
        },
      },
    ];
  }
  public constructor(dimensions: SheetResizeDimensions) {
    super({ key, state: { dimensions } });
  }

  public registerCommands(commands: SheetCommandBus): void {
    const dimensions = () => {
      const value = this.getState().dimensions;
      if (!value) throw new SearError('Sheet dimensions are unavailable.');
      return value;
    };
    registerSheetResizeDimensionCommands(commands, {
      target: this.key,
      getRowCount: () => dimensions().rowSizes.shape[1],
      getColumnCount: () => dimensions().columnSizes.shape[1],
      getDefaultRowSize: () => dimensions().rowSizes.getDefaultValue() ?? 24,
      getDefaultColumnSize: () => dimensions().columnSizes.getDefaultValue() ?? 80,
      readRowSize: (index) => dimensions().rowSizes.getItem(0, index) ?? dimensions().rowSizes.getDefaultValue() ?? 24,
      readColumnSize: (index) =>
        dimensions().columnSizes.getItem(0, index) ?? dimensions().columnSizes.getDefaultValue() ?? 80,
      readRowHiddenOriginalSize: (index) => dimensions().rowHiddenOriginalSizes.getItem(0, index),
      readColumnHiddenOriginalSize: (index) => dimensions().columnHiddenOriginalSizes.getItem(0, index),
    });
  }
}
