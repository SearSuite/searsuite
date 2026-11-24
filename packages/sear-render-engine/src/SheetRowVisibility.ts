import { DimensionsCSRMatrix } from '@searsuite/sear-domain-matrix';
import { type DataEngine } from './DataEngine';
import { SheetDataFieldNamespace } from './SheetDataView';

const rowProjection = new WeakMap<VisibleRowDimensions, { source: DimensionsCSRMatrix; visibility: SheetRowVisibility }>();
const visibleRowMapCache = new WeakMap<VisibleRowDimensions, { map: number[]; version: number }>();

/** A Sheet presentation contribution that can suppress rows without changing their stored heights. */
export interface SheetRowVisibility {
  readonly active: boolean;
  readonly version: number;
  isRowFiltered(row: number): boolean;
}

/** Neutral field contract re-exported by the plugin that owns the contribution. */
export const SheetRowVisibilityFieldKey = 'sheet.filter.rowVisibility';

/** Reads the optional row visibility projection published by the filter owner. */
export function readSheetRowVisibility(dataEngine: DataEngine): SheetRowVisibility | null {
  return dataEngine.readDataViewField<SheetRowVisibility>(SheetDataFieldNamespace, SheetRowVisibilityFieldKey) ?? null;
}

/** Dimension view shared by layout, hit testing, and rendering. */
export class VisibleRowDimensions extends DimensionsCSRMatrix {
  public constructor(
    source: DimensionsCSRMatrix,
    visibility: SheetRowVisibility,
  ) {
    super(void 0, [...source.shape] as [number, number]);
    rowProjection.set(this, { source, visibility });
    source.addListener(() => { visibleRowMapCache.delete(this); });
  }

  public override getItem(row: number, column: number): number | null {
    const { source, visibility } = rowProjection.get(this)!;
    const size = source.getItem(row, column);
    return visibility.isRowFiltered(column) ? 0 : size;
  }

  public override getDefaultValue(): number | undefined {
    return rowProjection.get(this)!.source.getDefaultValue();
  }

  public override getDimensionsMap(): number[] {
    const { visibility } = rowProjection.get(this)!;
    const cached = visibleRowMapCache.get(this);
    if (cached && cached.version === visibility.version) return cached.map;
    const result = new Array<number>(this.shape[1]);
    let position = 0;
    for (let row = 0; row < result.length; row += 1) {
      position += this.getItem(0, row) ?? 0;
      result[row] = position;
    }
    Object.freeze(result);
    visibleRowMapCache.set(this, { map: result, version: visibility.version });
    return result;
  }
}
