import { SearError } from '@searsuite/sear-foundation-error';

const writeChecks = new WeakMap<object, () => void>();

/** Seals setup-time Sheet contribution registries after editor startup. */
export function sealSheetContributionWrites(owner: object, assertWrite: () => void): void {
  if (writeChecks.has(owner)) throw new SearError('Sheet contribution write boundary is already installed.');
  writeChecks.set(owner, assertWrite);
  Object.freeze(owner);
}

/** Checks registration changes without adding work to query or planning paths. */
export function assertSheetContributionWrite(owner: object): void {
  writeChecks.get(owner)?.();
}
