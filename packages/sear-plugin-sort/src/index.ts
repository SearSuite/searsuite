/** @packageDocumentation
 * Sheet range sorting commands and stable sparse row permutation helpers.
 */
export { SheetSortPlugin, SortSheetRangeCommand, type SheetSortDependencies } from './sheetPlugin/sort/SheetSortPlugin';
export { inferSheetSortHeader } from './inferSheetSortHeader';
export { SheetSortDirection, type SheetSortKey, type SheetSortRangeInput, type SheetSortValue } from './SheetSortTypes';
export { SheetSortError } from './SheetSortError';
export { createSheetSortPermutation, type SheetSortPermutation } from './createSheetSortPermutation';
