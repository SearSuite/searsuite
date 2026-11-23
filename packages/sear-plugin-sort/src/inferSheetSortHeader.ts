import { CellType, type CellMatrixElement } from '@searsuite/sear-domain-cell-types';
import type { CSRMatrix } from '@searsuite/sear-domain-matrix';
import type { SheetSortRangeInput } from './SheetSortTypes';

/** Recognizes a text header when a column switches to numeric records below it. */
export function inferSheetSortHeader(
  matrix: Pick<CSRMatrix<CellMatrixElement>, 'getItem'>,
  range: SheetSortRangeInput['range'],
): boolean {
  const [firstRow, firstColumn] = range.start;
  if (range.end[0] - firstRow < 2) return false;
  let hasNumericDataColumn = false;
  for (let column = firstColumn; column <= range.end[1]; column += 1) {
    const headerType = matrix.getItem(firstRow, column)?.type;
    if (headerType !== CellType.String && headerType !== CellType.RichText) return false;
    if (matrix.getItem(firstRow + 1, column)?.type === CellType.Number) hasNumericDataColumn = true;
  }
  return hasNumericDataColumn;
}
