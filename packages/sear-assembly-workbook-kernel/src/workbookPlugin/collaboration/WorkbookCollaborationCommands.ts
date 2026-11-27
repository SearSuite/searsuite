import { type CollaborationConnectOptions, type CollaborationExternalEvent } from '@searsuite/sear-plugin-collab';
import { type WorkbookSheetId } from '@searsuite/sear-domain-workbook';
import { defineWorkbookCommand } from '../../WorkbookCommandDefinition';

/** Connects the long-lived collaboration channel for one Workbook sheet. */
export const ConnectWorkbookCollaborationCommand = defineWorkbookCommand<
  {
    readonly sheetId: WorkbookSheetId;
    readonly options: CollaborationConnectOptions;
  },
  Promise<void>
>('workbook.collaboration.connect');

/** Disconnects one Workbook-owned collaboration channel. */
export const DisconnectWorkbookCollaborationCommand = defineWorkbookCommand<{
  readonly sheetId: WorkbookSheetId;
}>('workbook.collaboration.disconnect');

/** Routes one transport event into the Workbook-owned channel. */
export const ApplyWorkbookCollaborationEventCommand = defineWorkbookCommand<{
  readonly sheetId: WorkbookSheetId;
  readonly event: CollaborationExternalEvent;
}>('workbook.collaboration.applyTransportEvent');
