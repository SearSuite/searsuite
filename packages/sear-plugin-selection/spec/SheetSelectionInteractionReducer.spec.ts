import { SheetInteractionReducerRegistry } from '@searsuite/sear-assembly-core';
import { registerSheetSelectionInteractionReducers } from '../src/SheetSelectionInteractionReducer';
import { SheetSelectionInteractionName } from '../src/SheetSelectionPipelineNames';

describe('SheetSelectionInteractionReducer', () => {
  it('registers only if not already registered', () => {
    const registry = new SheetInteractionReducerRegistry();
    // 1. Not registered, should register
    registerSheetSelectionInteractionReducers(registry);
    const reducer = registry.get(SheetSelectionInteractionName.Changed);
    expect(reducer).toBeDefined();

    // Call reduce to cover it
    const state = { selectionRevision: 1 } as any;
    const signal = {
      type: SheetSelectionInteractionName.Changed,
      anchor: [0, 0],
      focus: [1, 1],
      source: 'ui',
    } as any;
    const nextState = reducer!.reduce(state, signal);
    expect(nextState.selectionRevision).toBe(2);
    expect(nextState.selection!.focus).toEqual([1, 1]);

    const spy = jest.spyOn(registry, 'register');
    // 2. Already registered, should not register again
    registerSheetSelectionInteractionReducers(registry);
    expect(spy).not.toHaveBeenCalled();
  });
});
