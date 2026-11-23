import { type DimensionsCSRMatrix } from '@searsuite/sear-domain-matrix';
import { type FixedRowMatrix } from '@searsuite/sear-plugin-fixed-row';

/** Returns frozen prefix indices that can actually occupy the viewport. */
export function visibleFrozenIndices(count: number, sizes: DimensionsCSRMatrix, viewportSize: number): number[] {
  if (count <= 0 || viewportSize <= 0) return [];
  let last = count - 1;
  try {
    last = Math.min(last, sizes.getRightBoundaryColIndexByDimension(viewportSize));
  } catch {
    last = Math.min(last, sizes.shape[1] - 1);
  }
  return Array.from({ length: Math.max(0, last + 1) }, (_, index) => index);
}

/** Fixed rows join the top stack only after the scrolling viewport passes their original position. */
export function activeFixedRowOffsets(
  fixedRows: FixedRowMatrix | null,
  rowSizes: DimensionsCSRMatrix,
  scrollY: number,
  frozenRows: number,
  offsetY: number,
): Map<number, number> {
  const offsets = new Map<number, number>();
  const frozenHeight = rowSizes.getDimensionLeftBoundaryByIndex(frozenRows);
  let nextTop = offsetY + frozenHeight;
  fixedRows?.forEachStored((fixed, _matrixRow, row) => {
    if (fixed !== true || row < frozenRows) return;
    const rowTop = rowSizes.getDimensionLeftBoundaryByIndex(row);
    if (rowTop > scrollY + frozenHeight) return;
    const height = rowSizes.getItem(0, row) || 0;
    if (height <= 0) return;
    offsets.set(row, nextTop);
    nextTop += height;
  });
  return offsets;
}
