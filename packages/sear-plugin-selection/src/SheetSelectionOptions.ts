import { type DataEngine } from '@searsuite/sear-domain-state';
import {
  type CellClipboardCodecRegistry,
  type SheetCellInputValidationRegistry,
} from '@searsuite/sear-domain-cell-types';
import {
  type SheetClipboardTransferRegistry,
  type SheetFormatTransferRegistry,
  type SheetInteractionReducerRegistry,
  type SheetRangeMoveRegistry,
} from '@searsuite/sear-assembly-plugin';
import { type SheetQueryRegistry } from '@searsuite/sear-assembly-commands';
import { type SheetCellMergePlugin } from '@searsuite/sear-plugin-cell-merge';
import { type Platform } from '@searsuite/sear-foundation-platform';

/** Neutral state, planning, and projection dependencies for the selection owner. */
export interface SheetSelectionOptions {
  readonly data: DataEngine;
  readonly queries: SheetQueryRegistry;
  readonly merges: Pick<SheetCellMergePlugin, 'isMergedCell'>;
  readonly rangeMoves?: SheetRangeMoveRegistry;
  readonly validation?: SheetCellInputValidationRegistry;
  readonly codecs?: CellClipboardCodecRegistry;
  readonly formats?: SheetFormatTransferRegistry;
  readonly ownerData?: SheetClipboardTransferRegistry;
  readonly interactionReducers?: SheetInteractionReducerRegistry;
  readonly platform?: Platform;
}
