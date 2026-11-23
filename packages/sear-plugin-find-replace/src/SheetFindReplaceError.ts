import { SearError, type SearErrorDetails } from '@searsuite/sear-foundation-error';

/** Stable failure categories for Sheet find and replace. */
export const SheetFindReplaceErrorCode = {
  InvalidRange: 'SHEET_FIND_INVALID_RANGE',
  InvalidRichText: 'SHEET_FIND_INVALID_RICH_TEXT',
  CrossBlockReplacement: 'SHEET_FIND_CROSS_BLOCK_REPLACEMENT',
  InvalidPage: 'SHEET_FIND_INVALID_PAGE',
  StaleResults: 'SHEET_FIND_STALE_RESULTS',
  CalculatedResult: 'SHEET_FIND_CALCULATED_RESULT',
  CoveredMergeCell: 'SHEET_FIND_COVERED_MERGE_CELL',
  InvalidReplacement: 'SHEET_FIND_INVALID_REPLACEMENT',
} as const;

/** Public code union for diagnostic find/replace failures. */
export type SheetFindReplaceErrorCode =
  (typeof SheetFindReplaceErrorCode)[keyof typeof SheetFindReplaceErrorCode];

/** Diagnostic error surfaced to hosts by find and replace commands or queries. */
export class SheetFindReplaceError extends SearError {
  /** Stable error category. */
  public override readonly code: SheetFindReplaceErrorCode;

  constructor(code: SheetFindReplaceErrorCode, message: string, details: SearErrorDetails = {}) {
    super(message, details);
    this.code = code;
  }
}
