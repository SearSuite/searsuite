import { defineStateObservation } from '@searsuite/sear-foundation-subscription';

/** Whether one inline style can be applied, is active, and has a common value. */
export interface SheetEmbeddedInlineStyleStatus {
  readonly enabled: boolean;
  readonly active: boolean;
  /** The common selected value, or null when unset or mixed. */
  readonly value: unknown | null;
}

/** Inline-style state exposed by a Sheet embedded editor while editing a cell.
 *
 * Keys are plugin-owned persisted style keys (for example, `bold` or
 * `fontSize`). Keeping the state keyed by the stable style key lets third-party
 * inline-style extensions participate without changing this contract.
 */
export type SheetEmbeddedInlineStyleState = Readonly<Record<string, SheetEmbeddedInlineStyleStatus>>;

/** Current inline-style availability and activation for the embedded selection. */
export const SheetEmbeddedInlineStyleObservation =
  defineStateObservation<SheetEmbeddedInlineStyleState>('sheet.embedded.inlineStyles');

/** Undo and redo availability for the active embedded cell edit. */
export interface SheetEmbeddedEditHistoryState {
  readonly editing: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export const SheetEmbeddedEditHistoryObservation =
  defineStateObservation<SheetEmbeddedEditHistoryState>('sheet.embedded.editHistory');
