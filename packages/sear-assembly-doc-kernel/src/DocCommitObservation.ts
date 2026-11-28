import { defineStateObservation } from '@searsuite/sear-foundation-subscription';
import { type DocCommitSnapshot } from './DocKernelPublication';

/** Revision and owner identities from the latest successful document publication. */
export const DocCommitObservation = defineStateObservation<DocCommitSnapshot>('doc.commit');
