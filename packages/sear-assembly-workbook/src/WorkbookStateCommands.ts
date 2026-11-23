import { type SessionStateRegistry } from '@searsuite/sear-assembly-plugin';
import { type SheetDocumentState } from '@searsuite/sear-assembly-setup';
import { type WorkbookDocumentState } from '@searsuite/sear-domain-workbook';
import { type WorkbookCommandBus } from './WorkbookCommandBus';
import { defineWorkbookCommand } from './WorkbookCommandDefinition';
import { type WorkbookSessionState } from './WorkbookSessionState';

/** Captured local state for remounting one WorkbookEditor runtime. */
export interface CaptureWorkbookSessionStateCommandResult {
  readonly sessionState: WorkbookSessionState;
}

/** Current workbook-owned document snapshot. */
export interface ExportWorkbookStateCommandResult {
  readonly documentState: WorkbookDocumentState<SheetDocumentState>;
}

export const CaptureWorkbookSessionStateCommand =
  defineWorkbookCommand<void, CaptureWorkbookSessionStateCommandResult>('workbook.captureSessionState');

export const ExportWorkbookStateCommand =
  defineWorkbookCommand<void, ExportWorkbookStateCommandResult>('workbook.exportState');

/** Registers aggregate snapshot commands without enumerating contributor fields. */
export function registerWorkbookStateCommands(
  commands: WorkbookCommandBus,
  session: SessionStateRegistry,
  exportDocumentState: () => WorkbookDocumentState<SheetDocumentState>,
): void {
  commands.register(CaptureWorkbookSessionStateCommand, () => ({ sessionState: session.capture() }));
  commands.register(ExportWorkbookStateCommand, () => ({ documentState: exportDocumentState() }));
}
