import { CSRMatrix } from './CSRMatrix';
import { ColumnShapeDimensionsCSRMatrix } from './ColumnShapeDimensionsCSRMatrix';
import { RowShapeDimensionsCSRMatrix } from './RowShapeDimensionsCSRMatrix';

/**
 * ISheetState - Interface defining the complete state of a spreadsheet-like data structure
 *
 * Represents the full state of a sheet/table with both data and layout information.
 * This interface combines three matrices:
 * 1. The actual cell data (sheetData)
 * 2. Row dimension information (row heights for rendering)
 * 3. Column dimension information (column widths for rendering)
 *
 * Used primarily in spreadsheet applications where you need to manage both
 * cell content and the visual layout (dimensions) of rows and columns.
 *
 * @template T - The type of elements stored in the sheet cells
 *
 * @example
 * const state: ISheetState<string> = {
 *   sheetData: new CSRMatrix<string>(...),
 *   rowSizes: new RowShapeDimensionsCSRMatrix(...),
 *   columnSizes: new ColumnShapeDimensionsCSRMatrix(...)
 * };
 */
export interface ISheetState<T> {
  /**
   * The main data matrix containing all cell values in the sheet.
   * Uses CSR format for efficient storage of sparse data.
   * Access: sheetData.getItem(row, col) to get a specific cell value
   */
  sheetData: CSRMatrix<T>;

  /**
   * Matrix storing row dimension values (typically row heights in pixels).
   * Single column matrix with numRows entries, one height per row.
   * Use getDimensionLeftBoundaryByIndex/getDimensionRightBoundaryByIndex for layout calculations.
   *
   * Example: RowShapeDimensionsCSRMatrix with values [30, 25, 40] means
   *   - Row 0 has height 30, positioned at y: 0-30
   *   - Row 1 has height 25, positioned at y: 30-55
   *   - Row 2 has height 40, positioned at y: 55-95
   */
  rowSizes: RowShapeDimensionsCSRMatrix;

  /**
   * Matrix storing column dimension values (typically column widths in pixels).
   * Single row matrix with numCols entries, one width per column.
   * Use getDimensionLeftBoundaryByIndex/getDimensionRightBoundaryByIndex for layout calculations.
   *
   * Example: ColumnShapeDimensionsCSRMatrix with values [100, 150, 200] means
   *   - Column 0 has width 100, positioned at x: 0-100
   *   - Column 1 has width 150, positioned at x: 100-250
   *   - Column 2 has width 200, positioned at x: 250-450
   */
  columnSizes: ColumnShapeDimensionsCSRMatrix;
}
