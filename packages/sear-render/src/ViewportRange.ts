import type { DimensionsCSRMatrix } from '@searsuite/sear-domain-matrix';
import type { ScrollManager } from '@searsuite/sear-render-scroll';

/**
 * Computed visible row/column range within the current viewport.
 * Used as a cross-cutting concern by render plugins to avoid
 * iterating the entire sheet when only a small portion is visible.
 *
 * Example: 10,000 rows × 100 cols → only ~40 rows × ~20 cols
 * are visible at once. Computing the range costs O(log n) via
 * binary search in DimensionsCSRMatrix, then the render loop
 * iterates only the visible slice — O(visible) instead of O(total).
 */
export interface ViewportRange {
  startCol: number;
  endCol: number;
  startRow: number;
  endRow: number;
}

/**
 * Compute the visible row/column range from the current scroll state
 * and the dimension matrices (row heights / column widths).
 *
 * Includes a 1-cell buffer on each side to avoid pop-in artifacts at
 * the edges when scrolling quickly.
 *
 * @param scrollManager  The scroll manager that holds viewport + scroll position
 * @param rowSizes       Row dimension matrix (heights with cumulative boundary lookups)
 * @param columnSizes    Column dimension matrix (widths with cumulative boundary lookups)
 * @param offset         Render offset (e.g. frozen header offsets), added to viewport origin
 */
export function computeViewportRange(
  scrollManager: ScrollManager,
  rowSizes: DimensionsCSRMatrix,
  columnSizes: DimensionsCSRMatrix,
  offset: { x: number; y: number } = { x: 0, y: 0 },
): ViewportRange {
  const state = scrollManager.getState();
  const [canvasWidth, canvasHeight] = scrollManager.getShape();

  const totalRows = rowSizes.shape[1];
  const totalCols = columnSizes.shape[1];

  // Viewport bounds in world coordinates
  const viewLeft = state.x + offset.x;
  const viewTop = state.y + offset.y;
  const viewRight = viewLeft + canvasWidth;
  const viewBottom = viewTop + canvasHeight;

  // Find the first visible column (left edge <= viewRight)
  let startCol = 0;
  if (viewLeft > 0 && totalCols > 0) {
    try {
      startCol = columnSizes.getLeftBoundaryColIndexByDimension(viewLeft);
      // Buffer: include one column before for smooth scroll-in
      if (startCol > 0) startCol--;
    } catch {
      startCol = 0;
    }
  }

  // Find the last visible column (right edge >= viewLeft)
  let endCol = totalCols - 1;
  if (viewRight > 0 && totalCols > 0) {
    try {
      endCol = columnSizes.getRightBoundaryColIndexByDimension(viewRight);
      // Buffer: include one column after
      if (endCol < totalCols - 1) endCol++;
    } catch {
      endCol = totalCols - 1;
    }
  }

  // Find the first visible row
  let startRow = 0;
  if (viewTop > 0 && totalRows > 0) {
    try {
      startRow = rowSizes.getLeftBoundaryColIndexByDimension(viewTop);
      if (startRow > 0) startRow--;
    } catch {
      startRow = 0;
    }
  }

  // Find the last visible row
  let endRow = totalRows - 1;
  if (viewBottom > 0 && totalRows > 0) {
    try {
      endRow = rowSizes.getRightBoundaryColIndexByDimension(viewBottom);
      if (endRow < totalRows - 1) endRow++;
    } catch {
      endRow = totalRows - 1;
    }
  }

  return { startCol, endCol, startRow, endRow };
}
