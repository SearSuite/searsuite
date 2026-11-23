import { SearError } from '@searsuite/sear-foundation-error';
import { type SheetMoveAxisInput } from './SheetMoveAxisInput';

/** A requested block or insertion boundary falls outside its axis. */
export class SheetAxisMoveBoundsError extends SearError {
  public override readonly code = 'SHEET_AXIS_MOVE_BOUNDS';
  public constructor(input: SheetMoveAxisInput, size: number) {
    super('Invalid sheet axis move bounds.', { input, size });
  }
}
