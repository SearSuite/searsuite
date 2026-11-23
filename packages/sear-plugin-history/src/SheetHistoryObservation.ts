import { defineStateObservation } from '@searsuite/sear-foundation-subscription';

import { type SheetHistoryStatus } from './SheetHistoryStatusProvider';

/** Editor-local undo/redo availability exposed to third-party hosts. */
export const SheetHistoryStatusObservation = defineStateObservation<SheetHistoryStatus>('sheet.history.status');
