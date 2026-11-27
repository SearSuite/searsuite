import {
  type SheetInteractionReducer,
  type SheetInteractionSignal,
  type SheetInteractionState,
  SheetInteractionReducerRegistry,
} from '@searsuite/sear-assembly-plugin';
import { type Point } from '@searsuite/sear-foundation-rect';
import { SheetSelectionInteractionName, type SheetSelectionSource } from './SheetSelectionPipelineNames';

/** Public contract for SelectionChangedInteractionSignal. */
export interface SelectionChangedInteractionSignal extends SheetInteractionSignal {
  type: SheetSelectionInteractionName.Changed;
  anchor: Point;
  focus: Point;
  source: SheetSelectionSource;
}

const selectionChangedReducer: SheetInteractionReducer = {
  type: SheetSelectionInteractionName.Changed,
  reduce(state: Readonly<SheetInteractionState>, rawSignal: SheetInteractionSignal): SheetInteractionState {
    const signal = rawSignal as SelectionChangedInteractionSignal;
    return {
      ...state,
      selection: {
        anchor: signal.anchor,
        focus: signal.focus,
        source: signal.source,
      },
      selectionRevision: state.selectionRevision + 1,
    };
  },
};

/** Registers Selection's local interaction projection once per DI container. */
export function registerSheetSelectionInteractionReducers(registry: SheetInteractionReducerRegistry): void {
  if (!registry.get(SheetSelectionInteractionName.Changed)) registry.register(selectionChangedReducer);
}
