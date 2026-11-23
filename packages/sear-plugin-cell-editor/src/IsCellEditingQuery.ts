import { defineSheetQuery } from '@searsuite/sear-assembly-commands';

/** Reports whether an active cell edit must be committed before a host formatting action. */
export const IsCellEditingQuery = defineSheetQuery<void, boolean>('cellEditor.isEditing');
