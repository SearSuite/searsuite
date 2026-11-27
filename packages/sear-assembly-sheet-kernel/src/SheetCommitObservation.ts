import { defineStateObservation } from '@searsuite/sear-foundation-subscription';
import { type SheetCommitSnapshot } from './SheetCommitSnapshot';

/** Current publication revision and changed owner identities; subscribes without requiring a view. */
export const SheetCommitObservation = defineStateObservation<SheetCommitSnapshot>('sheet.commit');
