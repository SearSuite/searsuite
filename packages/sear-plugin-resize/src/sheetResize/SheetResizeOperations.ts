import {
  MatrixOT,
  MatrixOTActionName,
  createDeleteColOTOperation,
  createInsertColOTOperation,
  createMoveColOTOperation,
  createResizeColOTOperation,
  createResizeRowOTOperation,
  createUpdateCellOTOperation,
  isMatrixStructureOperation,
  isResizeColOperation,
  isResizeRowOperation,
  type MatrixOTOperation,
  type Operation,
  type ResizeColOTOperation,
  type ResizeRowOTOperation,
} from '@searsuite/sear-domain-ot';
import { CSRMatrix, type DimensionsCSRMatrix } from '@searsuite/sear-domain-matrix';

import type { SheetResizeDimensions } from './SheetResizePlugin';

interface InvertibleDimensionOperationSet {
  rowSizes: MatrixOTOperation<number>[];
  columnSizes: MatrixOTOperation<number>[];
  rowHiddenOriginalSizes: MatrixOTOperation<number>[];
  columnHiddenOriginalSizes: MatrixOTOperation<number>[];
}

/** Returns whether any dimension matrix has work to apply or roll back. */
export function hasInvertibleDimensionOperations(operationSet: InvertibleDimensionOperationSet): boolean {
  return Object.values(operationSet).some((operations) => operations.length > 0);
}

/**
 * Builds invertible operation lists for every resize-owned matrix projection.
 * @param state - Dimension state before the transaction applies.
 * @param operations - Source transaction operations.
 * @returns Operation lists grouped by matrix projection, or null when dimensions are not configured.
 */
export function createInvertibleDimensionOperationSet(
  state: SheetResizeDimensions | null,
  operations: Operation[],
): InvertibleDimensionOperationSet | null {
  if (!state) return null;
  return {
    rowSizes: createInvertibleDimensionOperations(state.rowSizes, operations, 'row'),
    columnSizes: createInvertibleDimensionOperations(state.columnSizes, operations, 'column'),
    rowHiddenOriginalSizes: createInvertibleHiddenOriginalSizeOperations(
      state.rowHiddenOriginalSizes,
      state.rowSizes,
      operations,
      'row',
    ),
    columnHiddenOriginalSizes: createInvertibleHiddenOriginalSizeOperations(
      state.columnHiddenOriginalSizes,
      state.columnSizes,
      operations,
      'column',
    ),
  };
}

function createInvertibleDimensionOperations(
  matrix: DimensionsCSRMatrix,
  operations: Operation[],
  axis: 'row' | 'column',
): MatrixOTOperation<number>[] {
  const snapshot = matrix.clone();
  const invertibleOperations: MatrixOTOperation<number>[] = [];
  operations.forEach((operation) => {
    let invertibleOperation: MatrixOTOperation<number> | null = null;
    if (axis === 'row' && isResizeRowOperation(operation)) {
      invertibleOperation = createSparseResizeRowOperation(snapshot, operation);
    } else if (axis === 'column' && isResizeColOperation(operation)) {
      invertibleOperation = createSparseResizeColOperation(snapshot, operation);
    } else invertibleOperation = createInvertibleDimensionStructureOperation(snapshot, operation, axis);
    if (!invertibleOperation) return;
    invertibleOperations.push(invertibleOperation);
    MatrixOT.apply(snapshot, [invertibleOperation]);
  });
  return invertibleOperations;
}

function createInvertibleDimensionStructureOperation(
  matrix: CSRMatrix<number>,
  operation: Operation,
  axis: 'row' | 'column',
): MatrixOTOperation<number> | null {
  if (!isMatrixStructureOperation(operation)) return null;
  if (axis === 'row') {
    if (MatrixOTActionName.RowInsert in operation && operation.ri !== void 0) {
      return createInsertColOTOperation<number>(operation.p, [null]);
    }
    if (MatrixOTActionName.RowDelete in operation && operation.rd !== void 0) {
      return createDeleteColOTOperation(operation.p, [
        toSparseDimensionValue(matrix, matrix.getItem(0, operation.p[0])),
      ]);
    }
    if (MatrixOTActionName.RowMove in operation && operation.rm !== void 0) {
      return createMoveColOTOperation(operation.p, operation.rm);
    }
  } else {
    if (MatrixOTActionName.ColInsert in operation && operation.ci !== void 0) {
      return createInsertColOTOperation<number>(operation.p, [null]);
    }
    if (MatrixOTActionName.ColDelete in operation && operation.cd !== void 0) {
      return createDeleteColOTOperation(operation.p, [
        toSparseDimensionValue(matrix, matrix.getItem(0, operation.p[0])),
      ]);
    }
    if (MatrixOTActionName.ColMove in operation && operation.cm !== void 0) {
      return createMoveColOTOperation(operation.p, operation.cm);
    }
  }
  return null;
}

