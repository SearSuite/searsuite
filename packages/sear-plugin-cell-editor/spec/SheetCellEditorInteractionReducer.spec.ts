import { registerSheetCellEditorInteractionReducers } from '../src/SheetCellEditorInteractionReducer';
import { SheetInteractionReducerRegistry } from '@searsuite/sear-assembly-plugin';
import { SheetCellEditorInteractionName } from '../src/SheetCellEditorPipelineNames';

describe('SheetCellEditorInteractionReducer', () => {
  it('registers reducers when they are not already registered', () => {
    const registry = new SheetInteractionReducerRegistry();
    jest.spyOn(registry, 'get').mockReturnValue(undefined);
    jest.spyOn(registry, 'register');

    registerSheetCellEditorInteractionReducers(registry);

    expect(registry.register).toHaveBeenCalledTimes(2);
  });

  it('does not register reducers when they are already registered', () => {
    const registry = new SheetInteractionReducerRegistry();
    jest.spyOn(registry, 'get').mockReturnValue({} as any);
    jest.spyOn(registry, 'register');

    registerSheetCellEditorInteractionReducers(registry);

    expect(registry.register).not.toHaveBeenCalled();
  });

  it('tests the actual reducers', () => {
    const registry = new SheetInteractionReducerRegistry();
    registerSheetCellEditorInteractionReducers(registry);

    const startReducer = registry.get(SheetCellEditorInteractionName.SessionStarted)!;
    const state = { selectionRevision: 123 } as any;
    const newState = startReducer.reduce(state, {
      type: SheetCellEditorInteractionName.SessionStarted,
      target: { x: 1, y: 1 },
      editor: 'test',
    } as any);
    expect(newState).toEqual({
      selectionRevision: 123,
      editSession: { target: { x: 1, y: 1 }, editor: 'test' },
      suppressedSelectionRevision: 123,
    });

    const endReducer = registry.get(SheetCellEditorInteractionName.SessionEnded)!;
    const state2 = { editSession: { target: { x: 1, y: 1 }, editor: 'test' } } as any;
    const newState2 = endReducer.reduce(state2, {
      type: SheetCellEditorInteractionName.SessionEnded,
      reason: 'test',
    } as any);
    expect(newState2).toEqual({ editSession: null });
  });
});
