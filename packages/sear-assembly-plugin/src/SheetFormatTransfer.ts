import { type Operation } from '@searsuite/sear-domain-ot';
import { type PluginKey } from './PluginKey';
import { type SheetMoveRange } from './SheetRangeMoveContribution';

/** Inclusive range shared by format-transfer owners and hosts. */
export type SheetFormatRange = SheetMoveRange;
/** One owner's isolated plan; only the owner interprets its operations. */
export interface SheetFormatTransferPlan {
  readonly target: PluginKey;
  readonly operations: readonly Operation[];
}
/** Serializable owner snapshot for a transient clipboard payload. */
export interface SheetPortableFormatTransfer {
  readonly id: string;
  readonly portable: unknown;
}
/** Captured format data, independent of subsequent source changes. */
export interface SheetFormatTransferSnapshot {
  /** Captured owner data that can be planned against another Sheet instance. */
  readonly portable?: unknown;
  plan(
    destination: SheetFormatRange,
    targetRegistry?: import('./SheetFormatTransferRegistry').SheetFormatTransferRegistry,
  ): readonly SheetFormatTransferPlan[];
}
/** Optional state-owner contribution to format painting. */
export interface SheetFormatTransferContribution {
  readonly id: string;
  capture?(source: SheetFormatRange): SheetFormatTransferSnapshot;
  /** Optional numeric step for filling one cell whose format gives it sequence meaning. */
  singleCellFillStep?(row: number, column: number): number | null;
  /** Farthest explicitly formatted row and column within sheet bounds. */
  usedExtent?(lastRow: number, lastColumn: number): readonly [number, number] | null;
  /** Plans a captured source pattern using this owner's current target state. */
  planCaptured?(portable: unknown, destination: SheetFormatRange): readonly SheetFormatTransferPlan[];
  /** Plans removal of this owner's explicit formats without changing cell content. */
  clear?(range: SheetFormatRange): readonly SheetFormatTransferPlan[];
}
/** Optional plugin lifecycle extension for format-transfer registration. */
export interface SheetFormatTransferRegistrar {
  registerFormatTransfers(registry: import('./SheetFormatTransferRegistry').SheetFormatTransferRegistry): void;
}