function createSparseResizeRowOperation(
  matrix: DimensionsCSRMatrix,
  operation: ResizeRowOTOperation,
): MatrixOTOperation<number> {
  const currentValue = matrix.getItem(0, operation.p[0]);
  const previousValue = operation.rr.prev === void 0 ? currentValue : operation.rr.prev;
  return createResizeRowOTOperation(
    operation.p,
    toSparseDimensionValue(matrix, operation.rr.value),
    toSparseDimensionValue(matrix, previousValue),
  );
}

function createSparseResizeColOperation(
  matrix: DimensionsCSRMatrix,
  operation: ResizeColOTOperation,
): MatrixOTOperation<number> {
  const currentValue = matrix.getItem(0, operation.p[0]);
  const previousValue = operation.rc.prev === void 0 ? currentValue : operation.rc.prev;
  return createResizeColOTOperation(
    operation.p,
    toSparseDimensionValue(matrix, operation.rc.value),
    toSparseDimensionValue(matrix, previousValue),
  );
}

function toSparseDimensionValue(matrix: CSRMatrix<number>, value: number | null): number | null {
  return value !== null && value === matrix.getDefaultValue() ? null : value;
}

function createInvertibleHiddenOriginalSizeOperations(
  hiddenMatrix: CSRMatrix<number>,
  sizeMatrix: DimensionsCSRMatrix,
  operations: Operation[],
  axis: 'row' | 'column',
): MatrixOTOperation<number>[] {
  const hiddenSnapshot = hiddenMatrix.clone();
  const sizeSnapshot = sizeMatrix.clone();
  const invertibleOperations: MatrixOTOperation<number>[] = [];

  operations.forEach((operation) => {
    const sizeOperation =
      axis === 'row' && isResizeRowOperation(operation)
        ? operation
        : axis === 'column' && isResizeColOperation(operation)
        ? operation
        : createInvertibleDimensionStructureOperation(sizeSnapshot, operation, axis);

    if (axis === 'row' && isResizeRowOperation(operation)) {
      appendHiddenOriginalSizeOperation(
        hiddenSnapshot,
        invertibleOperations,
        operation.p[0],
        operation.rr.value,
        operation.rr.prev === void 0 ? sizeSnapshot.getItem(0, operation.p[0]) : operation.rr.prev,
      );
      MatrixOT.apply(sizeSnapshot, [operation]);
      return;
    }

    if (axis === 'column' && isResizeColOperation(operation)) {
      appendHiddenOriginalSizeOperation(
        hiddenSnapshot,
        invertibleOperations,
        operation.p[0],
        operation.rc.value,
        operation.rc.prev === void 0 ? sizeSnapshot.getItem(0, operation.p[0]) : operation.rc.prev,
      );
      MatrixOT.apply(sizeSnapshot, [operation]);
      return;
    }

    const hiddenStructureOperation = createInvertibleDimensionStructureOperation(hiddenSnapshot, operation, axis);
    if (!hiddenStructureOperation || !sizeOperation) return;
    invertibleOperations.push(hiddenStructureOperation);
    MatrixOT.apply(hiddenSnapshot, [hiddenStructureOperation]);
    MatrixOT.apply(sizeSnapshot, [sizeOperation]);
  });

  return invertibleOperations;
}

function appendHiddenOriginalSizeOperation(
  hiddenSnapshot: CSRMatrix<number>,
  destination: MatrixOTOperation<number>[],
  index: number,
  nextSize: number | null,
  originalSize: number | null,
): void {
  const prevHidden = hiddenSnapshot.getItem(0, index);
  if (nextSize === 0 && originalSize !== null && originalSize > 0) {
    const hiddenOperation = createUpdateCellOTOperation([0, index], originalSize, prevHidden);
    destination.push(hiddenOperation);
    MatrixOT.apply(hiddenSnapshot, [hiddenOperation]);
  } else if (nextSize !== 0 && prevHidden !== null) {
    const hiddenOperation = createUpdateCellOTOperation([0, index], null, prevHidden);
    destination.push(hiddenOperation);
    MatrixOT.apply(hiddenSnapshot, [hiddenOperation]);
  }
}
