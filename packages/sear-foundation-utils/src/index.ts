/**
 * General-purpose algorithms and guards without editor-domain ownership.
 *
 * @packageDocumentation
 */

export { type HexColor, getRandomColor, releaseColor, StandardColor } from './getRandomColor';
export { columnIndexToLabel, columnLabelToIndex } from './SpreadsheetColumn';
export { isFormulaError, isFormulaText, isNumber, toNumberOrError, toNumberOrZero } from './FormulaValueUtils';
export { erf, erfc } from './ErrorFunction';
export { deepEqual } from './deepEqual';
