import { type DimensionsCSRMatrix } from '@searsuite/sear-domain-matrix';
import { type Point, PositionRect } from '@searsuite/sear-foundation-rect';

/** Explicit layout inputs required to convert a sheet range to canvas coordinates. */
export interface SheetRangePositionContext {
  rowSizes: DimensionsCSRMatrix;
  columnSizes: DimensionsCSRMatrix;
  offsetX: number;
  offsetY: number;
}

/**
 * Converts an inclusive sheet cell range into a world-space canvas rectangle.
 * Returns null when the range is invalid or outside the current sheet bounds.
 */
export function getSheetRangePositionRect(
  start: Point,
  end: Point,
  context: SheetRangePositionContext,
): PositionRect<undefined> | null {
  const [startRow, startCol] = start;
  const [endRow, endCol] = end;
  const { rowSizes, columnSizes, offsetX, offsetY } = context;
  if (
    startRow < 0 ||
    startCol < 0 ||
    endRow < startRow ||
    endCol < startCol ||
    endRow >= rowSizes.shape[1] ||
    endCol >= columnSizes.shape[1]
  )
    return null;

  const left = columnSizes.getDimensionLeftBoundaryByIndex(startCol);
  const top = rowSizes.getDimensionLeftBoundaryByIndex(startRow);
  return new PositionRect<undefined>(
    left + offsetX,
    top + offsetY,
    columnSizes.getDimensionRightBoundaryByIndex(endCol) - left,
    rowSizes.getDimensionRightBoundaryByIndex(endRow) - top,
  );
}
