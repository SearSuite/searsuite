import {
  ReadDataValidationCellRulesQuery,
  DataValidationKind,
  DataValidationDropdownMode,
  resolveDropdownSelection,
} from '@searsuite/sear-plugin-data-validation';
import { type DropdownCellInput, type DropdownCellSnapshot, type DropdownCellOption, DropdownLimits } from './DropdownContracts';
import { DropdownError, DropdownErrorCode } from './DropdownError';
import { type SheetDropdownOptions } from './SheetDropdownOptions';
/** Validates a cell before any source traversal or mutation. */
export function assertDropdownCell(input: DropdownCellInput, shape: readonly number[]): void {
  if (
    !input ||
    !Number.isSafeInteger(input.row) ||
    !Number.isSafeInteger(input.column) ||
    input.row < 0 ||
    input.column < 0 ||
    input.row >= shape[0] ||
    input.column >= shape[1]
  )
    throw new DropdownError(DropdownErrorCode.Invalid, 'Dropdown cell is outside the Sheet.');
}
/** Resolves the last covering dropdown rule and bounded, distinct choices. */
export function readDropdownCell(input: DropdownCellInput, options: SheetDropdownOptions): DropdownCellSnapshot | null {
  assertDropdownCell(input, options.readShape());
  const entry = options.queries
    .run(ReadDataValidationCellRulesQuery, [input.row, input.column])
    .filter(({ rule }) => rule.condition.kind === DataValidationKind.Dropdown)
    .at(-1);
  if (!entry) return null;
  const condition = entry.rule.condition,
    result: DropdownCellOption[] = [],
    seen = new Set<string>();
  let visited = 0;
  const add = (label: string, color?: string, value?: number | boolean) => {
    if (++visited > DropdownLimits.SourceValues)
      throw new DropdownError(DropdownErrorCode.Limit, 'Dropdown source exceeds the traversal budget.');
    if (!label || seen.has(label)) return;
    if (result.length >= DropdownLimits.Options)
      throw new DropdownError(DropdownErrorCode.Limit, 'Dropdown has too many distinct options.');
    seen.add(label);
    result.push({ label, ...(color ? { color } : {}), ...(value !== undefined ? { value } : {}) });
  };
  if (condition.sourceRange)
    options.forEachSourceValue(condition.sourceRange.start, condition.sourceRange.end, (displayValue, rawValue) => {
      if (displayValue === null || displayValue === undefined) return;
      const display = String(displayValue);
      const raw = rawValue === undefined ? displayValue : rawValue;
      const value = (
        (typeof raw === 'number' && Number.isFinite(raw) && display === String(raw))
        || (typeof raw === 'boolean' && display === (raw ? 'TRUE' : 'FALSE'))
      ) ? raw : undefined;
      add(display, undefined, value);
    });
  else for (const option of condition.options ?? []) add(option.label, option.color);
  const text = options.readText(input.row, input.column),
    multiple = condition.dropdownMode === DataValidationDropdownMode.Multiple;
  return {
    ...input,
    ruleId: entry.rule.id,
    options: result,
    selected: text ? (multiple ? resolveDropdownSelection(text, result.map((option) => option.label)) : [text]) : [],
    multiple,
    showArrow: condition.showDropdownArrow !== false,
    ...(entry.rule.inputMessage ? { inputMessage: entry.rule.inputMessage } : {}),
  };
}
