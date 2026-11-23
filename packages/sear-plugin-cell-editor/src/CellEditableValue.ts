import { type CellMatrixElement } from '@searsuite/sear-assembly-core';
import { CellType } from '@searsuite/sear-domain-cell-types';
import { type IFormulaSourceProvider } from '@searsuite/sear-domain-formula-engine';

/**
 * Returns the persisted source value that belongs in the editor.
 *
 * Formula results are derived, local cache data used only for display. Editing
 * must always start from the synchronised formula source instead.
 */
export function getCellEditableValue(
  cell: CellMatrixElement | null | undefined,
  coordinate?: { readonly row: number; readonly col: number },
  formulaSourceProvider?: IFormulaSourceProvider | null,
): unknown {
  if (cell?.type === CellType.Formula) {
    if (coordinate && formulaSourceProvider) {
      const source = formulaSourceProvider.getFormulaSource(coordinate.row, coordinate.col);
      if (source !== void 0) return source;
    }
    return cell.formula ?? cell.value;
  }
  return cell?.value;
}
