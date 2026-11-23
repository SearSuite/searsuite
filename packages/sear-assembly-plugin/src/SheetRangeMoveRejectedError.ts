import { SearError } from '@searsuite/sear-foundation-error';
import { type SheetRangeMoveAnalysis, SheetRangeMoveStatus } from './SheetRangeMoveAnalysis';

/** A rejected assessment retains the state owner's stable diagnostic code. */
export class SheetRangeMoveRejectedError extends SearError {
  public override readonly code: string;

  /** Creates the command failure from the same assessment consumed by preview. */
  public constructor(analysis: Extract<SheetRangeMoveAnalysis, { status: typeof SheetRangeMoveStatus.Blocked }>) {
    super(analysis.issue.message, {
      ...analysis.issue.details,
      context: analysis.context,
      ownerId: analysis.issue.ownerId,
    });
    this.code = analysis.issue.code;
  }
}
