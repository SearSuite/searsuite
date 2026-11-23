import { defineStateObservation } from '@searsuite/sear-foundation-subscription';
import type { Point } from '@searsuite/sear-foundation-rect';

/** Source text and transient edit selection for the active Sheet cell. */
export interface SheetFormulaBarState {
  readonly cell: Point | null;
  readonly range: { readonly start: Point; readonly end: Point } | null;
  readonly text: string;
  readonly editing: boolean;
  readonly selectionStart: number;
  readonly selectionEnd: number;
}

export const SheetFormulaBarObservation =
  defineStateObservation<SheetFormulaBarState>('sheet.cellEditor.formulaBar');
