import { lockCommittedPluginState } from '@searsuite/sear-assembly-plugin';

/** Locks document-owned Sheet data after a successful initialization or commit. */
export function lockCommittedSheetState(state: unknown): void {
  lockCommittedPluginState(state);
}
