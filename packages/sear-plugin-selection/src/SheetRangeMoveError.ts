import { SearError, type SearErrorDetails } from '@searsuite/sear-foundation-error';

/** Stable range-move validation failures exposed to hosts. */
export const SheetRangeMoveErrorCode = {
  InvalidRange: 'SHEET_MOVE_INVALID_RANGE',
  DestinationOccupied: 'SHEET_MOVE_DESTINATION_OCCUPIED',
} as const;

/** A range move rejected before any document state was staged. */
export class SheetRangeMoveError extends SearError {
  public constructor(
    public readonly code: (typeof SheetRangeMoveErrorCode)[keyof typeof SheetRangeMoveErrorCode],
    message: string,
    details: SearErrorDetails,
  ) {
    super(message, details);
  }
}
