import {
  type SheetInteractionReducer,
  type SheetInteractionSignal,
  type SheetInteractionState,
  SheetInteractionReducerRegistry,
} from '@searsuite/sear-assembly-core';
import { type Point } from '@searsuite/sear-foundation-rect';
import {
  SheetCellEditorInteractionName,
  type SheetCellEditorExitReason,
  type SheetCellEditorKind,
} from './SheetCellEditorPipelineNames';

/** Public contract for EditSessionStartedInteractionSignal. */
export interface EditSessionStartedInteractionSignal extends SheetInteractionSignal {
  type: SheetCellEditorInteractionName.SessionStarted;
  target: Point;
  editor: SheetCellEditorKind;
}

/** Public contract for EditSessionEndedInteractionSignal. */
export interface EditSessionEndedInteractionSignal extends SheetInteractionSignal {
  type: SheetCellEditorInteractionName.SessionEnded;
  reason: SheetCellEditorExitReason;
}

const editSessionStartedReducer: SheetInteractionReducer = {
  type: SheetCellEditorInteractionName.SessionStarted,
  reduce(state: Readonly<SheetInteractionState>, rawSignal: SheetInteractionSignal): SheetInteractionState {
    const signal = rawSignal as EditSessionStartedInteractionSignal;
    return {
      ...state,
      editSession: { target: signal.target, editor: signal.editor },
      suppressedSelectionRevision: state.selectionRevision,
    };
  },
};

const editSessionEndedReducer: SheetInteractionReducer = {
  type: SheetCellEditorInteractionName.SessionEnded,
  reduce(state: Readonly<SheetInteractionState>): SheetInteractionState {
    return { ...state, editSession: null };
  },
};

/** Registers Cell Editor's local interaction projections once per DI container. */
export function registerSheetCellEditorInteractionReducers(registry: SheetInteractionReducerRegistry): void {
  if (!registry.get(SheetCellEditorInteractionName.SessionStarted)) registry.register(editSessionStartedReducer);
  if (!registry.get(SheetCellEditorInteractionName.SessionEnded)) registry.register(editSessionEndedReducer);
}
