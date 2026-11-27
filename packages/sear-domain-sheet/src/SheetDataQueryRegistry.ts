import { type ReadSheetCellDataQuery } from './ReadSheetCellDataQuery';
import { type SheetCellDataReader } from './SheetCellDataReader';

/** Minimal query registry surface consumed by SheetDataPlugin. */
export interface SheetDataQueryRegistry {
  register(definition: typeof ReadSheetCellDataQuery, handler: (input: void) => SheetCellDataReader): () => void;
}
