import { type CSRMatrix, type DimensionsCSRMatrix } from '@searsuite/sear-domain-matrix';
import { type DataEngine } from '@searsuite/sear-domain-state';
import { SheetDataFieldNamespace } from './SheetDataView';
import { SheetRowVisibilityFieldKey, VisibleRowDimensions, type SheetRowVisibility } from './SheetRowVisibility';

const visibleRows = new WeakMap<DimensionsCSRMatrix, WeakMap<SheetRowVisibility, VisibleRowDimensions>>();

/** DataEngine field for row dimensions owned by SheetResizePlugin. */
export const SheetRowSizesFieldKey = 'sheet.resize.rowSizes';
/** DataEngine field for column dimensions owned by SheetResizePlugin. */
export const SheetColumnSizesFieldKey = 'sheet.resize.columnSizes';
/** DataEngine field for original dimensions of hidden rows owned by SheetResizePlugin. */
export const SheetRowHiddenOriginalSizesFieldKey = 'sheet.resize.rowHiddenOriginalSizes';
/** DataEngine field for original dimensions of hidden columns owned by SheetResizePlugin. */
export const SheetColumnHiddenOriginalSizesFieldKey = 'sheet.resize.columnHiddenOriginalSizes';

/** Reads row dimensions published by SheetResizePlugin. */
export function readSheetRowSizes(dataEngine: DataEngine): DimensionsCSRMatrix | null {
  if (typeof dataEngine.readDataViewField !== 'function') return null;
  const source = readSheetRawRowSizes(dataEngine);
  if (!source) return null;
  const visibility = dataEngine.readDataViewField<SheetRowVisibility>(
    SheetDataFieldNamespace,
    SheetRowVisibilityFieldKey,
  );
  if (!visibility?.active) return source;
  let byVisibility = visibleRows.get(source);
  if (!byVisibility) {
    byVisibility = new WeakMap();
    visibleRows.set(source, byVisibility);
  }
  let projection = byVisibility.get(visibility);
  if (!projection) {
    projection = new VisibleRowDimensions(source, visibility);
    byVisibility.set(visibility, projection);
  }
  return projection;
}

/** Reads the resize owner's stored row heights, without presentation visibility. */
export function readSheetRawRowSizes(dataEngine: DataEngine): DimensionsCSRMatrix | null {
  if (typeof dataEngine.readDataViewField !== 'function') return null;
  return dataEngine.readDataViewField<DimensionsCSRMatrix>(SheetDataFieldNamespace, SheetRowSizesFieldKey) ?? null;
}

/** Reads column dimensions published by SheetResizePlugin. */
export function readSheetColumnSizes(dataEngine: DataEngine): DimensionsCSRMatrix | null {
  if (typeof dataEngine.readDataViewField !== 'function') return null;
  return dataEngine.readDataViewField<DimensionsCSRMatrix>(SheetDataFieldNamespace, SheetColumnSizesFieldKey) ?? null;
}

/** Reads original row sizes captured while rows are hidden. */
export function readSheetRowHiddenOriginalSizes(dataEngine: DataEngine): CSRMatrix<number> | null {
  if (typeof dataEngine.readDataViewField !== 'function') return null;
  return (
    dataEngine.readDataViewField<CSRMatrix<number>>(SheetDataFieldNamespace, SheetRowHiddenOriginalSizesFieldKey) ??
    null
  );
}

/** Reads original column sizes captured while columns are hidden. */
export function readSheetColumnHiddenOriginalSizes(dataEngine: DataEngine): CSRMatrix<number> | null {
  if (typeof dataEngine.readDataViewField !== 'function') return null;
  return (
    dataEngine.readDataViewField<CSRMatrix<number>>(SheetDataFieldNamespace, SheetColumnHiddenOriginalSizesFieldKey) ??
    null
  );
}
