import {
  defineSheetCommand,
  defineSheetQuery,
  type SheetRangeBounds,
  type SheetQueryRegistry,
} from '@searsuite/sear-assembly-commands';
import { type Point } from '@searsuite/sear-foundation-rect';
import { type SheetSelectionSource } from './SheetSelectionPipelineNames';

/** How a selection command updates disjoint local selections. */
export enum SheetAdditionalSelectionMode {
  AppendCurrent = 'append-current',
  Clear = 'clear',
  Preserve = 'preserve',
}

/** Public programmatic input for selecting a rectangular sheet range. */
export interface SheetSelectRangeInput {
  /** Final selected range anchor. */
  readonly anchor: Point;
  /** Final selected range focus. */
  readonly focus: Point;
  /** Optional active anchor stored for in-progress pointer or keyboard interactions. */
  readonly activeAnchor?: Point;
  /** Optional active focus stored for in-progress pointer or keyboard interactions. */
  readonly activeFocus?: Point;
  /** Origin of this selection change. */
  readonly source?: SheetSelectionSource;
  /** Whether the command should also scroll the selection into view. */
  readonly ensureVisible?: boolean;
  /** Transition applied to disjoint local selections at commit. */
  readonly additionalSelectionMode?: SheetAdditionalSelectionMode;
  /** Keyboard navigation anchor and cursor to publish with this selection. */
  readonly navigation?: { readonly origin: Point; readonly cursor: Point };
}

/** Public contract for SheetEnsureSelectionVisibleInput. */
export interface SheetEnsureSelectionVisibleInput extends SheetSelectRangeInput {}

export const SelectRangeCommand = defineSheetCommand<SheetSelectRangeInput>('sheet.selectRange');

export const EnsureSelectionVisibleCommand =
  defineSheetCommand<SheetEnsureSelectionVisibleInput>('view.ensureSelectionVisible');

/** Typed query for the active rectangular selection, independent of selection storage. */
export const GetSelection = defineSheetQuery<void, SheetRangeBounds | null>('sheet.selection.get');
/** All disjoint selections, with the current active rectangle last. */
export const GetSelections = defineSheetQuery<void, readonly SheetRangeBounds[]>('sheet.selection.getAll');
/** Detached keyboard navigation anchors for diagnostics and extensions. */
export const GetSelectionNavigation = defineSheetQuery<
  void,
  {
    readonly origin: Point | null;
    readonly cursor: Point | null;
  }
>('sheet.selection.navigation');
/** Clears every rectangle of a disjoint selection in one data transaction. */
export const ClearSelectedContentsCommand = defineSheetCommand<void>('sheet.selection.clearContents');

/** Registers the selection query against an editor-local query registry. */
export function registerSelectionQueries(
  queries: SheetQueryRegistry,
  readSelection: () => SheetRangeBounds | null,
): void {
  queries.register(GetSelection, () => readSelection());
}
