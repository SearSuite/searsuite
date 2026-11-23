import { type CellFormatMatrix } from '../../CellFormatMatrix';

/** State exclusively owned by SheetCellFormatPlugin. */
export interface SheetCellFormatPluginState {
  readonly cellFormats: CellFormatMatrix;
}
