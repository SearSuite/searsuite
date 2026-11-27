import { type SheetRangeBounds } from '@searsuite/sear-assembly-commands';
import {
  type PluginKey,
  type SheetClipboardTransferPlan,
  type SheetFormatTransferPlan,
  type SheetClipboardTransferRequest,
  type SheetPortableClipboardTransfer,
  type SheetPortableFormatTransfer,
} from '@searsuite/sear-assembly-plugin';
import { type Operation } from '@searsuite/sear-domain-ot';
import {
  type CellClipboardCellPayload,
  type CellFormat,
  type CellMatrixElement,
  type SheetCellInputValidationResult,
} from '@searsuite/sear-domain-cell-types';
import type { SheetRangeMovePlan } from '@searsuite/sear-assembly-plugin';
import type { SheetClipboardRangeInput } from './SheetClipboardCommands';
import type { SheetClipboardCutSession } from './SheetClipboardCutSession';
import type { Pipeline } from '@searsuite/sear-assembly-plugin';

/** Current version of the transient structured sheet clipboard payload. */
export const SHEET_CLIPBOARD_PAYLOAD_VERSION = 3 as const;

/** MIME type that a browser adapter may use for the structured payload. */
export const SHEET_CLIPBOARD_MIME_TYPE = 'application/x-searsuite-sheet-range';

/** A zero-based cell coordinate expressed as `[row, column]`. */
export type SheetClipboardCellPoint = readonly [number, number];

/** Inclusive merged range relative to the copied range's top-left cell. */
export interface SheetClipboardMergedRange {
  readonly start: SheetClipboardCellPoint;
  readonly end: SheetClipboardCellPoint;
}

/** Merge-owner operation plan produced by the active sheet adapter. */
export interface SheetClipboardMergePlan {
  readonly target: PluginKey;
  readonly operations: readonly Operation[];
}

/** One row in a structured clipboard range, including empty cells. */
export type SheetClipboardRow = readonly (CellClipboardCellPayload | null)[];

/** Decoded cells ready for a paste transaction. */
export type SheetClipboardDecodedRow = readonly (CellMatrixElement | null)[];

/** One captured metadata tile and its destination offset in the decoded range. */
export interface SheetClipboardDataInstance {
  readonly offset: SheetClipboardCellPoint;
  readonly size: SheetClipboardCellPoint;
  readonly captured: readonly SheetPortableClipboardTransfer[];
}

/** Decoded value and format matrices ready for parallel paste transactions. */
export interface SheetClipboardDecodedRange {
  readonly rows: readonly SheetClipboardDecodedRow[];
  /** Present only when the source supplied editor-native format metadata. */
  readonly formats?: readonly (readonly (CellFormat | null)[])[];
  readonly ownerFormats?: readonly SheetPortableFormatTransfer[];
  readonly ownerFormatsByRow?: readonly (readonly SheetPortableFormatTransfer[])[];
  readonly ownerDataInstances?: readonly SheetClipboardDataInstance[];
  readonly merges?: readonly SheetClipboardMergedRange[];
}

/** Editor-owned structured range data carried inside a clipboard payload. */
export interface SheetClipboardStructuredPayload {
  readonly kind: 'searsuite.sheet-range';
  readonly version: typeof SHEET_CLIPBOARD_PAYLOAD_VERSION;
  /** Original top-left coordinate, supplied to cell-type paste codecs. */
  readonly source: SheetClipboardCellPoint;
  /** Original row coordinates when a filtered selection is compacted on copy. */
  readonly sourceRows?: readonly number[];
  /** A cut move keeps formula references anchored to their original targets. */
  readonly isCut?: true;
  /** Transient identifier linking a cut and a subsequent paste in Sheet history. */
  readonly cutId?: string;
  readonly rows: readonly SheetClipboardRow[];
  /** Calculated cell snapshots for a values-only paste. */
  readonly valueRows?: readonly SheetClipboardRow[];
  /** Parallel explicit-format rows. Null means General/no explicit format. */
  readonly formats: readonly (readonly (CellFormat | null)[])[];
  /** Optional persisted-format snapshots supplied by their state owners. */
  readonly ownerFormats?: readonly SheetPortableFormatTransfer[];
  /** Per-row format snapshots for a compacted visible-row selection. */
  readonly ownerFormatsByRow?: readonly (readonly SheetPortableFormatTransfer[])[];
  readonly ownerData?: readonly SheetPortableClipboardTransfer[];
  readonly ownerDataByRow?: readonly (readonly SheetPortableClipboardTransfer[])[];
  /** Merge geometry relative to this payload's top-left cell. */
  readonly merges?: readonly SheetClipboardMergedRange[];
}

