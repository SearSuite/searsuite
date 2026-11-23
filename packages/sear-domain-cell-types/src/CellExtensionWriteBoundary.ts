import { SearError } from '@searsuite/sear-foundation-error';

const writeChecks = new WeakMap<object, () => void>();

/** Seals an editor-local cell extension owner after setup contributions are registered. */
export function sealCellExtensionWrites(owner: object, assertWrite: () => void): void {
  if (writeChecks.has(owner)) throw new SearError('Cell extension write boundary is already installed.');
  writeChecks.set(owner, assertWrite);
  Object.freeze(owner);
}

/** Checks registration changes only; cell reads and rendering stay on their existing hot paths. */
export function assertCellExtensionWrite(owner: object): void {
  writeChecks.get(owner)?.();
}
