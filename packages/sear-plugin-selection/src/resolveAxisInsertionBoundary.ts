import { type DimensionsCSRMatrix } from '@searsuite/sear-domain-matrix';

/** Resolves the closest insertion edge, including both outer sheet boundaries. */
export function resolveAxisInsertionBoundary(dimensions: DimensionsCSRMatrix, coordinate: number): number {
  const size = dimensions.shape[1];
  if (coordinate <= 0) return 0;
  if (coordinate >= dimensions.getDimensionRightBoundaryByIndex(size - 1)) return size;
  const index = dimensions.getRightBoundaryColIndexByDimension(coordinate);
  const left = dimensions.getDimensionLeftBoundaryByIndex(index);
  const right = dimensions.getDimensionRightBoundaryByIndex(index);
  return coordinate < (left + right) / 2 ? index : index + 1;
}
