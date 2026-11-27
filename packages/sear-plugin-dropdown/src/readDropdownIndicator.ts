import {
  DataValidationDropdownMode,
  DataValidationKind,
  ReadDataValidationCellRulesQuery,
  resolveDropdownSelection,
} from '@searsuite/sear-plugin-data-validation';
import { type SheetDropdownOptions } from './SheetDropdownOptions';

/** Bounded label and rule metadata, without traversing source-range choices. */
export interface DropdownIndicator {
  readonly showArrow: boolean;
  readonly labels: readonly { readonly text: string; readonly color?: string }[];
}

export function readDropdownIndicator(
  row: number,
  column: number,
  options: SheetDropdownOptions,
): DropdownIndicator | null {
  const entry = options.queries
    .run(ReadDataValidationCellRulesQuery, [row, column])
    .filter(({ rule }) => rule.condition.kind === DataValidationKind.Dropdown)
    .at(-1);
  if (!entry) return null;
  const condition = entry.rule.condition;
  const text = options.readText(row, column);
  const selected = text
    ? condition.dropdownMode === DataValidationDropdownMode.Multiple
      ? resolveDropdownSelection(
          text,
          (condition.options ?? []).map((option) => option.label),
        )
      : [text]
    : [];
  const colors = new Map((condition.options ?? []).map((option) => [option.label, option.color]));
  return {
    showArrow: condition.showDropdownArrow !== false,
    labels: selected.map((label) => {
      const color = colors.get(label);
      return { text: label, ...(color ? { color } : {}) };
    }),
  };
}
