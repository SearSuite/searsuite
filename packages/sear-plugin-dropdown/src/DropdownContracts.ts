import { defineSheetCommand, defineSheetQuery } from '@searsuite/sear-assembly-commands';
import { defineEventObservation } from '@searsuite/sear-foundation-subscription';
import { type DataValidationOption } from '@searsuite/sear-plugin-data-validation';
/** Display choice with an optional primitive source value that can be persisted directly. */
export interface DropdownCellOption extends DataValidationOption {
  readonly value?: number | boolean;
}
/** Absolute target cell; all picker reads are editor-local. */
export interface DropdownCellInput {
  /** Zero-based row. */ readonly row: number;
  /** Zero-based column. */ readonly column: number;
}
/** Immutable current rule and cell projection. */
export interface DropdownCellSnapshot extends DropdownCellInput {
  /** Stable validation owner id. */ readonly ruleId: string;
  /** Ordered, distinct current choices. */ readonly options: readonly DropdownCellOption[];
  /** Current selected labels, including values absent from the rule. */ readonly selected: readonly string[];
  /** Whether choices accumulate. */ readonly multiple: boolean;
  /** Whether the cell shows its arrow. */ readonly showArrow: boolean;
  /** Selection prompt from the validation owner. */ readonly inputMessage?: string;
}
/** Target and choice to set, or toggle in multiple-selection mode. */
export interface PickDropdownOptionInput extends DropdownCellInput {
  /** Option label, matched exactly against current choices. */ readonly label: string;
  /** Optional rule identity guards stale picker actions after configuration changes. */ readonly ruleId?: string;
}
/** Reads the current dropdown without exposing a feature matrix. */
export const ReadDropdownCellQuery = defineSheetQuery<DropdownCellInput, DropdownCellSnapshot | null>(
  'dropdown.readCell',
);
/** Picks one valid option through a cell-owner transaction. */
export const PickDropdownOptionCommand = defineSheetCommand<PickDropdownOptionInput>('dropdown.pick');
/** Clears the cell value while retaining validation rules. */
export const ClearDropdownValueCommand = defineSheetCommand<DropdownCellInput>('dropdown.clearValue');
/** Requests the host picker for one current dropdown cell. */
export const OpenDropdownPickerCommand = defineSheetCommand<DropdownCellInput>('dropdown.open');
/** Transient host request; no document or remount session state is stored. */
export const DropdownPickerRequest = defineEventObservation<DropdownCellInput>('dropdown.pickerRequest');
/** Shared option and source traversal budgets. */
export const DropdownLimits = { Options: 1000, SourceValues: 10000 } as const;
