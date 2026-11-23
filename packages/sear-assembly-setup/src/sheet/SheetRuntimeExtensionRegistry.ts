import {
  RuntimeCapabilityRegistry,
  defineRuntimeCapability,
  type RuntimeCapability,
  type RuntimeCapabilityReader,
} from '@searsuite/sear-assembly-plugin';

/** Typed extension capability exposed through the sheet runtime facade. */
export type SheetRuntimeCapability<T> = RuntimeCapability<T>;

/**
 * Defines a typed runtime capability token.
 * @param id - Stable capability id.
 * @returns Immutable capability descriptor.
 */
export function defineSheetRuntimeCapability<T>(id: string): SheetRuntimeCapability<T> {
  return defineRuntimeCapability<T>(id);
}

/** Read-only view of editor-local runtime capabilities exposed to hosts. */
export type SheetRuntimeCapabilityReader = RuntimeCapabilityReader;

/**
 * Registry for typed sheet runtime extension values.
 *
 * Third-party plugins use this registry to publish and consume capabilities
 * without mutating the runtime facade shape directly.
 */
export class SheetRuntimeExtensionRegistry extends RuntimeCapabilityRegistry {
  public constructor() {
    super('SheetEditor');
  }
}
