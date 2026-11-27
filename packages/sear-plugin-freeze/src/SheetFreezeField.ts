import { SheetDataFieldNamespace } from '@searsuite/sear-domain-sheet';
import { type DataEngine } from '@searsuite/sear-domain-state';
import { SheetFreezeMatrix } from './SheetFreezeMatrix';

/** Plugin-owned data-view field for persistent freeze boundaries. */
export const SheetFreezeFieldKey = 'sheet.freeze';

/** Number of leading rows and columns kept visible while scrolling. */
export interface SheetFreezeState {
  /** Frozen row count. */
  readonly rows: number;
  /** Frozen column count. */
  readonly columns: number;
}

/** Reads freeze boundaries, returning zeroes when the plugin is absent. */
export function readSheetFreeze(dataEngine: DataEngine): SheetFreezeState {
  const matrix = dataEngine.readDataViewField<SheetFreezeMatrix>(SheetDataFieldNamespace, SheetFreezeFieldKey);
  return { rows: matrix?.getItem(0, 0) ?? 0, columns: matrix?.getItem(0, 1) ?? 0 };
}
