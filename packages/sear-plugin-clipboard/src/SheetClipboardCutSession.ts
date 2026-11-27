import { isInsideCommandExecution } from '@searsuite/sear-assembly-plugin';
import { SearError } from '@searsuite/sear-foundation-error';
import type { SheetClipboardRangeInput } from './SheetClipboardCommands';

export interface PendingSheetCut {
  readonly id: string;
  readonly sourceId: string;
  readonly range: SheetClipboardRangeInput;
}

/** Transient cut intent shared by the sheets mounted in one workbook. */
export class SheetClipboardCutSession {
  public static readonly symbol = Symbol.for('SheetClipboardCutSession');
  #pending: PendingSheetCut | null = null;

  public getPending(): PendingSheetCut | null {
    return this.#pending;
  }

  public begin(pending: PendingSheetCut): void {
    this.#assertCommand();
    this.#pending = pending;
  }

  public cancel(): void {
    this.#assertCommand();
    this.#pending = null;
  }

  #assertCommand(): void {
    if (!isInsideCommandExecution()) throw new SearError('Clipboard cut state must change through a command.');
  }
}
