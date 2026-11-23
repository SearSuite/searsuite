/** Persistent Sheet freeze boundaries and typed command surface. @packageDocumentation */
export { SheetFreezeMatrix, type SheetFreezeMatrixData } from './SheetFreezeMatrix';
export { readSheetFreeze, SheetFreezeFieldKey, type SheetFreezeState } from './SheetFreezeField';
export { SetSheetFreezeCommand, SheetFreezeBoundaryError, createSetSheetFreezeOperations, type SheetFreezeCommandSource } from './SheetFreezeCommands';
export { SheetFreezePlugin, type SheetFreezePluginState } from './sheetPlugin/freeze/SheetFreezePlugin';
