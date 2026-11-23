import { defineStateObservation } from '@searsuite/sear-foundation-subscription';
import { type CollaborationStatus } from './CollaborationStatus';

/** Editor-local collaboration connection and synchronization status. */
export const CollaborationStatusObservation = defineStateObservation<CollaborationStatus>('collaboration.status');
