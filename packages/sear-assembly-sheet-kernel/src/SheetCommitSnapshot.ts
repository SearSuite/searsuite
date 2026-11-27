/** Detached metadata for one completed Sheet state/effect publication. */
export interface SheetCommitSnapshot {
  readonly revision: number;
  readonly changedOwners: readonly string[];
}
