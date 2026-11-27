import { CSRMatrix } from '@searsuite/sear-domain-matrix';
import { type CellMatrixElement } from '@searsuite/sear-domain-cell-types';

export type { CellMatrixElement } from '@searsuite/sear-domain-cell-types';

/** SheetMatrix public API. */
export class SheetMatrix extends CSRMatrix<CellMatrixElement> {
  /** Copies stored cell payloads as well as sparse indexes. */
  public override clone(): this {
    const copy = super.clone();
    copy.data = this.data.map(cloneCellMatrixElement);
    return copy;
  }
}

/** Isolates serializable cell payloads from callers holding an earlier value. */
export function cloneCellMatrixElement<T>(value: T): T {
  if (Array.isArray(value)) return value.map(cloneCellMatrixElement) as T;
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneCellMatrixElement(entry)])) as T;
}
