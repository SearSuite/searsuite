import { type DataEngine, SheetDataFieldNamespace } from '@searsuite/sear-render-engine';
import { type SheetDemoMatrix } from './SheetDemoMatrix';

export const SheetDemoFieldKey = 'sheet.demo.markers';

export function readSheetDemoMarkers(dataEngine: DataEngine): SheetDemoMatrix | null {
  if (typeof dataEngine.readDataViewField !== 'function') return null;
  return dataEngine.readDataViewField<SheetDemoMatrix>(SheetDataFieldNamespace, SheetDemoFieldKey) ?? null;
}
