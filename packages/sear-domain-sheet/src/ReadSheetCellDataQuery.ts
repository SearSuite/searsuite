import { type SheetCellDataReader } from './SheetCellDataReader';

/** Structural query contract kept independent from the assembly query implementation. */
interface ReadSheetCellDataQueryDefinition {
  readonly id: string;
  readonly resultMode: 'reader';
  readonly __input?: void;
  readonly __result?: SheetCellDataReader;
}

/** Reads the mounted editor's live cell matrix without creating a document snapshot. */
export const ReadSheetCellDataQuery = Object.freeze({
  id: 'sheet.data.readLiveCells',
  resultMode: 'reader',
}) as ReadSheetCellDataQueryDefinition;
