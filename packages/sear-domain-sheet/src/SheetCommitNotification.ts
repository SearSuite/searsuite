import { type StateOwnerKey } from '@searsuite/sear-domain-state';

/** Explicit invalidation of derived Sheet projections after a successful command. */
export interface SheetProjectionInvalidation {
  /** Neutral derived projections invalidated by this commit. */
  readonly projections: readonly StateOwnerKey[];
  /** Whether the commit changed editor-local interaction state. */
  readonly interactionChanged: boolean;
}

/** Immutable publication consumed through independent state queries. */
export interface SheetCommitNotification extends SheetProjectionInvalidation {
  /** Monotonically increasing revision of successfully published state. */
  readonly revision: number;
  /** Stable identities of owners whose state was published in this commit. */
  readonly changedOwners: readonly StateOwnerKey[];
}
