/**
 * Sparse matrix storage, structural row and column operations, dimensions, and serialization.
 *
 * @packageDocumentation
 */

/**
 * Sear Matrix Package - Main Export Module
 *
 * This package provides a comprehensive suite of sparse matrix implementations designed
 * for efficient storage and manipulation of large, sparse datasets. It's particularly
 * optimized for spreadsheet-like applications with row/column management.
 *
 * Exported Classes:
 * - CSRMatrix: Compressed Sparse Row matrix for general sparse data
 * - DimensionsCSRMatrix: Extends CSRMatrix with dimension tracking capabilities
 * - ColumnShapeDimensionsCSRMatrix: Specialized matrix for tracking column widths
 * - RowShapeDimensionsCSRMatrix: Specialized matrix for tracking row heights
 *
 * Exported Interfaces:
 * - ISheetState: Complete state interface for spreadsheet-like structures
 *
 * Key Features:
 * - Memory-efficient sparse storage using CSR format
 * - Efficient row and column operations (add, delete, swap)
 * - Dimension tracking for visual rendering
 * - Observable state changes with listener notifications
 * - Operational Transformation (OT) support for collaborative editing
 * - Binary search-based dimension lookups for O(log n) performance
 *
 * @example
 * // Create a sparse matrix for cell data
 * const sheetData = new CSRMatrix<string>();
 * sheetData.addItem(0, 0, "Hello");
 * sheetData.addItem(1, 1, "World");
 *
 * // Track row heights and column widths
 * const rowHeights = new RowShapeDimensionsCSRMatrix();
 * const columnWidths = new ColumnShapeDimensionsCSRMatrix();
 *
 * // Get render position for column 5
 * const leftPos = columnWidths.getDimensionLeftBoundaryByIndex(5);
 * const rightPos = columnWidths.getDimensionRightBoundaryByIndex(5);
 * const width = rightPos - leftPos;
 */

export { CSRMatrix } from './CSRMatrix';

export { DimensionsCSRMatrix } from './DimensionsCSRMatrix';
export { ColumnShapeDimensionsCSRMatrix } from './ColumnShapeDimensionsCSRMatrix';
export { RowShapeDimensionsCSRMatrix } from './RowShapeDimensionsCSRMatrix';
export { MatrixSerializationError } from './MatrixSerializationError';
export {
  MatrixSerializationErrorCode,
  type MatrixSerializationErrorCode as MatrixSerializationErrorCodeValue,
} from './MatrixSerializationErrorCode';
export {
  deserializeSparseMatrix,
  serializeSparseMatrix,
  type SerializedSparseMatrix,
  type SerializedSparseMatrixEntry,
} from './SparseMatrixSerialization';

export { type ISheetState } from './interface';
export { createMatrixRangeMoveOperations, hasMatrixRangeMoveConflict, type MatrixMoveRange } from './MatrixRangeMove';
export { createMatrixRangeReorderOperations } from './MatrixRangeReorder';
