import { SheetDataFieldNamespace } from '@searsuite/sear-domain-sheet';
import { type DataEngine } from '@searsuite/sear-domain-state';
import { type SheetDemoMatrix } from './SheetDemoMatrix';

export const SheetDemoFieldKey = 'sheet.demo.markers';

export function readSheetDemoMarkers(dataEngine: DataEngine): SheetDemoMatrix | null {
  if (typeof dataEngine.readDataViewField !== 'function') return null;
  return dataEngine.readDataViewField<SheetDemoMatrix>(SheetDataFieldNamespace, SheetDemoFieldKey) ?? null;
}
