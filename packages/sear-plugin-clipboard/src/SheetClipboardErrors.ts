import { SearError, type SearErrorDetails } from '@searsuite/sear-foundation-error';

/** Stable public errors raised by the sheet clipboard contract. */
export const SheetClipboardErrorCode = {
  NoSelection: 'SEAR_SHEET_CLIPBOARD_NO_SELECTION',
  InvalidPayload: 'SEAR_SHEET_CLIPBOARD_INVALID_PAYLOAD',
  TargetOutOfBounds: 'SEAR_SHEET_CLIPBOARD_TARGET_OUT_OF_BOUNDS',
  TargetIntersectsMergedCells: 'SEAR_SHEET_CLIPBOARD_TARGET_INTERSECTS_MERGED_CELLS',
  SourceIntersectsMergedCells: 'SEAR_SHEET_CLIPBOARD_SOURCE_INTERSECTS_MERGED_CELLS',
  NoVisibleRows: 'SEAR_SHEET_CLIPBOARD_NO_VISIBLE_ROWS',
  InputRejected: 'SEAR_SHEET_CLIPBOARD_INPUT_REJECTED',
} as const;

/** Supported sheet clipboard error code values. */
export type SheetClipboardErrorCode = (typeof SheetClipboardErrorCode)[keyof typeof SheetClipboardErrorCode];

/** Public error raised when a clipboard command cannot satisfy its contract. */
export class SheetClipboardError extends SearError {
  public override readonly code: SheetClipboardErrorCode;

  public constructor(code: SheetClipboardErrorCode, message: string, details: SearErrorDetails = {}) {
    super(message, details);
    this.code = code;
  }
}
