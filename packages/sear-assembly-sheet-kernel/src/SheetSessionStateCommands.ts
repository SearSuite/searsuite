import { Pipeline } from '@searsuite/sear-assembly-plugin';
import {
  defineSheetCommand,
  type SheetCommand,
  type SheetCommandBus,
  type SheetCommandContext,
  type SheetCommandResult,
} from '@searsuite/sear-assembly-commands';
import { SessionStateRegistry } from '@searsuite/sear-assembly-plugin';
import { type SheetSessionState } from '@searsuite/sear-assembly-sheet-state';

/** Result of capturing editor-local state for an in-memory workbook remount. */
export interface CaptureSheetSessionStateCommandResult extends SheetCommandResult {
  readonly sessionState: SheetSessionState;
}

/** Captures local state that must survive switching away from one workbook sheet. */
export const CaptureSheetSessionStateCommand = defineSheetCommand<void, CaptureSheetSessionStateCommandResult>(
  'sheet.captureSessionState',
);

/** Registers the in-memory Sheet session capture command. */
export function registerSheetSessionStateCommands(commands: SheetCommandBus, session: SessionStateRegistry): void {
  commands.register(CaptureSheetSessionStateCommand, function createCaptureSheetSessionStateCommand() {
    return new CaptureSheetSessionStateSnapshotCommand(session);
  });
}

class CaptureSheetSessionStateSnapshotCommand implements SheetCommand<CaptureSheetSessionStateCommandResult> {
  readonly #session: SessionStateRegistry;

  public readonly id = CaptureSheetSessionStateCommand.id;

  public constructor(session: SessionStateRegistry) {
    this.#session = session;
  }

  public execute(_context: SheetCommandContext): CaptureSheetSessionStateCommandResult {
    return {
      pipeline: new Pipeline(this.id),
      sessionState: this.#session.capture(),
    };
  }
}
