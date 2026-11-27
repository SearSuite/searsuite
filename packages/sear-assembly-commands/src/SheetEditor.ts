import { type SheetCommandClient } from './SheetCommandClient';
import { type SheetRuntimeCapabilityReader } from './SheetRuntimeExtensionRegistry';

/** Host-facing Sheet business client, independent of its presentation and assembly. */
export interface SheetEditor extends SheetCommandClient {
  /** Reads explicitly published editor-owned capabilities. */
  readonly services: SheetRuntimeCapabilityReader;
  /** Releases the runtime and all owned subscriptions. */
  destroy(): void;
}
