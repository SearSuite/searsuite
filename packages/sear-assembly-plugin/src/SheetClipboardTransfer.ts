import type { Operation } from '@searsuite/sear-domain-ot';
import type { PluginKey } from './PluginKey';
import type { SheetMoveRange } from './SheetRangeMoveContribution';

/** Owner data captured for a transient structured clipboard payload. */
export interface SheetPortableClipboardTransfer {
  readonly id: string;
  readonly portable: unknown;
}

/** Operations planned by the state owner against the destination Sheet. */
export interface SheetClipboardTransferPlan {
  readonly target: PluginKey;
  readonly operations: readonly Operation[];
}

/** One owner's captured data and the absolute range for one pasted tile. */
export interface SheetClipboardCapturedInstance {
  readonly portable: unknown;
  readonly destination: SheetMoveRange;
}

/** One pasted tile containing captures from any number of owners. */
export interface SheetClipboardTransferRequest {
  readonly captured: readonly SheetPortableClipboardTransfer[];
  readonly destination: SheetMoveRange;
}

export interface SheetClipboardTransferContribution {
  readonly id: string;
  capture(source: SheetMoveRange): unknown;
  planCaptured(instances: readonly SheetClipboardCapturedInstance[]): readonly SheetClipboardTransferPlan[];
  clear?(range: SheetMoveRange): readonly SheetClipboardTransferPlan[];
}

export interface SheetClipboardTransferRegistrar {
  registerClipboardTransfers(registry: import('./SheetClipboardTransferRegistry').SheetClipboardTransferRegistry): void;
}
