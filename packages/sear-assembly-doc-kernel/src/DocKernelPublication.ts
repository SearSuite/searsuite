import { type Plugin, type PluginKey } from '@searsuite/sear-assembly-plugin';
import { type StateKernelCommit } from '@searsuite/sear-domain-state';
import { type Transaction } from '@searsuite/sear-domain-transaction';

/** Neutral projection identities invalidated by one successful document pipeline. */
export interface DocProjectionInvalidation {
  readonly projections: readonly PluginKey[];
  readonly transactions: readonly Transaction[];
}

/** Internal state publication consumed by business services and independent views. */
export type DocKernelPublication = StateKernelCommit<Plugin<unknown>, Transaction, DocProjectionInvalidation>;

/** Detached metadata exposed to document hosts through a typed observation. */
export interface DocCommitSnapshot {
  readonly revision: number;
  readonly changedOwners: readonly string[];
}
