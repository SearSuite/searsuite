/**
 * Type-neutral Sheet clipboard traversal, serialization, and paste commands.
 *
 * @packageDocumentation
 */

export {
  SHEET_CLIPBOARD_MIME_TYPE,
  SHEET_CLIPBOARD_PAYLOAD_VERSION,
  SheetClipboardCodecSymbol,
  SheetClipboardDataSourceSymbol,
  type SheetClipboardCellPoint,
  type SheetClipboardCodec,
  type SheetClipboardDataSource,
  type SheetClipboardDecodedRow,
  type SheetClipboardDecodedRange,
  type SheetClipboardMergedRange,
  type SheetClipboardMergePlan,
  type SheetClipboardDecodeContext,
  type SheetClipboardPayload,
  type SheetClipboardPort,
  SheetClipboard,
  type SheetClipboardRow,
  type SheetClipboardStructuredPayload,
} from './SheetClipboardContracts';
export { SheetClipboard as AbstractSheetClipboard } from './SheetClipboardContracts';
export { InMemorySheetClipboard } from './InMemorySheetClipboard';
export { SheetClipboardCutSession, type PendingSheetCut } from './SheetClipboardCutSession';
export { SheetClipboardSheetIdentity } from './SheetClipboardSheetIdentity';
export {
  CopyRangeCommand,
  CopyCommand,
  CutRangeCommand,
  CutCommand,
  CancelCutRangeCommand,
  PasteRangeCommand,
  PasteCommand,
  SheetClipboardPlugin,
  type SheetClipboardCommandResult,
  type SheetClipboardRangeInput,
  type SheetCopyRangeInput,
  type SheetPasteRangeInput,
  type SheetPasteRangeResult,
} from './SheetClipboardCommands';
export { DefaultSheetClipboardCodec } from './DefaultSheetClipboardCodec';
export { SheetPasteMode } from './SheetPasteMode';
export {
  SheetClipboardError,
  SheetClipboardErrorCode,
  type SheetClipboardErrorCode as SheetClipboardErrorCodeType,
} from './SheetClipboardErrors';
