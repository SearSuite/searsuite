import { SearError } from '@searsuite/sear-foundation-error';
import { type SheetStructureMoveRegistry } from '@searsuite/sear-assembly-plugin';
import {
  registerSheetStructureCommands,
  type SheetStructureCommandDataSource,
  type SheetCommandBus,
} from '@searsuite/sear-assembly-commands';
import {
  type DataEngine,
  readDenseColumn,
  readDenseRow,
  readSheetDataMatrix,
  SheetDataPlugin,
  type SheetMatrix,
  type CellMatrixElement,
} from '@searsuite/sear-render-engine';

/** Registers public row/column insertion and deletion commands for the default sheet assembly. */
export function registerDefaultSheetStructureCommands(
  commands: SheetCommandBus,
  dataEngine: DataEngine,
  moves: SheetStructureMoveRegistry,
): void {
  registerSheetStructureCommands(commands, createSheetStructureCommandDataSource(dataEngine), moves);
}

function createSheetStructureCommandDataSource(
  dataEngine: DataEngine,
): SheetStructureCommandDataSource<CellMatrixElement> {
  return {
    target: SheetDataPlugin.pluginKey,
    getRowCount(): number {
      return readRequiredSheetDataMatrix(dataEngine).shape[0];
    },
    getColumnCount(): number {
      return readRequiredSheetDataMatrix(dataEngine).shape[1];
    },
    readRow(index: number): Array<CellMatrixElement | null> {
      return readDenseRow(readRequiredSheetDataMatrix(dataEngine), index);
    },
    readColumn(index: number): Array<CellMatrixElement | null> {
      return readDenseColumn(readRequiredSheetDataMatrix(dataEngine), index);
    },
  };
}

function readRequiredSheetDataMatrix(dataEngine: DataEngine): SheetMatrix {
  const sheetData = readSheetDataMatrix(dataEngine);
  if (!sheetData) throw new SearError('Sheet structure command cannot read SheetDataPlugin matrix.');
  return sheetData;
}
