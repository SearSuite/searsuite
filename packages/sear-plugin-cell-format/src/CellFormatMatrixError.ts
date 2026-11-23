import { SearError, type SearErrorDetails } from '@searsuite/sear-foundation-error';

/** Public error raised when persisted Sheet cell-format state is invalid. */
export class CellFormatMatrixError extends SearError {
  public override readonly code = 'SHEET_CELL_FORMAT_INVALID';

  public constructor(message: string, details: SearErrorDetails = {}) {
    super(message, details);
  }
}
