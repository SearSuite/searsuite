import { defineSheetCommand, defineSheetQuery, type SheetRangeInput } from '@searsuite/sear-assembly-commands';
import { type CheckboxRemovalMode } from './CheckboxCellValue';
/** Converts empty or explicit boolean cells; replacement of other content requires opt-in. */
export interface InsertCheckboxesInput extends SheetRangeInput {
  /** Optional forced initial state; otherwise existing boolean states are retained. */ readonly checked?: boolean;
  /** Explicitly replace other persisted content. */ readonly replaceExisting?: boolean;
}
/** Inserts checkbox cells in one cell-owner transaction. */
export const InsertCheckboxesCommand = defineSheetCommand<InsertCheckboxesInput>('sheet.checkbox.insert');
/** Sets only existing checkbox cells in the range. */
export const SetCheckboxesCommand = defineSheetCommand<SheetRangeInput & { readonly checked: boolean }>(
  'sheet.checkbox.set',
);
/** Checks a mixed/unchecked range, or unchecks an entirely checked range. */
export const ToggleCheckboxesCommand = defineSheetCommand<SheetRangeInput>('sheet.checkbox.toggle');
/** Converts only existing checkbox cells to text or clears them. */
export const RemoveCheckboxesCommand = defineSheetCommand<SheetRangeInput & { readonly mode?: CheckboxRemovalMode }>(
  'sheet.checkbox.remove',
);
/** Read-only aggregate of existing checkbox states. */
export interface CheckboxRangeStatus {
  /** Well-formed checkbox count. */ readonly count: number;
  /** Checked checkbox count. */ readonly checked: number;
  /** Unchecked checkbox count. */ readonly unchecked: number;
  /** Whether both states occur in the range. */ readonly mixed: boolean;
}
/** Reads sparse checkbox state without traversing every empty coordinate. */
export const ReadCheckboxRangeQuery = defineSheetQuery<SheetRangeInput, CheckboxRangeStatus>(
  'sheet.checkbox.readRange',
);
