import { type SheetRangeInput } from '@searsuite/sear-assembly-commands';
import { CheckboxError, CheckboxErrorCode } from './CheckboxError';
/** Maximum number of persisted cells one checkbox command can change. */
export const CheckboxMutationLimit = 10000;
/** Validates and orders a public range without limiting sparse read traversal by viewport. */
export function normalizeCheckboxRange(input: SheetRangeInput, shape: readonly [number, number]): SheetRangeInput {
  if (
    !input ||
    !Array.isArray(input.anchor) ||
    !Array.isArray(input.focus) ||
    input.anchor.length !== 2 ||
    input.focus.length !== 2 ||
    ![...input.anchor, ...input.focus].every((v) => Number.isSafeInteger(v) && v >= 0)
  )
    throw new CheckboxError(CheckboxErrorCode.Invalid, 'Checkbox range requires nonnegative integer coordinates.');
  const anchor: [number, number] = [
      Math.min(input.anchor[0], input.focus[0]),
      Math.min(input.anchor[1], input.focus[1]),
    ],
    focus: [number, number] = [Math.max(input.anchor[0], input.focus[0]), Math.max(input.anchor[1], input.focus[1])];
  if (focus[0] >= shape[0] || focus[1] >= shape[1])
    throw new CheckboxError(CheckboxErrorCode.Invalid, 'Checkbox range exceeds the Sheet.', { shape });
  return { anchor, focus };
}
