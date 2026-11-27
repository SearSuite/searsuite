import { SheetHistoryKeyboardView } from '@searsuite/sear-render';
import { type SheetLifecycleContext } from '@searsuite/sear-assembly-core';
import {
  Pipeline,
  PipelineStepKind,
  SheetInteractionStore,
  type SheetInteractionState,
} from '@searsuite/sear-assembly-plugin';
import {
  defineSheetCommand,
  PipelineExecutionCommand,
  SheetCommandBus,
  createSheetTransaction,
  type SheetCommandResult,
} from '@searsuite/sear-assembly-commands';
import { Plugin, PluginKey, PluginManager, SessionStateRegistry } from '@searsuite/sear-assembly-plugin';
import {
  MatrixOTActionName,
  MatrixTransactionOT,
  MatrixTransactionOTRelation,
  type Operation,
} from '@searsuite/sear-domain-ot';
import { TRANSACTION_ORIGIN_META_KEY, type Transaction, TransactionOrigin } from '@searsuite/sear-domain-transaction';
import { type Platform } from '@searsuite/sear-foundation-platform';
import { ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import { KeyboardRouter, type KeyboardRouterHandlers } from '@searsuite/sear-render-input';

import {
  NoopSheetExternalHistory,
  RedoSheetCommand,
  SheetHistoryPlugin,
  SheetHistorySessionStateDefinition,
  SheetHistoryStatusObservation,
  UndoSheetCommand,
  type SheetHistorySessionState,
} from '../src';

class TestKeyboardRouter extends KeyboardRouter {
  public handlers: KeyboardRouterHandlers = {};
  public startListener(): void {}
  public stopListener(): void {}
  public subscribe(handlers: KeyboardRouterHandlers): void {
    this.handlers = { ...this.handlers, ...handlers };
  }
}

class MatrixOwnerPlugin extends Plugin<null> {
  public readonly warnOnDuplicateDepth = false;
  public override readonly transactionOT = {
    ownerId: 'test.history-owner',
    definition: MatrixTransactionOT,
    relations: [MatrixTransactionOTRelation],
  };

  public constructor(key: PluginKey) {
    super({ key, state: null });
  }
  public apply(): null {
    return null;
  }
  public registerState() {
    return { key: this.key, state: null };
  }
}

interface HistoryHarness {
  readonly commands: SheetCommandBus;
  readonly observations: ObservationRegistry;
  readonly history: SheetHistoryPlugin;
  readonly keyboard: TestKeyboardRouter;
  readonly plugins: PluginManager;
  readonly ownerKey: PluginKey;
  readonly executePipeline: jest.Mock<void, [Pipeline]>;
  readonly warn: jest.Mock;
  setEditing(editing: boolean): void;
}

function createHarness(options: { withAdapter?: boolean } = {}): HistoryHarness {
  const ownerKey = new PluginKey('HistoryOwner');
  const plugins = new PluginManager();
  if (options.withAdapter !== false) plugins.registerPlugin(new MatrixOwnerPlugin(ownerKey));
  const keyboard = new TestKeyboardRouter();
  const interactionState: SheetInteractionState = {
    selection: null,
    selectionRevision: 0,
    suppressedSelectionRevision: null,
    editSession: null,
  };
  const interactionListeners = new Set<() => void>();
  const interaction = {
    getState: () => interactionState,
    subscribe: (listener: () => void) => {
      interactionListeners.add(listener);
      return () => interactionListeners.delete(listener);
    },
  } as unknown as SheetInteractionStore;
  const warn = jest.fn();
  const platform = { warn } as unknown as Platform;
  const commands = new SheetCommandBus(platform);
  const observations = new ObservationRegistry(platform);
  const executePipeline = jest.fn<void, [Pipeline]>();
  commands.bind({
    executePipeline: (pipeline) => {
      if (pipeline.steps.every((step) => step.kind === PipelineStepKind.LocalAction)) {
        pipeline.steps.forEach((step) => step.localAction?.());
        return;
      }
      executePipeline(pipeline);
    },
    applyEffect: () => void 0,
  });
  const history = new SheetHistoryPlugin(plugins, interaction, platform, commands, new NoopSheetExternalHistory());
  history.registerCommands(commands);
  history.registerObservations(observations);
  history.start();
  new SheetHistoryKeyboardView(keyboard, commands).initializeView();
  return {
    commands,
    observations,
    history,
    keyboard,
    plugins,
    ownerKey,
    executePipeline,
    warn,
    setEditing(editing: boolean): void {
      interactionState.editSession = editing ? { target: [0, 0], editor: 'test' } : null;
      interactionListeners.forEach((listener) => listener());
    },
  };
}

function updateCell(row: number, value: string | null, prev: string | null): Operation {
  return { p: [row, 0], [MatrixOTActionName.UpdateCell]: { value, prev } } as Operation;
}

function registerEditCommand(
  harness: HistoryHarness,
  id: string,
  transactions: Transaction[],
): ReturnType<typeof defineSheetCommand> {
  const definition = defineSheetCommand(id);
  harness.commands.register(definition, () => {
    const pipeline = new Pipeline(id);
    transactions.forEach((transaction, index) => pipeline.addTransaction(`edit:${index}`, transaction));
    return new PipelineExecutionCommand(id, pipeline);
  });
  return definition;
}

function registerGroupedEditCommand(
  harness: HistoryHarness,
  id: string,
  transaction: Transaction,
  historyGroup: NonNullable<SheetCommandResult['historyGroup']>,
): ReturnType<typeof defineSheetCommand> {
  const definition = defineSheetCommand(id);
  harness.commands.register(definition, () => ({
    id,
    execute: () => ({
      pipeline: new Pipeline(id).addTransaction(id, transaction),
      historyGroup,
    }),
  }));
  return definition;
}

describe('SheetHistoryPlugin', () => {
  it('rejects replacement command and session registries after binding', () => {
    const { history } = createHarness();
    const session = new SessionStateRegistry();
    history.registerSessionState(session);

    expect(() => history.registerCommands(new SheetCommandBus())).toThrow('already bound');
    expect(() => history.registerSessionState(new SessionStateRegistry())).toThrow('already bound');
  });

  it('does not expose mutable history through plugin state or session capture', () => {
    const harness = createHarness();
    const edit = registerEditCommand(harness, 'test.historySnapshot', [
      createSheetTransaction(harness.ownerKey, [updateCell(0, 'value', null)]),
    ]);
    harness.commands.run(edit, void 0);

    expect(harness.history.getState()).toBeNull();
    const session = new SessionStateRegistry();
    harness.history.registerSessionState(session);
    const captured = session.capture()[SheetHistorySessionStateDefinition.id] as SheetHistorySessionState;
    captured.undoStack.length = 0;

    expect(harness.history.getStatus().canUndo).toBe(true);
    harness.commands.run(UndoSheetCommand, void 0);
    expect(harness.executePipeline.mock.calls.at(-1)?.[0].steps[0]?.transaction?.operations[0]).toEqual(
      updateCell(0, null, 'value'),
    );
  });

  it('does not expose history mutation helpers through a retained plugin reference', () => {
    const harness = createHarness();
    const retained = harness.history as unknown as Record<string, unknown>;
    const edit = registerEditCommand(harness, 'test.historyPrivateHelpers', [
      createSheetTransaction(harness.ownerKey, [updateCell(0, 'value', null)]),
    ]);

    harness.commands.run(edit, void 0);
    expect(harness.history.getStatus().canUndo).toBe(true);
    expect(retained['record']).toBeUndefined();
    expect(retained['clearHistory']).toBeUndefined();
    expect(retained['restoreSessionState']).toBeUndefined();
    expect(retained['historyState']).toBeUndefined();
    expect(harness.history.getStatus().canUndo).toBe(true);
  });

  it('does not duplicate history when retained subscription fields are forged', () => {
    const harness = createHarness();
    Object.assign(harness.history, { disposeCommandListener: null, disposeInteractionListener: null });
    harness.history.start();
    const edit = registerEditCommand(harness, 'test.historyRetainedStart', [
      createSheetTransaction(harness.ownerKey, [updateCell(0, 'value', null)]),
    ]);

    harness.commands.run(edit, void 0);
    const session = new SessionStateRegistry();
    harness.history.registerSessionState(session);
    const captured = session.capture()[SheetHistorySessionStateDefinition.id] as SheetHistorySessionState;
    expect(captured.undoStack).toHaveLength(1);
  });

  it('rejects a retained history restore callback after session restoration closes', () => {
    const harness = createHarness();
    const edit = registerEditCommand(harness, 'test.historyRetainedRestore', [
      createSheetTransaction(harness.ownerKey, [updateCell(0, 'value', null)]),
    ]);
    harness.commands.run(edit, void 0);
    const session = new SessionStateRegistry();
    const register = jest.spyOn(session, 'register');
    harness.history.registerSessionState(session);
    const restore = register.mock.calls[0]![1].restore as (state: SheetHistorySessionState) => void;
    session.sealRestoration({});

    expect(() => restore({ undoStack: [], redoStack: [] })).toThrow('restoration is closed');
    expect(harness.history.getStatus().canUndo).toBe(true);
  });

  it('records one command as one history entry and moves it between undo and redo stacks', () => {
    const harness = createHarness();
    const edit = registerEditCommand(harness, 'test.editTwoCells', [
      createSheetTransaction(harness.ownerKey, [updateCell(0, 'first', null)]),
      createSheetTransaction(harness.ownerKey, [updateCell(1, 'second', null)]),
    ]);

    harness.commands.run(edit, void 0);
    expect(harness.history.getStatus()).toEqual({ canUndo: true, canRedo: false });

    harness.commands.run(UndoSheetCommand, void 0);
    const undo = harness.executePipeline.mock.calls.at(-1)?.[0];
    expect(undo?.steps.map((step) => step.transaction?.operations[0])).toEqual([
      updateCell(1, null, 'second'),
      updateCell(0, null, 'first'),
    ]);
    expect(harness.history.getStatus()).toEqual({ canUndo: false, canRedo: true });

    harness.commands.run(RedoSheetCommand, void 0);
    const redo = harness.executePipeline.mock.calls.at(-1)?.[0];
    expect(redo?.steps.map((step) => step.transaction?.operations[0])).toEqual([
      updateCell(0, 'first', null),
      updateCell(1, 'second', null),
    ]);
    expect(harness.history.getStatus()).toEqual({ canUndo: true, canRedo: false });
  });

  it('groups adjacent cut and paste commits into one undo and redo entry', () => {
    const harness = createHarness();
    const cut = registerGroupedEditCommand(
      harness,
      'test.groupedCut',
      createSheetTransaction(harness.ownerKey, [updateCell(0, null, 'source')]),
      { id: 'cut-1', phase: 'begin' },
    );
    const paste = registerGroupedEditCommand(
      harness,
      'test.groupedPaste',
      createSheetTransaction(harness.ownerKey, [updateCell(1, 'source', null)]),
      { id: 'cut-1', phase: 'end' },
    );

    harness.commands.run(cut, void 0);
    harness.commands.run(paste, void 0);
    harness.commands.run(UndoSheetCommand, void 0);
    expect(harness.executePipeline.mock.calls.at(-1)?.[0].steps.map((step) => step.transaction?.operations[0])).toEqual(
      [updateCell(1, null, 'source'), updateCell(0, 'source', null)],
    );
    expect(harness.history.getStatus()).toEqual({ canUndo: false, canRedo: true });

    harness.commands.run(RedoSheetCommand, void 0);
    expect(harness.executePipeline.mock.calls.at(-1)?.[0].steps.map((step) => step.transaction?.operations[0])).toEqual(
      [updateCell(0, null, 'source'), updateCell(1, 'source', null)],
    );
  });

  it('keeps a cut separate when another edit commits before its paste', () => {
    const harness = createHarness();
    const cut = registerGroupedEditCommand(
      harness,
      'test.interruptedCut',
      createSheetTransaction(harness.ownerKey, [updateCell(0, null, 'source')]),
      { id: 'cut-2', phase: 'begin' },
    );
    const unrelated = registerEditCommand(harness, 'test.interveningEdit', [
      createSheetTransaction(harness.ownerKey, [updateCell(2, 'other', null)]),
    ]);
    const paste = registerGroupedEditCommand(
      harness,
      'test.interruptedPaste',
      createSheetTransaction(harness.ownerKey, [updateCell(1, 'source', null)]),
      { id: 'cut-2', phase: 'end' },
    );

    harness.commands.run(cut, void 0);
    harness.commands.run(unrelated, void 0);
    harness.commands.run(paste, void 0);
    harness.commands.run(UndoSheetCommand, void 0);
    expect(harness.executePipeline.mock.calls.at(-1)?.[0].steps.map((step) => step.transaction?.operations[0])).toEqual(
      [updateCell(1, null, 'source')],
    );
    expect(harness.history.getStatus().canUndo).toBe(true);
  });

  it('keeps the history stacks unchanged when undo execution fails', () => {
    const harness = createHarness();
    const edit = registerEditCommand(harness, 'test.failedUndo', [
      createSheetTransaction(harness.ownerKey, [updateCell(0, 'value', null)]),
    ]);
    harness.commands.run(edit, void 0);
    harness.executePipeline.mockImplementationOnce(() => {
      throw new Error('undo failed');
    });

    expect(() => harness.commands.run(UndoSheetCommand, void 0)).toThrow('undo failed');
    expect(harness.history.getStatus()).toEqual({ canUndo: true, canRedo: false });

    harness.commands.run(UndoSheetCommand, void 0);
    expect(harness.history.getStatus()).toEqual({ canUndo: false, canRedo: true });
  });

  it('keeps only the latest 100 history entries', () => {
    const harness = createHarness();
    const edits = Array.from({ length: 101 }, (_, row) =>
      registerEditCommand(harness, `test.capacity.${row}`, [
        createSheetTransaction(harness.ownerKey, [updateCell(row, `value-${row}`, null)]),
      ]),
    );
    edits.forEach((edit) => harness.commands.run(edit, void 0));

    const undoneRows: number[] = [];
    while (harness.history.getStatus().canUndo) {
      harness.commands.run(UndoSheetCommand, void 0);
      const operation = harness.executePipeline.mock.calls.at(-1)?.[0].steps[0]?.transaction?.operations[0];
      undoneRows.push(operation?.p[0] as number);
    }

    expect(undoneRows).toHaveLength(100);
    expect(undoneRows.at(0)).toBe(100);
    expect(undoneRows.at(-1)).toBe(1);
  });

  it('clears redo history when a new edit follows undo', () => {
    const harness = createHarness();
    const firstEdit = registerEditCommand(harness, 'test.firstBranch', [
      createSheetTransaction(harness.ownerKey, [updateCell(0, 'first', null)]),
    ]);
    const replacementEdit = registerEditCommand(harness, 'test.replacementBranch', [
      createSheetTransaction(harness.ownerKey, [updateCell(0, 'replacement', null)]),
    ]);

    harness.commands.run(firstEdit, void 0);
    harness.commands.run(UndoSheetCommand, void 0);
    expect(harness.history.getStatus()).toEqual({ canUndo: false, canRedo: true });

    harness.commands.run(replacementEdit, void 0);
    expect(harness.history.getStatus()).toEqual({ canUndo: true, canRedo: false });
  });

  it('rebases retained history over remote structure changes without recording the remote command', () => {
    const harness = createHarness();
    const edit = registerEditCommand(harness, 'test.editCell', [
      createSheetTransaction(harness.ownerKey, [updateCell(1, 'value', null)]),
    ]);
    harness.commands.run(edit, void 0);

    const remote = registerEditCommand(harness, 'test.remoteInsert', [
      createSheetTransaction(harness.ownerKey, [{ p: [0], [MatrixOTActionName.RowInsert]: [null] } as Operation], {
        [TRANSACTION_ORIGIN_META_KEY]: TransactionOrigin.Remote,
      }),
    ]);
    harness.commands.run(remote, void 0);
    harness.commands.run(UndoSheetCommand, void 0);

    const undoOperation = harness.executePipeline.mock.calls.at(-1)?.[0].steps[0]?.transaction?.operations[0];
    expect(undoOperation?.p).toEqual([2, 0]);
    expect(harness.history.getStatus()).toEqual({ canUndo: false, canRedo: true });
  });

  it('records local-only transaction owners independently from collaboration and ignores unknown owners', () => {
    const local = createHarness();
    const localEdit = registerEditCommand(local, 'test.localOnly', [
      createSheetTransaction(local.ownerKey, [updateCell(0, 'value', null)]),
    ]);
    local.commands.run(localEdit, void 0);
    expect(local.history.getStatus().canUndo).toBe(true);

    const missing = createHarness();
    const supported = registerEditCommand(missing, 'test.beforeUnsupported', [
      createSheetTransaction(missing.ownerKey, [updateCell(0, 'first', null)]),
    ]);
    missing.commands.run(supported, void 0);
    expect(missing.history.getStatus().canUndo).toBe(true);
    missing.plugins.unregisterPlugin(missing.ownerKey);
    const unsupported = registerEditCommand(missing, 'test.unsupported', [
      createSheetTransaction(missing.ownerKey, [updateCell(1, 'value', null)]),
    ]);
    missing.commands.run(unsupported, void 0);
    expect(missing.history.getStatus().canUndo).toBe(true);
  });

  it('keeps editor instances isolated and routes semantic keyboard shortcuts', () => {
    const first = createHarness();
    const second = createHarness();
    const edit = registerEditCommand(first, 'test.firstEditorEdit', [
      createSheetTransaction(first.ownerKey, [updateCell(0, 'value', null)]),
    ]);
    first.commands.run(edit, void 0);

    expect(first.history.getStatus().canUndo).toBe(true);
    expect(second.history.getStatus().canUndo).toBe(false);
    first.setEditing(true);
    expect(first.history.getStatus().canUndo).toBe(false);
    first.keyboard.handlers.onUndo?.();
    expect(first.history.getStatus()).toEqual({ canUndo: false, canRedo: false });
    first.setEditing(false);
    expect(first.history.getStatus().canUndo).toBe(true);
    first.keyboard.handlers.onUndo?.();
    expect(first.history.getStatus()).toEqual({ canUndo: false, canRedo: true });
    first.keyboard.handlers.onRedo?.();
    expect(first.history.getStatus()).toEqual({ canUndo: true, canRedo: false });
  });

  it('exposes snapshot-backed disposable status observations to the host', () => {
    const harness = createHarness();
    const statuses: Array<{ canUndo: boolean; canRedo: boolean }> = [];
    const initial = harness.observations.getSnapshot(SheetHistoryStatusObservation);
    const dispose = harness.observations.subscribe(SheetHistoryStatusObservation, (status) => statuses.push(status));
    const edit = registerEditCommand(harness, 'test.hostStatusEdit', [
      createSheetTransaction(harness.ownerKey, [updateCell(0, 'value', null)]),
    ]);

    expect(initial).toEqual({ canUndo: false, canRedo: false });
    expect(statuses).toEqual([{ canUndo: false, canRedo: false }]);

    harness.commands.run(edit, void 0);
    expect(harness.observations.getSnapshot(SheetHistoryStatusObservation)).toEqual({
      canUndo: true,
      canRedo: false,
    });
    harness.setEditing(true);
    harness.setEditing(false);
    expect(statuses).toEqual([
      { canUndo: false, canRedo: false },
      { canUndo: true, canRedo: false },
      { canUndo: false, canRedo: false },
      { canUndo: true, canRedo: false },
    ]);

    dispose();
    dispose();
    harness.commands.run(UndoSheetCommand, void 0);
    expect(statuses).toHaveLength(4);
  });

  it('isolates host observation listener failures and still returns a disposer', () => {
    const harness = createHarness();
    const listenerError = new Error('host listener failed');
    const listener = jest.fn(() => {
      throw listenerError;
    });

    const dispose = harness.observations.subscribe(SheetHistoryStatusObservation, listener);

    expect(listener).toHaveBeenCalledWith({ canUndo: false, canRedo: false });
    expect(harness.warn).toHaveBeenCalledWith('Observation "sheet.history.status" listener failed.', listenerError);
    expect(() => dispose()).not.toThrow();
    expect(() => dispose()).not.toThrow();
  });

  it('publishes status and stops observing commands after lifecycle teardown', () => {
    const harness = createHarness();
    const statuses: Array<{ canUndo: boolean; canRedo: boolean }> = [];
    const dispose = harness.observations.subscribe(SheetHistoryStatusObservation, (status) => statuses.push(status));
    const edit = registerEditCommand(harness, 'test.afterDestroy', [
      createSheetTransaction(harness.ownerKey, [updateCell(0, 'value', null)]),
    ]);

    harness.history.destroy();
    harness.commands.run(edit, void 0);
    dispose();

    expect(statuses).toEqual([{ canUndo: false, canRedo: false }]);
    expect(harness.history.getStatus().canUndo).toBe(false);
  });
});
