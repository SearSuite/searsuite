import { type CellMatrixElement } from '@searsuite/sear-domain-cell-types';
/** Stable persisted identifier owned by the checkbox extension. */
export const CheckboxCellType = 'checkbox';
/** A checkbox's persisted boolean state. */
export interface CheckboxCellValue extends CellMatrixElement {
  /** Feature-owned cell identifier. */ type: typeof CheckboxCellType;
  /** Boolean used directly by formula semantics. */ value: boolean;
}
/** Removal policies shared by command inputs and hosts. */
export const CheckboxRemovalMode = { Text: 'text', Clear: 'clear' } as const;
/** One supported removal policy. */
export type CheckboxRemovalMode = (typeof CheckboxRemovalMode)[keyof typeof CheckboxRemovalMode];
/** Reports whether a persisted value is a well-formed checkbox. */
export function isCheckboxCell(cell: CellMatrixElement | null | undefined): cell is CheckboxCellValue {
  return cell?.type === CheckboxCellType && typeof cell.value === 'boolean';
}
/** Converts explicit boolean editor text without coercing numbers or other strings. */
export function parseCheckboxText(text: string): boolean | null {
  const value = text.trim().toUpperCase();
  return value === 'TRUE' ? true : value === 'FALSE' ? false : null;
}
/** Formats the boolean display, editor and clipboard representation. */
export function checkboxText(value: boolean): string {
  return value ? 'TRUE' : 'FALSE';
}
