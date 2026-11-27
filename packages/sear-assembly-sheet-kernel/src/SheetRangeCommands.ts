import { SearError } from '@searsuite/sear-foundation-error';
import { type SheetCellInputValidationRegistry } from '@searsuite/sear-domain-cell-types';
import {
  registerSheetRangeCommands,
  type SheetCommandBus,
  type SheetRangeCommandDataSource,
} from '@searsuite/sear-assembly-commands';
import { SheetDataPlugin } from '@searsuite/sear-plugin-sheet-data';
import {
  readSheetDataMatrix,
  readSheetRowVisibility,
  type SheetMatrix,
  type CellMatrixElement,
} from '@searsuite/sear-domain-sheet';
import { type DataEngine } from '@searsuite/sear-domain-state';

/** Registers public range editing commands for the default sheet assembly. */
export function registerDefaultSheetRangeCommands(
  commands: SheetCommandBus,
  dataEngine: DataEngine,
  inputValidation: SheetCellInputValidationRegistry,
): void {
  registerSheetRangeCommands(commands, createSheetRangeCommandDataSource(dataEngine, inputValidation));
}

function createSheetRangeCommandDataSource(
  dataEngine: DataEngine,
  inputValidation: SheetCellInputValidationRegistry,
): SheetRangeCommandDataSource<CellMatrixElement> {
  return {
    target: SheetDataPlugin.pluginKey,
    getRowCount(): number {
      return readRequiredSheetDataMatrix(dataEngine).shape[0];
    },
    getColumnCount(): number {
      return readRequiredSheetDataMatrix(dataEngine).shape[1];
    },
    readCell(row: number, column: number): CellMatrixElement | null {
      return readRequiredSheetDataMatrix(dataEngine).getItem(row, column);
    },
    includeCell: (row) => {
      const visibility = readSheetRowVisibility(dataEngine);
      return !visibility?.active || !visibility.isRowFiltered(row);
    },
    validateClearCell: (row, column) => inputValidation.validateClear(row, column),
  };
}

function readRequiredSheetDataMatrix(dataEngine: DataEngine): SheetMatrix {
  const sheetData = readSheetDataMatrix(dataEngine);
  if (!sheetData) throw new SearError('Sheet range command cannot read SheetDataPlugin matrix.');
  return sheetData;
}
