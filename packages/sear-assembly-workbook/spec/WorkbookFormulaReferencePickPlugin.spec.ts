import { WorkbookCommandBus } from '@searsuite/sear-assembly-workbook-kernel';
import { ActivateWorkbookSheetCommand } from '@searsuite/sear-assembly-workbook-kernel';
import {
  CancelWorkbookFormulaReferencePickCommand,
  CaptureWorkbookFormulaDraftCommand,
  PickWorkbookFormulaReferenceCommand,
  RestoreWorkbookFormulaDraftCommand,
} from '@searsuite/sear-assembly-workbook-kernel';
import { WorkbookFormulaReferencePickPlugin } from '@searsuite/sear-assembly-workbook-kernel';
import { CancelCellEditCommand, RestoreFormulaEditDraftCommand } from '@searsuite/sear-plugin-cell-editor';
import { EnsureSelectionVisibleCommand } from '@searsuite/sear-plugin-selection';

function createHarness(failActivation = false) {
  const callbacks: Array<() => void> = [];
  const platform = {
    setTimeout: jest.fn((callback: () => void) => {
      callbacks.push(callback);
      return callbacks.length;
    }),
    clearTimeout: jest.fn(),
  };
  const commands = new WorkbookCommandBus();
  let activeId = 'source';
  const draft = { cell: [0, 0] as const, text: '=SUM(', selectionStart: 5, selectionEnd: 5 };
  const sheetCommands = { has: jest.fn(() => true), run: jest.fn() };
  const editor = {
    queries: { has: jest.fn(() => true), run: jest.fn(() => (activeId === 'source' ? draft : null)) },
    commands: sheetCommands,
    services: { require: jest.fn(() => ({ keyboard: { subscribe: jest.fn() } })) },
  };
  const runtime = {
    commands,
    sheets: { getActiveId: () => activeId, getActiveClient: () => editor },
    document: {
      getState: () => ({
        sheets: [
          { id: 'source', name: 'Sheet1' },
          { id: 'target', name: 'Sheet2' },
        ],
      }),
    },
  };
  const plugin = new WorkbookFormulaReferencePickPlugin(platform as never);
  commands.register(ActivateWorkbookSheetCommand, ({ sheetId }) => {
    try {
      plugin.onBeforeSheetActivation();
      if (failActivation) throw new Error('activation failed');
      const before = activeId;
      activeId = sheetId;
      plugin.onTransactionCommitted({ before: { activeSheetId: before }, after: { activeSheetId: activeId } } as never);
      return { documentState: runtime.document.getState(), activeSheetEditorChanged: true } as never;
    } catch (error) {
      plugin.onSheetActivationFailed();
      throw error;
    }
  });
  plugin.registerCommands(commands);
  const dispose = plugin.initialize({ runtime } as never);
  return { callbacks, commands, dispose, draft, plugin, sheetCommands };
}

describe('WorkbookFormulaReferencePickPlugin', () => {
  it('rejects direct draft capture when a retained plugin has a forged command guard', () => {
    const { dispose, plugin, sheetCommands } = createHarness();
    Object.assign(plugin, { assertCommandBoundary: () => void 0 });

    expect(plugin).not.toHaveProperty('captureDraft');
    expect(plugin.hasPendingPick()).toBe(false);
    expect(sheetCommands.run).not.toHaveBeenCalled();
    dispose?.();
  });

  it('routes draft capture, picking and restoration through Workbook commands', () => {
    const { callbacks, commands, dispose, draft, plugin, sheetCommands } = createHarness();
    const started: string[] = [];
    commands.subscribe((event) => {
      if (event.phase === 'started') started.push(event.id);
    });

    Object.assign(plugin, { pending: { sourceId: 'target', draft }, context: null });
    expect(plugin.hasPendingPick()).toBe(false);
    commands.run(ActivateWorkbookSheetCommand, { sheetId: 'target' });
    Object.assign(plugin, { pending: null, context: null });
    expect(plugin.hasPendingPick()).toBe(true);
    expect(sheetCommands.run).toHaveBeenCalledWith(CancelCellEditCommand, void 0);
    plugin.pick([1, 1], [1, 1]);
    callbacks.shift()?.();

    expect(sheetCommands.run).toHaveBeenCalledWith(RestoreFormulaEditDraftCommand, {
      draft,
      reference: 'Sheet2!B2',
    });
    callbacks.shift()?.();
    expect(sheetCommands.run).toHaveBeenCalledWith(EnsureSelectionVisibleCommand, {
      anchor: draft.cell,
      focus: draft.cell,
    });
    expect(started).toEqual(
      expect.arrayContaining([
        CaptureWorkbookFormulaDraftCommand.id,
        PickWorkbookFormulaReferenceCommand.id,
        RestoreWorkbookFormulaDraftCommand.id,
      ]),
    );
    expect(plugin.hasPendingPick()).toBe(false);
    dispose?.();
  });

  it('replaces an existing sheet qualifier in a retained formula draft', () => {
    const { callbacks, commands, dispose, draft, plugin, sheetCommands } = createHarness();
    Object.assign(draft, { text: '=Sheet2!', selectionStart: 8, selectionEnd: 8 });
    commands.run(ActivateWorkbookSheetCommand, { sheetId: 'target' });
    plugin.pick([0, 0], [0, 0]);
    callbacks.shift()?.();

    expect(sheetCommands.run).toHaveBeenCalledWith(RestoreFormulaEditDraftCommand, {
      draft: { ...draft, selectionStart: 1 },
      reference: 'Sheet2!A1',
    });
    dispose?.();
  });

  it('routes cancellation through a command and returns to the source sheet', () => {
    const { callbacks, commands, dispose, plugin, sheetCommands } = createHarness();
    const started: string[] = [];
    commands.subscribe((event) => {
      if (event.phase === 'started') started.push(event.id);
    });

    commands.run(ActivateWorkbookSheetCommand, { sheetId: 'target' });
    plugin.cancelPendingPick();
    expect(plugin.hasPendingPick()).toBe(false);
    callbacks.shift()?.();

    expect(started).toContain(CancelWorkbookFormulaReferencePickCommand.id);
    expect(sheetCommands.run).not.toHaveBeenCalledWith(RestoreFormulaEditDraftCommand, expect.anything());
    dispose?.();
  });

  it('restores the source draft through a command when activation fails', () => {
    const { commands, dispose, draft, plugin, sheetCommands } = createHarness(true);

    expect(() => commands.run(ActivateWorkbookSheetCommand, { sheetId: 'target' })).toThrow('activation failed');
    expect(sheetCommands.run).toHaveBeenCalledWith(CancelCellEditCommand, void 0);
    expect(sheetCommands.run).toHaveBeenCalledWith(RestoreFormulaEditDraftCommand, { draft });
    expect(plugin.hasPendingPick()).toBe(false);
    dispose?.();
  });
});
