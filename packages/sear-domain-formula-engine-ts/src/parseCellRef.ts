import { columnLabelToIndex } from '@searsuite/sear-foundation-utils';
import { type ParsedCellRef } from './ParsedCellRef';

/** Parses an A1-notation cell reference. */
export function parseCellRef(ref: string): ParsedCellRef {
  let index = 0;
  let absCol = false;
  let absRow = false;
  if (ref[index] === '$') {
    absCol = true;
    index++;
  }
  let columnLabel = '';
  while (index < ref.length && /[A-Za-z]/.test(ref[index])) columnLabel += ref[index++];
  const col = columnLabelToIndex(columnLabel);
  if (index < ref.length && ref[index] === '$') {
    absRow = true;
    index++;
  }
  let rowText = '';
  while (index < ref.length && /[0-9]/.test(ref[index])) rowText += ref[index++];
  return { row: parseInt(rowText, 10) - 1, col, absRow, absCol };
}
