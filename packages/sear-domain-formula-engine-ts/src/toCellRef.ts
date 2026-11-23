import { columnIndexToLabel } from '@searsuite/sear-foundation-utils';

/** Converts zero-based coordinates to A1 notation. */
export function toCellRef(row: number, col: number, absRow: boolean = false, absCol: boolean = false): string {
  return `${absCol ? '$' : ''}${columnIndexToLabel(col)}${absRow ? '$' : ''}${row + 1}`;
}
