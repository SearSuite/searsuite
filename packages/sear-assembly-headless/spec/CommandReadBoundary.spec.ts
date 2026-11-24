/** @jest-environment node */

import { createHeadlessEditor, createHeadlessWorkbookEditor } from '../src';
import {
  createEmptySheetDocumentState,
  ExportSheetStateCommand,
  ResizeSheetViewportCommand,
  ScrollViewportToCommand,
  UpdateSheetDefaultConfigCommand,
  SheetPlugin,
  SheetRuntimeCapability,
  type SheetPluginRuntimeContext,
  type SheetPluginSetupContext,
} from '@searsuite/sear-assembly-setup';
import { PluginKey, type PluginManager, type SessionStateRegistry } from '@searsuite/sear-assembly-plugin';
import {
  createSheetTransaction,
  defineSheetCommand,
  defineSheetQuery,
  LocalActionCommand,
  TransactionPipelineCommand,
  type SheetCommandBus,
  type SheetQueryRegistry,
} from '@searsuite/sear-assembly-commands';
import { Pipeline, type SheetInteractionStore } from '@searsuite/sear-assembly-core';
import { Injectable } from '@searsuite/sear-foundation-di';
import { createWorkbookDocumentState } from '@searsuite/sear-domain-workbook';
import { WorkbookDocumentStateObservation, WorkbookRuntimeCapability } from '@searsuite/sear-assembly-workbook';
import { ReadSheetCellDataQuery, SheetDataPlugin, SheetMatrix, type SheetDataEngine, type SheetDataPluginState } from '@searsuite/sear-render-engine';
import { GetSelection, SelectRangeCommand, SheetSelectionPlugin } from '@searsuite/sear-plugin-selection';
import { ReadSheetCellFormatQuery } from '@searsuite/sear-plugin-cell-format';
import { FormulaInputAssistObservation } from '@searsuite/sear-plugin-cell-editor';
import { FormulaResultStore, RunFormulaBatchCommand, UnregisterFormulaProviderCommand, waitForFormulaIdle } from '@searsuite/sear-plugin-formula';
import { CellType } from '@searsuite/sear-domain-cell-types';
import { cellKey } from '@searsuite/sear-domain-formula-engine-ts';

let retainedDataState: SheetDataPluginState | null = null;
let retainedDataPlugin: SheetDataPlugin | null = null;
let retainedInteractionStore: SheetInteractionStore | null = null;
let retainedDataEngine: SheetDataEngine | null = null;
let retainedPluginManager: PluginManager<unknown, never> | null = null;
let retainedSelectionPlugin: SheetSelectionPlugin | null = null;
let retainedSessionRegistry: SessionStateRegistry | null = null;
let retainedCore: SheetPluginRuntimeContext['core'] | null = null;
let retainedCommands: SheetCommandBus | null = null;
let retainedCommandDisposer: (() => void) | null = null;
let startupWriteRejected = false;
let retainedFormulaProviderDisposer: (() => void) | null = null;
let retainedFormulaResultStore: FormulaResultStore | null = null;
const DirectStateWriteCommand = defineSheetCommand<void>('test.directStateWrite');
const DirectRegistryWriteCommand = defineSheetCommand<void>('test.directRegistryWrite');
const RegisterRuntimeCommand = defineSheetCommand<void>('test.registerRuntimeCommand');
const RuntimeCommand = defineSheetCommand<void>('test.runtimeCommand');
const SetProbeFormulaResultCommand = defineSheetCommand<void>('test.setProbeFormulaResult');
const CommitPrivateStateCommand = defineSheetCommand<void>('test.commitPrivateState');
const DirectPrivateStateWriteCommand = defineSheetCommand<void>('test.directPrivateStateWrite');
let retainedPrivateState: { nested: { value: number } } | null = null;
let retainedPrivatePlugin: PrivateStatePlugin | null = null;
let retainedRegisteredState: { nested: { value: number } } | null = null;
const CommitRetainedMatrixCommand = defineSheetCommand<void>('test.commitRetainedMatrix');
const ReadRetainedMatrixQuery = defineSheetQuery<void, string | undefined>('test.readRetainedMatrix');
let retainedInitialMatrix: RetainedMatrix | null = null;
let retainedStagedMatrix: RetainedMatrix | null = null;