/** Platform-neutral clipboard data. It is transient and is not a persistence envelope. */
export interface SheetClipboardPayload {
  /** Plain text representation suitable for external applications. */
  readonly plainText: string;
  /** Optional editor-native representation preserving cell type and metadata. */
  readonly structured?: SheetClipboardStructuredPayload;
}

/** Platform-neutral clipboard abstraction. Implementations own system I/O. */
export abstract class SheetClipboard {
  public static readonly symbol = Symbol.for('SheetClipboard');
  public abstract read(): Promise<SheetClipboardPayload | null>;
  public abstract write(payload: SheetClipboardPayload): Promise<void>;
}

/** Structural port retained as a lightweight host-adapter contract. */
export type SheetClipboardPort = Pick<SheetClipboard, 'read' | 'write'>;

/** Data source required by the clipboard plugin; selection and storage stay replaceable. */
export interface SheetClipboardDataSource {
  readonly target: PluginKey;
  readonly formatTarget: PluginKey;
  readonly cutSourceId?: string;
  readonly cutSession?: SheetClipboardCutSession;
  planRangeMove?(
    source: SheetClipboardRangeInput,
    destination: SheetClipboardRangeInput,
  ): readonly SheetRangeMovePlan[];
  prepareCrossSheetCut?(cutId: string, clearPipeline: Pipeline): void;
  scheduleCrossSheetMove?(cutId: string, sourceId: string, pastePipeline: Pipeline): Promise<void>;
  getSelection(): SheetRangeBounds | null;
  getRowCount(): number;
  getColumnCount(): number;
  readCell(row: number, column: number): CellMatrixElement | null;
  /** Optional displayed value for copy sources that have no persisted cell. */
  readCopyCell?(row: number, column: number): CellMatrixElement | null;
  /** Optional calculated cell snapshot for values-only paste. */
  readCopyValueCell?(row: number, column: number): CellMatrixElement | null;
  /** Optional editor-local validation applied before any pasted value is written. */
  validatePasteCell?(row: number, column: number, cell: CellMatrixElement | null): SheetCellInputValidationResult;
  /** Optional protection check before cutting an occupied source cell. */
  validateCutCell?(row: number, column: number): SheetCellInputValidationResult;
  readCellFormat(row: number, column: number): CellFormat | null;
  isRowVisible?(row: number): boolean;
  createClipboardCutId?(): string;
  captureOwnerFormats?(range: SheetRangeBounds): readonly SheetPortableFormatTransfer[];
  planOwnerFormats?(
    captured: readonly SheetPortableFormatTransfer[],
    target: SheetRangeBounds,
  ): readonly SheetFormatTransferPlan[];
  clearOwnerFormats?(range: SheetRangeBounds): readonly SheetFormatTransferPlan[];
  captureOwnerData?(range: SheetRangeBounds): readonly SheetPortableClipboardTransfer[];
  planOwnerData?(requests: readonly SheetClipboardTransferRequest[]): readonly SheetClipboardTransferPlan[];
  clearOwnerData?(range: SheetRangeBounds): readonly SheetClipboardTransferPlan[];
  captureMergedRanges?(range: SheetRangeBounds): readonly SheetClipboardMergedRange[];
  planPasteMergedRanges?(
    merges: readonly SheetClipboardMergedRange[],
    target: SheetClipboardCellPoint,
  ): SheetClipboardMergePlan;
  planClearMergedRanges?(range: SheetRangeBounds): SheetClipboardMergePlan;
  /** Optional host projection for rejecting writes hidden by merged cells. */
  getMergedRange?(row: number, column: number): SheetRangeBounds | null;
}

/** Codec extension point for clipboard envelope and external formats. Cell types register their own handlers separately. */
export interface SheetClipboardCodec {
  encode(range: SheetRangeBounds, source: SheetClipboardDataSource, visibleRowsOnly?: boolean): SheetClipboardPayload;
  decode(payload: SheetClipboardPayload, context: SheetClipboardDecodeContext): SheetClipboardDecodedRange;
}

/** Context supplied to codecs so formula-aware implementations can rebase references on paste. */
export interface SheetClipboardDecodeContext {
  readonly target: SheetClipboardCellPoint;
  readonly valuesOnly?: boolean;
}

/** DI token for the editor-local clipboard data source. */
export const SheetClipboardDataSourceSymbol = Symbol.for('SheetClipboardDataSource');

/** DI token for the editor-local clipboard codec. */
export const SheetClipboardCodecSymbol = Symbol.for('SheetClipboardCodec');
