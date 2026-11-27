/**
 * Built-in cell identities and commit strategies for text, numbers, formulas, and rich text.
 *
 * @packageDocumentation
 */

export { CellCommitStrategy, type CellCommitContext, type CellCommitStrategyDefinition } from './CellCommitStrategy';
export {
  SheetHorizontalAlignment,
  assertSheetHorizontalAlignment,
  isSheetHorizontalAlignment,
} from './SheetHorizontalAlignment';
export {
  SheetVerticalAlignment,
  assertSheetVerticalAlignment,
  isSheetVerticalAlignment,
} from './SheetVerticalAlignment';
export { CellCommitStrategyRegistry } from './CellCommitStrategyRegistry';
export { sealCellExtensionWrites, assertCellExtensionWrite } from './CellExtensionWriteBoundary';
export { type CellMatrixElement } from './CellMatrixElement';
export {
  CellClipboardCodecRegistry,
  type CellClipboardCellPayload,
  type CellClipboardCodecDefinition,
  type CellClipboardDecodeContext,
} from './CellClipboardCodecRegistry';
export { CellType } from './CellType';
export {
  SheetCellInputValidationRegistry,
  type SheetCellInputValidationResult,
  type SheetCellInputValidator,
} from './SheetCellInputValidation';
export {
  SheetDisplayedValueChanges,
  type SheetDisplayedValueCoordinate,
  type SheetDisplayedValueChangeListener,
} from './SheetDisplayedValueChanges';
export {
  adjustCellFormatDecimalPlaces,
  CellFormats,
  createDefaultCellFormatLocaleProvider,
  createGeneralNumberDisplayCandidates,
  DefaultCellFormatLocale,
  formatCellNumber,
  formatCellNumberForEditor,
  formatCellNumberForFormulaBar,
  ICellFormatLocaleProvider,
  normalizeCellFormat,
  formatCellNumberDisplay,
  formatCellText,
  cellFormatToExcelCode,
  parseFormattedNumber,
  type CellFormat,
  type CellFormatLocale,
} from './CellFormat';
export { EmptyCellCommitStrategy } from './empty/EmptyCellCommitStrategy';
export { FormulaCellCommitStrategy } from './formula/FormulaCellCommitStrategy';
export { NumberCellCommitStrategy } from './number/NumberCellCommitStrategy';
export { BooleanCellCommitStrategy } from './boolean/BooleanCellCommitStrategy';
export { interpretNumberInput } from './number/interpretNumberInput';
export { RichTextCellCommitStrategy } from './richtext/RichTextCellCommitStrategy';
export { TextCellCommitStrategy, DefaultStringCellCommitStrategy } from './text/TextCellCommitStrategy';

export { CellFormatTransferRegistry } from './CellFormatTransferRegistry';
export { type CellFormatTransferCodec } from './CellFormatTransferCodec';

export { extractRichText, formatFormulaValue } from './CellDisplayValues';

export { SheetRulePriorityRegistry } from './SheetRulePriorityRegistry';

export * from './SheetCellStyle';
export { SheetCellStyleRegistry } from './SheetCellStyleRegistry';

export * from './CellIconShape';