class RetainedMatrix extends SheetMatrix {
  #privateValue = 'initial';
  public setPrivateValue(value: string): void { this.#privateValue = value; }
  public getPrivateValue(): string { return this.#privateValue; }
}

@Injectable()
class RetainedMatrixPlugin extends SheetPlugin<{ matrix: RetainedMatrix }> {
  public static readonly symbol = Symbol.for('RetainedMatrixPlugin');

  public constructor() {
    const matrix = new RetainedMatrix();
    matrix.addItem(0, 0, { type: 'string', value: 'initial' });
    retainedInitialMatrix = matrix;
    super({ key: new PluginKey('RetainedMatrixPlugin'), state: { matrix } });
  }

  public registerState() { return { key: this.key, state: this.getState(), dataEngine: { enabled: false } }; }
  public registerCommands(commands: SheetCommandBus): void {
    commands.register(CommitRetainedMatrixCommand, () =>
      new TransactionPipelineCommand(CommitRetainedMatrixCommand.id, createSheetTransaction(this.key, [])));
  }
  public registerQueries(queries: SheetQueryRegistry): void {
    queries.register(ReadRetainedMatrixQuery, () => this.getState().matrix.getItem(0, 0)?.value as string | undefined);
  }
  public getPluginConfig(): null { return null; }
  public apply(state: { matrix: RetainedMatrix }): { matrix: RetainedMatrix } {
    retainedStagedMatrix = state.matrix;
    state.matrix.addItem(0, 0, { type: 'string', value: 'committed' });
    return state;
  }
  public render(): null { return null; }
}

const registeredKey = new PluginKey('PrivateStatePlugin.extra');

@Injectable()
class PrivateStatePlugin extends SheetPlugin<{ nested: { value: number } }> {
  public static readonly symbol = Symbol.for('PrivateStatePlugin');

  public constructor() {
    super({ key: new PluginKey('PrivateStatePlugin'), state: { nested: { value: 1 } } });
  }

  public registerState() {
    retainedRegisteredState = { nested: { value: 3 } };
    return [
      { key: this.key, state: this.getState(), dataEngine: { enabled: false } },
      { key: registeredKey, state: retainedRegisteredState },
    ];
  }
  public registerCommands(commands: SheetCommandBus): void {
    commands.register(CommitPrivateStateCommand, () =>
      new TransactionPipelineCommand(CommitPrivateStateCommand.id, createSheetTransaction(this.key, [])));
    commands.register(DirectPrivateStateWriteCommand, () =>
      new LocalActionCommand(DirectPrivateStateWriteCommand.id, () => {
        retainedPrivateState!.nested.value = 99;
      }));
  }
  public getPluginConfig(): null { return null; }
  public override lockCommittedState(): void {}
  public override enforceStateWriteBoundary(): void {}
  public apply(state: { nested: { value: number } }): { nested: { value: number } } {
    return { nested: { value: state.nested.value + 1 } };
  }
  public render(): null { return null; }
  public initialize(): void {
    retainedPrivateState = this.getState();
    retainedPrivatePlugin = this;
  }
}

@Injectable()
class RetainedSheetStatePlugin extends SheetPlugin<null> {
  public static readonly symbol = Symbol.for('RetainedSheetStatePlugin');

  public constructor() {
    super({ key: new PluginKey('RetainedSheetStatePlugin'), state: null });
  }

  public registerState() { return { key: this.key, state: null }; }
  public configure(context: SheetPluginSetupContext): void {
    retainedFormulaProviderDisposer = context.runtime.formula.results.register({
      provider: { getFormulaResult: (row, col) => row === 100 && col === 100 ? 'probe' : undefined },
      priority: 200,
    });
  }
  public registerCommands(commands: SheetCommandBus): void {
    commands.register(RegisterRuntimeCommand, () => new LocalActionCommand(RegisterRuntimeCommand.id, () => {
      commands.register(RuntimeCommand, () => new LocalActionCommand(RuntimeCommand.id, () => void 0));
    }));
    retainedCommandDisposer = commands.register(DirectStateWriteCommand, () => new LocalActionCommand(DirectStateWriteCommand.id, () => {
      retainedDataState!.sheetData.addItem(0, 0, { type: 'string', value: 'changed' });
    }));
    commands.register(DirectRegistryWriteCommand, () => new LocalActionCommand(DirectRegistryWriteCommand.id, () => {
      retainedPluginManager!.unregisterPlugin(SheetDataPlugin.pluginKey);
    }));
    commands.register(SetProbeFormulaResultCommand, () => new LocalActionCommand(SetProbeFormulaResultCommand.id, () => {
      retainedFormulaResultStore!.set(cellKey(0, 0), [[1, 2]]);
    }));
  }
  public getPluginConfig(): null { return null; }
  public apply(): null { return null; }
  public render(): null { return null; }

  public onInitialDataCell(core: SheetPluginRuntimeContext['core']): void {
    try {
      (core.getPlugin(SheetDataPlugin.pluginKey) as SheetDataPluginState).sheetData.addItem(
        0, 0, { type: 'string', value: 'startup bypass' },
      );
    } catch {
      startupWriteRejected = true;
    }
  }

  public initialize({ core, runtime, container }: SheetPluginRuntimeContext): void {
    retainedDataState = core.getPlugin(SheetDataPlugin.pluginKey) as SheetDataPluginState;
    retainedDataPlugin = core.pluginManager.getAllPlugins().find((plugin) => plugin.key === SheetDataPlugin.pluginKey) as SheetDataPlugin;
    retainedInteractionStore = runtime.interaction.store;
    retainedDataEngine = core.getDataEngine();
    retainedPluginManager = core.pluginManager as unknown as PluginManager<unknown, never>;
    retainedSelectionPlugin = core.pluginManager.getAllPlugins()
      .find((plugin) => plugin.key === SheetSelectionPlugin.pluginKey) as SheetSelectionPlugin;
    retainedSessionRegistry = runtime.session;
    retainedCore = core;
    retainedCommands = runtime.commands;
    retainedFormulaResultStore = container.resolve<FormulaResultStore>(FormulaResultStore.symbol);
  }
}

it('rejects writes through a plugin-retained committed document state handle', () => {
  retainedDataState = null;
  retainedDataPlugin = null;
  retainedInteractionStore = null;
  retainedDataEngine = null;
  retainedPluginManager = null;
  retainedSelectionPlugin = null;
  retainedSessionRegistry = null;
  retainedCore = null;
  retainedCommands = null;
  retainedCommandDisposer = null;
  startupWriteRejected = false;
  retainedFormulaProviderDisposer = null;
  retainedFormulaResultStore = null;
  const initial = createEmptySheetDocumentState(2, 2);
  initial.sheetData.addItem(0, 0, { type: 'string', value: 'before' });
  const editor = createHeadlessEditor({ sheetState: initial, plugins: [RetainedSheetStatePlugin] });
  const events: string[] = [];
  const disposeEvents = editor.commands.subscribe((event) => events.push(event.id));
  try {
    expect(retainedDataState).not.toBeNull();
    expect(startupWriteRejected).toBe(true);
    const state = retainedDataState!;
    expect(() => state.sheetData.addItem(0, 0, { type: 'string', value: 'changed' })).toThrow();
    expect(() => { state.sheetData = new SheetMatrix(); }).toThrow();
    expect(() => { state.sheetData.getItem(0, 0)!.value = 'changed'; }).toThrow();
    expect(() => {
      (state.sheetData as unknown as { getItem: () => { value: string } }).getItem = () => ({ value: 'forged' });
    }).toThrow();
    expect(() => retainedDataPlugin!.setState({ sheetData: new SheetMatrix() })).toThrow();
    expect(() => {
      retainedDataPlugin!.getState = () => ({ sheetData: new SheetMatrix() });
    }).toThrow();
    expect(() => {
      retainedDataPlugin!.pluginKey = new PluginKey('forged-plugin');
    }).toThrow();
    expect(() => { (retainedDataPlugin!.key as { key: string }).key = 'forged-key'; }).toThrow();
    expect(() => { retainedDataPlugin!.interestedIn = ['*']; }).toThrow();
    expect(() => { retainedDataPlugin!.interestedIn.push('*'); }).toThrow();
    expect(() => { (retainedDataPlugin!.transactionOT as { ownerId: string }).ownerId = 'forged'; }).toThrow();
    expect(() => {
      (retainedDataPlugin!.transactionOT.definition as { id: string }).id = 'forged';
    }).toThrow();
    expect(() => {
      (retainedDataPlugin as unknown as { transactionOT: unknown }).transactionOT = undefined;
    }).toThrow();
    expect(() => {
      (retainedDataPlugin!.documentState.codec as { key: string }).key = 'forged';
    }).toThrow();
    expect(() => retainedSelectionPlugin!.setState(retainedSelectionPlugin!.getState())).toThrow();
    expect(() => { retainedSelectionPlugin!.getState()[1].getPoint(0)[0] = 9; }).toThrow();
    expect(() => { retainedSelectionPlugin!.getState()[1].update([[9, 9], [9, 9]]); }).toThrow();
    expect(() => retainedDataEngine!.replaceDataType(SheetDataPlugin.pluginKey, { sheetData: new SheetMatrix() })).toThrow();
    expect(() => retainedDataEngine!.registerDataType(SheetDataPlugin.pluginKey, { sheetData: new SheetMatrix() })).toThrow();
    expect(() => retainedInteractionStore!.apply({ type: 'sheet.selection.select' })).toThrow();
    expect(() => retainedPluginManager!.unregisterPlugin(SheetDataPlugin.pluginKey)).toThrow();
    expect(() => retainedPluginManager!.clearPlugins()).toThrow();
    expect((retainedPluginManager as unknown as { plugins?: Map<string, unknown> }).plugins).toBeUndefined();
    expect(() => retainedSessionRegistry!.loadSnapshot({})).toThrow();
    expect(() => retainedSessionRegistry!.restorePhase('beforeInitialize')).toThrow();
    expect(() => retainedSessionRegistry!.clear()).toThrow();
    expect(() => retainedCommands!.register(defineSheetCommand<void>('test.lateCommand'), () =>
      new LocalActionCommand('test.lateCommand', () => void 0))).toThrow('editor.commands.run');
    expect(() => retainedCommandDisposer!()).toThrow('editor.commands.run');
    expect(() => retainedCommands!.destroy()).toThrow('editor.commands.run');
    expect(() => { (retainedCommands as unknown as { executionDepth: number }).executionDepth = 1; }).toThrow();
    (retainedCore as unknown as { commandBoundaryCheck: () => boolean }).commandBoundaryCheck = () => true;
    expect(retainedCommands!.isExecuting()).toBe(false);
    expect(() => retainedCore!.executePipeline(new Pipeline('bypass').addLocalAction('change', () => void 0))).toThrow();
    const scroll = retainedCore!.renderEngine.scrollManager;
    expect(() => scroll.scrollTo(10, 10)).toThrow('editor.commands.run');
    expect(() => scroll.resize(10, 10)).toThrow('editor.commands.run');
    expect(() => scroll.setContentBoundary(10, 10)).toThrow('editor.commands.run');
    expect(() => scroll.setInputUpdateExecutor(() => void 0)).toThrow();
    expect(() => scroll.setScrollToExecutor(() => void 0)).toThrow();
    expect(() => { scroll.getState().x = 10; }).toThrow();
    expect(() => { (scroll as unknown as { state: object }).state = { x: 10 }; }).toThrow();
    expect(retainedPluginManager!.getPluginState(SheetDataPlugin.pluginKey)).toBe(retainedDataState);
    expect(() => { (retainedInteractionStore!.getState() as { selectionRevision: number }).selectionRevision = 8; }).toThrow();
    (retainedInteractionStore as unknown as { state: object }).state = { selectionRevision: 8 };
    expect(retainedInteractionStore!.getState().selectionRevision).toBe(0);
    expect(editor.queries.run(ReadSheetCellDataQuery, undefined).getItem(0, 0)?.value).toBe('before');
    expect(events).toEqual([]);
    editor.commands.run(RegisterRuntimeCommand, undefined);
    expect(editor.commands.has(RuntimeCommand)).toBe(true);
    editor.commands.run(ResizeSheetViewportCommand, { width: 120, height: 90 });
    expect(scroll.getShape()).toEqual([120, 90]);
    scroll.requestScrollTo(10, 10);
    expect(scroll.getState()).toMatchObject({ x: 10, y: 10 });
    expect(events).toContain(ResizeSheetViewportCommand.id);
    expect(events).toContain(ScrollViewportToCommand.id);
    const formula = editor.services.require(SheetRuntimeCapability.Formula);
    expect(formula.results.getFormulaResult(100, 100)).toBe('probe');
    expect(() => formula.results.register({ provider: { getFormulaResult: () => 1 } })).toThrow('editor.commands.run');
    expect(() => formula.sources.register({ provider: { getFormulaSource: () => 'direct' } })).toThrow('editor.commands.run');
    expect(() => formula.richResults.register({ provider: { getFormulaRichResult: () => undefined } })).toThrow('editor.commands.run');
    retainedFormulaProviderDisposer!();
    expect(formula.results.getFormulaResult(100, 100)).toBeUndefined();
    expect(events).toContain(UnregisterFormulaProviderCommand.id);
    const config = editor.services.require(SheetRuntimeCapability.Config);
    expect(() => config.updateDefaultConfigOverrides({ sheetOffsetX: 88 })).toThrow('editor.commands.run');
    const selectionConfig = config.getPluginConfig<{ defaultBorderColor: string }>(retainedSelectionPlugin!.key);
    expect(selectionConfig).toBeDefined();
    expect(() => { selectionConfig!.defaultBorderColor = 'changed'; }).toThrow();
    editor.commands.run(UpdateSheetDefaultConfigCommand, { sheetOffsetX: 88 });
    expect(config.getDefaultConfig().sheetOffsetX).toBe(88);
    expect(editor.services.get(SheetRuntimeCapability.Lifecycle)).toBeUndefined();
    expect(editor.services.get(SheetRuntimeCapability.Interaction)).toBeUndefined();
    expect(() => editor.commands.run(DirectStateWriteCommand, undefined)).toThrow();
    expect(() => editor.commands.run(DirectRegistryWriteCommand, undefined)).toThrow();
    expect(retainedPluginManager!.getPluginState(SheetDataPlugin.pluginKey)).toBe(retainedDataState);
    expect(editor.queries.run(ReadSheetCellDataQuery, undefined).getItem(0, 0)?.value).toBe('before');
  } finally {
    disposeEvents();
    editor.destroy();
    retainedDataState = null;
    retainedDataPlugin = null;
    retainedInteractionStore = null;
    retainedDataEngine = null;
    retainedPluginManager = null;
    retainedSelectionPlugin = null;
    retainedSessionRegistry = null;
    retainedCore = null;
    retainedCommands = null;
  }
});

it('runs asynchronous formula result writes inside a batch command', async () => {
  retainedFormulaResultStore = null;
  const state = createEmptySheetDocumentState(2, 2);
  state.sheetData.addItem(0, 0, { type: CellType.Formula, formula: '=1+2' });
  const editor = createHeadlessEditor({ sheetState: state, plugins: [RetainedSheetStatePlugin] });
  const events: string[] = [];
  const unsubscribe = editor.commands.subscribe((event) => events.push(event.id));
  try {
    expect(() => retainedFormulaResultStore!.set(cellKey(0, 0), 99)).toThrow('editor.commands.run');
    await waitForFormulaIdle(editor.commands);
    expect(retainedFormulaResultStore!.get(cellKey(0, 0))).toBe(3);
    expect(events).toContain(RunFormulaBatchCommand.id);
    editor.commands.run(SetProbeFormulaResultCommand, void 0);
    const retained = retainedFormulaResultStore!.get(cellKey(0, 0)) as number[][];
    expect(() => { retained[0]![0] = 99; }).toThrow();
    expect(retainedFormulaResultStore!.get(cellKey(0, 0))).toEqual([[1, 2]]);
  } finally {
    unsubscribe();
    editor.destroy();
    retainedFormulaResultStore = null;
  }
});

it('keeps large formula spills in a bounded number of batch commands', async () => {
  const state = createEmptySheetDocumentState(101, 101);
  state.sheetData.addItem(0, 0, { type: CellType.Formula, formula: '=SEQUENCE(100,100)' });
  const editor = createHeadlessEditor({ sheetState: state });
  const events: string[] = [];
  const unsubscribe = editor.commands.subscribe((event) => {
    if (event.id === RunFormulaBatchCommand.id && event.phase === 'completed') events.push(event.id);
  });
  try {
    await waitForFormulaIdle(editor.commands);
    const result = editor.services.require(SheetRuntimeCapability.Formula).results.getFormulaResult(0, 0) as number[][];
    expect(result).toHaveLength(100);
    expect(result[99]).toHaveLength(100);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result[0])).toBe(true);
    expect(events.length).toBeGreaterThan(0);
    expect(events.length).toBeLessThan(5);
  } finally {
    unsubscribe();
    editor.destroy();
  }
});

