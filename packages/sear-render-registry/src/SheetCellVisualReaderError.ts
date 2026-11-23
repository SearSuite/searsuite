import { SearError, type SearErrorDetails } from '@searsuite/sear-foundation-error';

/** Stable failure codes exposed by SheetCellVisualReaderRegistry. */
export const SheetCellVisualReaderErrorCode = {
  DuplicateReader: 'SHEET_CELL_VISUAL_READER_DUPLICATE_READER',
  PropertyConflict: 'SHEET_CELL_VISUAL_READER_PROPERTY_CONFLICT',
  UndeclaredProperty: 'SHEET_CELL_VISUAL_READER_UNDECLARED_PROPERTY',
  InvalidPriority: 'SHEET_CELL_VISUAL_READER_INVALID_PRIORITY',
  OverrideConflict: 'SHEET_CELL_VISUAL_READER_OVERRIDE_CONFLICT',
} as const;

export type SheetCellVisualReaderErrorCode =
  (typeof SheetCellVisualReaderErrorCode)[keyof typeof SheetCellVisualReaderErrorCode];

/** Public error raised for invalid Sheet cell visual-reader contributions. */
export class SheetCellVisualReaderError extends SearError {
  public override readonly code: SheetCellVisualReaderErrorCode;

  public constructor(code: SheetCellVisualReaderErrorCode, message: string, details: SearErrorDetails = {}) {
    super(message, details);
    this.code = code;
  }
}
