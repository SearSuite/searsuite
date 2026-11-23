import { type DataEngine, SheetDataFieldNamespace } from '@searsuite/sear-render-engine';
import { type VerticalAlignmentMatrix } from '../../VerticalAlignmentMatrix';

/** DataEngine field owned by SheetVerticalAlignmentPlugin. */
export const SheetVerticalAlignmentFieldKey = 'sheet.alignment.vertical';

/** Reads vertical cell alignment published by SheetVerticalAlignmentPlugin. */
export function readSheetCellVerticalAlignments(dataEngine: DataEngine): VerticalAlignmentMatrix | null {
  if (typeof dataEngine.readDataViewField !== 'function') return null;
  return (
    dataEngine.readDataViewField<VerticalAlignmentMatrix>(SheetDataFieldNamespace, SheetVerticalAlignmentFieldKey) ??
    null
  );
}
