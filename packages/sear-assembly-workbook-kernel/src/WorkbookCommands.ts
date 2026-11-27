import {
  type AddWorkbookSheetInput,
  type MoveWorkbookSheetInput,
  type RemoveWorkbookSheetInput,
  type RenameWorkbookSheetInput,
  type WorkbookSheetId,
  type WorkbookDocumentState,
} from '@searsuite/sear-domain-workbook';
import { type SheetDocumentState } from '@searsuite/sear-assembly-sheet-state';
import { type WorkbookCommandBus } from './WorkbookCommandBus';
import { defineWorkbookCommand } from './WorkbookCommandDefinition';

/** Result returned by workbook-level sheet-list commands. */
export interface WorkbookCommandResult {
  /** Latest workbook state after the command. */
  readonly documentState: WorkbookDocumentState<SheetDocumentState>;
  /** Whether the live active SheetEditor instance was replaced. */
  readonly activeSheetEditorChanged: boolean;
}

/** Input for adding a sheet to the workbook. */
export type AddWorkbookSheetCommandInput = AddWorkbookSheetInput<SheetDocumentState> & {
  /** Whether the new sheet becomes locally active; defaults to true. */
  readonly activate?: boolean;
};

/** Input for removing a sheet from the workbook. */
export type RemoveWorkbookSheetCommandInput = RemoveWorkbookSheetInput & {
  /** Optional visible sheet selected when removing the locally active sheet. */
  readonly nextActiveSheetId?: WorkbookSheetId;
};

/** Input for renaming a workbook sheet. */
export type RenameWorkbookSheetCommandInput = RenameWorkbookSheetInput;

/** Input for activating a workbook sheet. */
export interface ActivateWorkbookSheetCommandInput {
  /** Sheet id to make active. */
  readonly sheetId: WorkbookSheetId;
}

/** Input for moving a sheet tab. */
export type MoveWorkbookSheetCommandInput = MoveWorkbookSheetInput;

/** Input for hiding a workbook sheet. */
export interface HideWorkbookSheetCommandInput {
  /** Sheet id to hide. */
  readonly sheetId: WorkbookSheetId;
  /** Optional active sheet to select when hiding the current active sheet. */
  readonly nextActiveSheetId?: WorkbookSheetId;
}

/** Input for unhiding a workbook sheet. */
export interface UnhideWorkbookSheetCommandInput {
  /** Sheet id to reveal. */
  readonly sheetId: WorkbookSheetId;
}

/** Official command for adding a sheet descriptor and sheet state payload. */
export const AddWorkbookSheetCommand = defineWorkbookCommand<AddWorkbookSheetCommandInput, WorkbookCommandResult>(
  'workbook.addSheet',
);

/** Official command for removing a sheet descriptor and sheet state payload. */
export const RemoveWorkbookSheetCommand = defineWorkbookCommand<RemoveWorkbookSheetCommandInput, WorkbookCommandResult>(
  'workbook.removeSheet',
);

/** Official command for renaming a workbook sheet. */
export const RenameWorkbookSheetCommand = defineWorkbookCommand<RenameWorkbookSheetCommandInput, WorkbookCommandResult>(
  'workbook.renameSheet',
);

/** Official command for activating a workbook sheet. */
export const ActivateWorkbookSheetCommand = defineWorkbookCommand<
  ActivateWorkbookSheetCommandInput,
  WorkbookCommandResult
>('workbook.activateSheet');

/** Official command for moving a workbook sheet tab. */
export const MoveWorkbookSheetCommand = defineWorkbookCommand<MoveWorkbookSheetCommandInput, WorkbookCommandResult>(
  'workbook.moveSheet',
);

/** Official command for hiding a workbook sheet. */
export const HideWorkbookSheetCommand = defineWorkbookCommand<HideWorkbookSheetCommandInput, WorkbookCommandResult>(
  'workbook.hideSheet',
);

/** Official command for unhiding a workbook sheet. */
export const UnhideWorkbookSheetCommand = defineWorkbookCommand<UnhideWorkbookSheetCommandInput, WorkbookCommandResult>(
  'workbook.unhideSheet',
);

/** Internal controller API implemented by the workbook editor facade. */
export interface WorkbookCommandController {
  addSheet(input: AddWorkbookSheetCommandInput): WorkbookCommandResult;
  removeSheet(input: RemoveWorkbookSheetCommandInput): WorkbookCommandResult;
  renameSheet(input: RenameWorkbookSheetCommandInput): WorkbookCommandResult;
  activateSheet(input: ActivateWorkbookSheetCommandInput): WorkbookCommandResult;
  moveSheet(input: MoveWorkbookSheetCommandInput): WorkbookCommandResult;
  hideSheet(input: HideWorkbookSheetCommandInput): WorkbookCommandResult;
  unhideSheet(input: UnhideWorkbookSheetCommandInput): WorkbookCommandResult;
}

/** Registers the built-in workbook commands on one workbook command bus. */
export function registerDefaultWorkbookCommands(
  commands: WorkbookCommandBus,
  controller: WorkbookCommandController,
): void {
  commands.register(AddWorkbookSheetCommand, (input) => controller.addSheet(input));
  commands.register(RemoveWorkbookSheetCommand, (input) => controller.removeSheet(input));
  commands.register(RenameWorkbookSheetCommand, (input) => controller.renameSheet(input));
  commands.register(ActivateWorkbookSheetCommand, (input) => controller.activateSheet(input));
  commands.register(MoveWorkbookSheetCommand, (input) => controller.moveSheet(input));
  commands.register(HideWorkbookSheetCommand, (input) => controller.hideSheet(input));
  commands.register(UnhideWorkbookSheetCommand, (input) => controller.unhideSheet(input));
}
