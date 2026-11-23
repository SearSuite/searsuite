import { defineSheetQuery } from '@searsuite/sear-assembly-commands';

/** Selected plain text in the active cell edit session; null outside editing. */
export const ReadSelectedCellEditTextQuery = defineSheetQuery<void, string | null>('cellEditor.readSelectedText');
