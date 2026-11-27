import { SheetDataFieldNamespace } from '@searsuite/sear-domain-sheet';
import { type DataEngine } from '@searsuite/sear-domain-state';
import { type AlignmentMatrix } from '../../AlignmentMatrix';

/** DataEngine field owned by SheetAlignmentPlugin. */
export const SheetHorizontalAlignmentFieldKey = 'sheet.alignment.horizontal';

/** Reads horizontal cell alignment published by SheetAlignmentPlugin. */
export function readSheetCellAlignments(dataEngine: DataEngine): AlignmentMatrix | null {
  if (typeof dataEngine.readDataViewField !== 'function') return null;
  return (
    dataEngine.readDataViewField<AlignmentMatrix>(SheetDataFieldNamespace, SheetHorizontalAlignmentFieldKey) ?? null
  );
}