it('locks private plugin state even without a document-state contribution', () => {
  retainedPrivateState = null;
  retainedPrivatePlugin = null;
  retainedRegisteredState = null;
  const editor = createHeadlessEditor({
    sheetState: createEmptySheetDocumentState(2, 2),
    plugins: [PrivateStatePlugin],
  });
  try {
    const oldState = retainedPrivateState!;
    expect(() => { oldState.nested.value = 99; }).toThrow();
    expect(() => { retainedRegisteredState!.nested.value = 99; }).toThrow();
    expect(() => retainedPrivatePlugin!.setState({ nested: { value: 99 } })).toThrow();
    expect(() => editor.commands.run(DirectPrivateStateWriteCommand, undefined)).toThrow();
    editor.commands.run(CommitPrivateStateCommand, undefined);
    expect(() => { oldState.nested.value = 99; }).toThrow();
    expect(oldState.nested.value).toBe(1);
    expect(retainedPrivatePlugin!.getState().nested.value).toBe(2);
    expect(() => { retainedPrivatePlugin!.getState().nested.value = 99; }).toThrow();
  } finally {
    editor.destroy();
    retainedPrivateState = null;
    retainedPrivatePlugin = null;
    retainedRegisteredState = null;
  }
});

it('keeps retained extension matrix handles separate from committed editor state', () => {
  retainedInitialMatrix = null;
  retainedStagedMatrix = null;
  const editor = createHeadlessEditor({
    sheetState: createEmptySheetDocumentState(2, 2),
    plugins: [RetainedMatrixPlugin],
  });
  try {
    expect(editor.queries.run(ReadRetainedMatrixQuery, undefined)).toBe('initial');
    retainedInitialMatrix!.setPrivateValue('changed');
    expect(() => retainedInitialMatrix!.addItem(0, 0, { type: 'string', value: 'changed' })).toThrow();
    expect(editor.queries.run(ReadRetainedMatrixQuery, undefined)).toBe('initial');

    editor.commands.run(CommitRetainedMatrixCommand, undefined);
    expect(editor.queries.run(ReadRetainedMatrixQuery, undefined)).toBe('committed');
    expect(() => retainedStagedMatrix!.setPrivateValue('changed')).toThrow();
    expect(() => retainedStagedMatrix!.addItem(0, 0, { type: 'string', value: 'changed' })).toThrow();
    expect(editor.queries.run(ReadRetainedMatrixQuery, undefined)).toBe('committed');
  } finally {
    editor.destroy();
    retainedInitialMatrix = null;
    retainedStagedMatrix = null;
  }
});

