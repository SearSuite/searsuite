import { type Transaction } from '@searsuite/sear-domain-transaction';
import { type SheetQueryRegistry } from '@searsuite/sear-assembly-commands';
import { type SheetCellInputValidationRegistry } from '@searsuite/sear-domain-cell-types';
/** Dependencies supplied by the composition root; persistent data stays with its original owners. */
export interface SheetDropdownOptions {
  /** Editor-local query bus for validation-owner projections. */ readonly queries: SheetQueryRegistry;
  /** Shared edit validation, including overlapping rules. */ readonly validation: SheetCellInputValidationRegistry;
  /** Reads dimensions for coordinate validation. */ readShape(): readonly [number, number];
  /** Reads display text, including formula results and structured cells. */ readText(
    row: number,
    column: number,
  ): string;
  /** Visits nonempty source values in provider order; raw preserves typed values behind formatted labels. */ forEachSourceValue(
    start: readonly [number, number],
    end: readonly [number, number],
    visit: (display: unknown, raw?: unknown) => void,
  ): void;
  /** Plans a text or empty replacement as an ordinary cell-owner transaction. */ createValueTransaction(
    row: number,
    column: number,
    text: string | null,
  ): Transaction;
  /** Optionally persists a referenced primitive without converting it to text. */ createTypedValueTransaction?(
    row: number,
    column: number,
    value: number | boolean,
  ): Transaction;
}
