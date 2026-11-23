import { formatDropdownSelection } from '@searsuite/sear-plugin-data-validation';
import { type DropdownCellSnapshot, type PickDropdownOptionInput } from './DropdownContracts';
import { DropdownError, DropdownErrorCode } from './DropdownError';
/** Computes a selection without mutating state; stale or removed choices fail explicitly. */
export function planDropdownValue(
  state: DropdownCellSnapshot | null,
  input: PickDropdownOptionInput,
): string | number | boolean | null {
  if (!state || (input.ruleId !== undefined && input.ruleId !== state.ruleId))
    throw new DropdownError(DropdownErrorCode.Stale, 'Dropdown rule has changed. Reopen the picker.');
  const option = state.options.find((choice) => choice.label === input.label);
  if (!option)
    throw new DropdownError(DropdownErrorCode.Invalid, 'Dropdown option is unavailable.');
  if (!state.multiple) return option.value ?? input.label;
  const selected = new Set(state.selected.filter((label) => state.options.some((option) => option.label === label)));
  if (selected.has(input.label)) selected.delete(input.label);
  else selected.add(input.label);
  return selected.size ? formatDropdownSelection([...selected]) : null;
}