it('does not expose live Sheet cells through the public query', () => {
  const state = createEmptySheetDocumentState(2, 2);
  state.sheetData.addItem(0, 0, { type: 'string', value: 'before' });
  const editor = createHeadlessEditor({ sheetState: state });
  const commandEvents: string[] = [];
  const dispose = editor.commands.subscribe((event) => commandEvents.push(event.id));
  try {
    const reader = editor.queries.run(ReadSheetCellDataQuery, undefined);
    const cell = reader.getItem(0, 0);
    expect(cell).not.toBeNull();
    if (cell) cell.value = 'outside command';
    expect(reader.getItem(0, 0)?.value).toBe('before');
    const exported = editor.commands.run(ExportSheetStateCommand, undefined).sheetState;
    exported.sheetData.getItem(0, 0)!.value = 'changed export';
    expect(reader.getItem(0, 0)?.value).toBe('before');
    state.sheetData.getItem(0, 0)!.value = 'changed input';
    expect(reader.getItem(0, 0)?.value).toBe('before');
    expect(editor.services.get(SheetRuntimeCapability.Plugins)).toBeUndefined();
    expect(editor.services.get(SheetRuntimeCapability.Data)).toBeUndefined();
    expect(commandEvents).toEqual([ExportSheetStateCommand.id, ExportSheetStateCommand.id]);
  } finally {
    dispose();
    editor.destroy();
  }
});

