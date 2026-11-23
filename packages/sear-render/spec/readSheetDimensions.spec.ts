import {
  type DataEngine,
  SheetColumnSizesFieldKey,
  SheetDataFieldNamespace,
  SheetRowSizesFieldKey,
} from '@searsuite/sear-render-engine';
import { readSheetColumnSizes, readSheetRowSizes } from '../src/sheet/readSheetDimensions';

describe('readSheetDimensions', () => {
  it('returns null when the DataEngine field registry is unavailable or missing fields', () => {
    const withoutRegistry = {} as DataEngine;
    const missingFields = {
      readDataViewField: jest.fn((viewKey: string, fieldKey: string) => {
        expect(viewKey).toBe(SheetDataFieldNamespace);
        expect([SheetRowSizesFieldKey, SheetColumnSizesFieldKey]).toContain(fieldKey);
        return void 0;
      }),
    } as unknown as DataEngine;

    expect(readSheetRowSizes(withoutRegistry)).toBeNull();
    expect(readSheetColumnSizes(withoutRegistry)).toBeNull();
    expect(readSheetRowSizes(missingFields)).toBeNull();
    expect(readSheetColumnSizes(missingFields)).toBeNull();
  });
});