it('does not expose stored cell format objects through the public query', () => {
  const state = createEmptySheetDocumentState(2, 2);
  state.cellFormats.setItem(0, 0, { kind: 'number', minimumFractionDigits: 2 });
  const editor = createHeadlessEditor({ sheetState: state });
  try {
    const reader = editor.queries.run(ReadSheetCellFormatQuery, undefined);
    const format = reader.getItem(0, 0);
    expect(format?.kind).toBe('number');
    (format as unknown as { minimumFractionDigits: number }).minimumFractionDigits = 9;
    expect(reader.getItem(0, 0)).toEqual({ kind: 'number', minimumFractionDigits: 2 });
  } finally {
    editor.destroy();
  }
});

it('keeps formula-authoring observations detached from their runtime state', () => {
  const editor = createHeadlessEditor({ sheetState: createEmptySheetDocumentState(2, 2) });
  try {
    const snapshot = editor.observations.getSnapshot(FormulaInputAssistObservation);
    (snapshot as { selectedIndex: number }).selectedIndex = 9;
    expect(editor.observations.getSnapshot(FormulaInputAssistObservation).selectedIndex).toBe(0);
  } finally {
    editor.destroy();
  }
});

it('keeps selection coordinates detached from the public query result', () => {
  const editor = createHeadlessEditor({ sheetState: createEmptySheetDocumentState(2, 2) });
  try {
    editor.commands.run(SelectRangeCommand, { anchor: [0, 0], focus: [1, 1] });
    const selection = editor.queries.run(GetSelection, undefined);
    expect(selection).not.toBeNull();
    (selection!.start as unknown as number[])[0] = 999;
    expect(editor.queries.run(GetSelection, undefined)?.start).toEqual([0, 0]);
  } finally {
    editor.destroy();
  }
});

it('keeps Workbook runtime mutations outside the public capability reader', () => {
  const editor = createHeadlessWorkbookEditor({
    documentState: createWorkbookDocumentState({
      id: 'command-boundary',
      sheets: [{ id: 'one', name: 'One' }],
      sheetStates: { one: createEmptySheetDocumentState(2, 2) },
    }),
  });
  try {
    expect(editor.services.get(WorkbookRuntimeCapability.Runtime)).toBeUndefined();
    const snapshot = editor.document.getState();
    snapshot.sheetStates['one']!.sheetData.addItem(0, 0, { type: 'string', value: 'outside command' });
    const observed = editor.observations.getSnapshot(WorkbookDocumentStateObservation);
    observed.sheetStates['one']!.sheetData.addItem(0, 0, { type: 'string', value: 'changed observation' });
    expect(editor.sheets.getActiveEditor().queries.run(ReadSheetCellDataQuery, undefined).getItem(0, 0))
      .toBeNull();
  } finally {
    editor.destroy();
  }
});
