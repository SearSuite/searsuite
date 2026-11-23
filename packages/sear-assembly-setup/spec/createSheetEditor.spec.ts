import { FileDownload, UnavailableFileDownload } from '@searsuite/sear-foundation-platform';
import 'reflect-metadata';
import { UserInteractionService } from '@searsuite/sear-foundation-user-interaction';
import { PipelineStepKind, runInsideCommandExecution, SearCoreSheet, SheetInteractionStore, SheetLifecycleCoordinator, SheetMatrix } from '@searsuite/sear-assembly-core';
import { AlignmentMatrix, SheetHorizontalAlignment, VerticalAlignmentMatrix } from '@searsuite/sear-plugin-alignment';
import { CellFillMatrix } from '@searsuite/sear-plugin-cell-fill';
import {
  AddCellHighlightRuleCommand, CellHighlightKind, CellHighlightMatrix, CellHighlightStyle,
  CellHighlightValueOperator, ClearCellHighlightRulesCommand, ReadCellHighlightRulesQuery,
  UpdateCellHighlightRuleCommand,
} from '@searsuite/sear-plugin-cell-highlight';
import {
  DataValidationEvaluatorRegistry, DataValidationEvaluatorRegistryCapability, DataValidationInputPolicy, DataValidationKind,
  DataValidationWarningObservation, ReadDataValidationIssueQuery, ReadDataValidationRulesQuery, SetDataValidationRuleCommand,
  SheetDataValidationPlugin,
} from '@searsuite/sear-plugin-data-validation';
import { PickDropdownOptionCommand, ReadDropdownCellQuery } from '@searsuite/sear-plugin-dropdown';
import {
  CellBorderMatrix,
  SetRangeCellBorderCommand,
  ReadSheetCellBorderQuery,
  SheetBorderPreset,
  SheetBorderLineStyle,
} from '@searsuite/sear-plugin-cell-border';
import { SheetHeaderHighlightPlugin } from '@searsuite/sear-plugin-header-highlight';
import { DuplicateMatrix } from '@searsuite/sear-plugin-duplicate';
import { CellFormatMatrix } from '@searsuite/sear-plugin-cell-format';
import { CellMergeMatrix, ToggleMergeCellsCommand } from '@searsuite/sear-plugin-cell-merge';
import { CheckboxCellType, InsertCheckboxesCommand, ReadCheckboxRangeQuery } from '@searsuite/sear-plugin-checkbox';
import { FixedRowMatrix, SetSheetRowsFixedCommand } from '@searsuite/sear-plugin-fixed-row';
import { SheetSortDirection, SortSheetRangeCommand } from '@searsuite/sear-plugin-sort';
import {
  PluginKey,
  PluginManager,
  SessionStateRegistry,
  SessionStateRestorePhase,
  defineSessionState,
  readSessionState,
  SheetRangeMoveStatus,
  SheetFormatTransferRegistry,
  SheetRangeMoveRegistry,
  SheetRangeReorderRegistry,
  SheetStructureMoveRegistry,
} from '@searsuite/sear-assembly-plugin';
import {
  ClearRangeContentsCommand,
  DeleteRowCommand,
  defineSheetCommand,
  defineSheetQuery,
  LocalActionCommand,
  MoveRowsCommand,
  MoveColumnsCommand,
  type SheetCommandBus,
} from '@searsuite/sear-assembly-commands';
import { CellType, SheetCellInputValidationRegistry, SheetDisplayedValueChanges } from '@searsuite/sear-domain-cell-types';
import { CellCommitStrategyRegistry } from '@searsuite/sear-domain-cell-types';
import { CellDisplayTextRegistry, CellTypeCatalog, type CellRenderDefinition } from '@searsuite/sear-domain-cell';
import { SheetCellVisualReaderRegistry, SheetRenderCoordinatorManager } from '@searsuite/sear-render-registry';
import {
  FindSheetMatchesQuery, FindSheetMatchPageQuery, ReadSheetFindRevisionQuery,
  ReplaceAllSheetMatchesCommand, SheetFindReplacePlugin,
} from '@searsuite/sear-plugin-find-replace';
import { SheetFilterPlugin } from '@searsuite/sear-plugin-filter';
import { DataEngine } from '@searsuite/sear-render-engine';
import { ReadSheetCellDataQuery } from '@searsuite/sear-render-engine';
import { SheetClipboard, type SheetClipboardPayload } from '@searsuite/sear-plugin-clipboard';
import {
  FormatPainterMode, FormatPainterObservation, SheetFormatPainterPlugin, StartFormatPainterCommand,
} from '@searsuite/sear-plugin-format-painter';
import { cellKey } from '@searsuite/sear-domain-formula-engine-ts';
import {
  FormulaAddInServiceDefinition, FormulaCalculationTraceEventType, IAggregationCache,
  IDependencyGraph, IFormulaExternalServiceProvider, IFormulaTextServiceProvider, IFunctionRegistry,
} from '@searsuite/sear-domain-formula-engine';
import { SetRangeAlignmentCommand } from '@searsuite/sear-plugin-alignment';
import { Injectable, Inject, Container } from '@searsuite/sear-foundation-di';
import { DataStorage } from '@searsuite/sear-foundation-storage';
import { Platform, type PlatformFrameRequestCallback } from '@searsuite/sear-foundation-platform';
import { NodePlatform as HeadlessPlatform } from '@searsuite/sear-node-adapters';
import { ColumnShapeDimensionsCSRMatrix, CSRMatrix, RowShapeDimensionsCSRMatrix } from '@searsuite/sear-domain-matrix';
import { Rect } from '@searsuite/sear-foundation-rect';
import { defineStateObservation, type ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import {
  ApplyRemoteOperationsCommand, CollaborationChannel, CollaborationChannelBinding, CollaborationConnectionState,
  ConnectSheetCollaborationCommand, DisconnectSheetCollaborationCommand, HeadlessCollabTransport,
} from '@searsuite/sear-plugin-collab';
import { CursorEngine, CursorRegistry, CursorRuleKind, CursorToken, HeadlessCursorEngine } from '@searsuite/sear-render-cursor';
import { EventEngine, HeadlessEventRegistrar } from '@searsuite/sear-render-event-engine';
import { HeadlessKeyboardRouter, HeadlessPointerCapture, PointerCapture, type PointerCaptureHandlers, type KeyboardRouterHandlers, KeyboardRouter, HeadlessTextInput } from '@searsuite/sear-render-input';
import { WebTextInput, WebKeyboardRouter } from '@searsuite/sear-browser-adapters';
import { CellRegion, type CellProperties } from '@searsuite/sear-render-registry';
import {
  HeadlessHitRenderContext,
  HeadlessOffScreenRenderContext,
  HeadlessRenderContext,
} from '@searsuite/sear-render-context';
import { HeadlessScroller } from '@searsuite/sear-render-scroll';
import { OverlayRenderStrategy, RenderStrategyManager, type RenderStrategy } from '@searsuite/sear-render-strategy';
import { HeadlessToolbar, SearToolbar } from '@searsuite/sear-assembly-plugin';
import {
  CellFormulaValueConverterRegistry, FormulaCalculationTraceBus, FormulaRenderInvalidator,
  FormulaResultProviderRegistry, FormulaResultStore, FormulaRichResultProviderRegistry,
  FormulaSourceProviderRegistry, RecalcScheduler, SheetFormulaPlugin,
} from '@searsuite/sear-plugin-formula';
import { RedoSheetCommand, SheetHistoryStatusObservation, UndoSheetCommand } from '@searsuite/sear-plugin-history';
import { SetSheetZoomCommand, SheetZoomPlugin, SheetZoomSessionStateDefinition } from '@searsuite/sear-plugin-zoom';
import {
  EnsureSelectionVisibleCommand,
  GetActiveCell,
  HandleSheetRangeDragCommand,
  MoveSheetRangeCommand,
  GetSheetRangeMoveConflict,
  AnalyzeSheetRangeMove,
  SelectRangeCommand,
  SheetSelectionPlugin,
  SheetRangeDrag,
  SheetRangeDragAction,
  SheetHighlightRegistry,
  SheetSelectionSessionStateDefinition,
} from '@searsuite/sear-plugin-selection';
import {
  BeginCellEditCommand,
  CancelCellEditCommand,
  CommitCellEditCommand,
  HandleDocumentInputCommand,
  AcceptFormulaSuggestionCommand,
  FormulaInputAssistObservation,
  SheetFormulaBarObservation,
  StartFormulaBarEditCommand,
  SetFormulaBarDraftCommand,
  RequestCellEditorRenderCommand,
  SheetCellEditorPlugin,
  UpdateCellEditorDocumentSelectionCommand,
} from '@searsuite/sear-plugin-cell-editor';
import { BeginSheetResizeDragCommand, ResizeSheetRowsCommand } from '@searsuite/sear-plugin-resize';
import { SheetPlugin, SheetRuntimeCapability, type SheetPluginRuntimeContext, type SheetPluginSetupContext } from '../src/sheet/SheetPluginContracts';
import { defineSheetRuntimeCapability } from '../src/sheet/SheetRuntimeExtensionRegistry';
import { createSheetEditor, type SheetDocumentState } from '../src/sheet/createSheetEditor';
import {
  ApplyViewportScrollCommand,
  ScrollViewportToCommand,
  SheetViewportSessionStateDefinition,
} from '../src/sheet/SheetViewportCommands';
import { ExportSheetStateCommand } from '../src/sheet/SheetStateSnapshotCommands';
import { UpdateSheetDefaultConfigCommand } from '../src/sheet/SheetConfigCommands';
import { UnregisterSheetInputValidatorCommand } from '../src/sheet/SheetInputValidationCommands';
import { CaptureSheetSessionStateCommand } from '../src/sheet/SheetSessionStateCommands';
import { FakeSheetEmbeddedEditor, SheetEmbeddedEditor } from '@searsuite/sear-sheet-editor-contract';
import { RenderContextTextShaper, TextShaper } from '@searsuite/sear-render-metrics';

const strategyPluginKey = new PluginKey('StrategyPlugin');
const testStrategyToken = Symbol('TestStrategy');
const testStrategyTokenAfter = Symbol('TestStrategyAfter');
const thirdPartyStatusObservation = defineStateObservation<number>('third-party.status');
const thirdPartySessionState = defineSessionState<{ open: boolean; selectedId: string | null }>('third-party.panel');
const testStrategy = {
  getViewScaleContexts: () => [],
  getContext: () => new HeadlessRenderContext(),
  render: () => {},
} as unknown as RenderStrategy<CellProperties>;

@Injectable()
class StrategyPlugin extends SheetPlugin<null> {
  public static readonly symbol = Symbol.for('StrategyPlugin');

  public constructor() {
    super({ key: strategyPluginKey, state: null });
  }

  public registerState() {
    return { key: this.key, state: null };
  }

  public getPluginConfig(): null {
    return null;
  }

  public apply(): null {
    return null;
  }

  public render(): null {
    return null;
  }

  public configure(context: SheetPluginSetupContext): void {
    context.addStrategy(testStrategyToken, testStrategy, { before: OverlayRenderStrategy.symbol });
  }
}

@Injectable()
class StrategyPluginAfter extends SheetPlugin<null> {
  public static readonly symbol = Symbol.for('StrategyPluginAfter');
  public constructor() {
    super({ key: new PluginKey('StrategyPluginAfter'), state: null });
  }
  public registerState() {
    return { key: this.key, state: null };
  }
  public getPluginConfig(): null {
    return null;
  }
  public apply(): null {
    return null;
  }
  public render(): null {
    return null;
  }

  public configure(context: SheetPluginSetupContext): void {
    context.addStrategy(testStrategyTokenAfter, testStrategy, { after: OverlayRenderStrategy.symbol });
  }
}

@Injectable()
class ThirdPartyObservationPlugin extends SheetPlugin<null> {
  public static readonly symbol = Symbol.for('ThirdPartyObservationPlugin');

  private readonly listeners = new Set<(value: number) => void>();
  private value = 1;

  public constructor() {
    super({ key: new PluginKey('ThirdPartyObservationPlugin'), state: null });
  }

  public registerObservations(observations: ObservationRegistry): void {
    observations.register(thirdPartyStatusObservation, {
      getSnapshot: () => this.value,
      subscribe: (listener) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
      },
    });
  }

  public publish(value: number): void {
    this.value = value;
    this.listeners.forEach((listener) => listener(value));
  }

  public get listenerCount(): number {
    return this.listeners.size;
  }

  public registerState() {
    return { key: this.key, state: null };
  }

  public getPluginConfig(): null {
    return null;
  }

  public apply(): null {
    return null;
  }

  public render(): null {
    return null;
  }
}

@Injectable()
class ThirdPartySessionPlugin extends SheetPlugin<null> {
  public static readonly symbol = Symbol.for('ThirdPartySessionPlugin');

  private session = { open: false, selectedId: null as string | null };

  public constructor() {
    super({ key: new PluginKey('ThirdPartySessionPlugin'), state: null });
  }

  public registerSessionState(registry: SessionStateRegistry): void {
    registry.register(thirdPartySessionState, {
      restorePhase: SessionStateRestorePhase.BeforeInitialize,
      capture: () => ({ ...this.session }),
      restore: (state) => {
        this.session = { ...state };
      },
    });
  }

  public setSession(open: boolean, selectedId: string | null): void {
    this.session = { open, selectedId };
  }

  public getSession(): { open: boolean; selectedId: string | null } {
    return { ...this.session };
  }

  public registerState() {
    return { key: this.key, state: null };
  }

  public getPluginConfig(): null {
    return null;
  }

  public apply(): null {
    return null;
  }

  public render(): null {
    return null;
  }
}

function createSheetState(
  options: { includeHiddenOriginalSizes?: boolean; includeDimensionDefaults?: boolean; size?: number } = {},
): SheetDocumentState {
  const size = options.size ?? 2;
  const rowSizes = new RowShapeDimensionsCSRMatrix(void 0, [1, size]);
  const columnSizes = new ColumnShapeDimensionsCSRMatrix(void 0, [1, size]);
  if (options.includeDimensionDefaults !== false) {
    rowSizes.setDefaultValue(24);
    columnSizes.setDefaultValue(100);
  }
  const state = {
    sheetData: new SheetMatrix(void 0, [size, size]),
    rowSizes,
    columnSizes,
    cellAlignments: new AlignmentMatrix(void 0, [size, size]),
    cellVerticalAlignments: new VerticalAlignmentMatrix(void 0, [size, size]),
    cellFills: new CellFillMatrix(void 0, [size, size]),
    cellHighlights: new CellHighlightMatrix(void 0, [size, size]),
    duplicates: new DuplicateMatrix(void 0, [size, size]),
    cellFormats: new CellFormatMatrix(void 0, [size, size]),
    fixedRows: new FixedRowMatrix(void 0, [1, size]),
    cellMerges: new CellMergeMatrix(void 0, [size, size]),
  };
  if (!options.includeHiddenOriginalSizes) return state;
  return {
    ...state,
    rowHiddenOriginalSizes: new CSRMatrix<number>(void 0, [1, 2]),
    columnHiddenOriginalSizes: new CSRMatrix<number>(void 0, [1, 2]),
  };
}

function createHeadlessAdapters() {
  return {
    platform: HeadlessPlatform,
    createRenderContexts: () => ({
      renderContext: new HeadlessRenderContext(),
      offScreenRenderContext: new HeadlessOffScreenRenderContext(),
      hitRenderContext: new HeadlessHitRenderContext(),
    }),
    scroller: HeadlessScroller,
    eventRegistrar: HeadlessEventRegistrar,
    textInput: HeadlessTextInput,
    keyboardRouter: HeadlessKeyboardRouter,
    pointerCapture: HeadlessPointerCapture,
    cursorEngine: HeadlessCursorEngine,
    collabTransport: HeadlessCollabTransport,
    toolbar: HeadlessToolbar,
  };
}

@Injectable()
class RangeMovePointer extends HeadlessPointerCapture {
  public handlers: PointerCaptureHandlers | null = null;
  public override start(handlers: PointerCaptureHandlers): () => void {
    this.handlers = handlers;
    return () => {
      this.handlers = null;
    };
  }
}

@Injectable()
class RangeMoveKeyboard extends HeadlessKeyboardRouter {
  public handlers: KeyboardRouterHandlers = {};
  public override subscribe(handlers: KeyboardRouterHandlers): void {
    Object.assign(this.handlers, handlers);
  }
}

@Injectable()
class RangeMoveConfirmation extends UserInteractionService {
  public confirm = jest.fn(async () => true);
  public destroy(): void {}
}

@Injectable()
class RangeMovePlatform extends HeadlessPlatform {
  public frame: PlatformFrameRequestCallback | null = null;
  public override requestAnimationFrame(callback: PlatformFrameRequestCallback): number {
    this.frame = callback;
    return 1;
  }
  public override cancelAnimationFrame(): void {
    this.frame = null;
  }
}

describe('createSheetEditor', () => {
  it('BUG-014/015 routes clipboard shortcuts after editing and spreads external TSV over cells', async () => {
    @Injectable()
    class TestClipboard extends SheetClipboard {
      public payload: SheetClipboardPayload | null = null;
      public async read(): Promise<SheetClipboardPayload | null> { return this.payload; }
      public async write(payload: SheetClipboardPayload): Promise<void> { this.payload = payload; }
    }

    const state = createSheetState({ size: 6 });
    state.sheetData.addItem(0, 0, { type: CellType.String, value: 'left' });
    const keyboardEvents = new EventTarget();
    let container: Container | null = null;
    const editor = createSheetEditor({
      sheetState: state,
      adapters: {
        ...createHeadlessAdapters(),
        keyboardRouter: WebKeyboardRouter,
        clipboard: TestClipboard,
        registerEnvironment: (value) => {
          container = value;
          value.registerInstance(WebKeyboardRouter.eventTargetSymbol, keyboardEvents);
        },
      },
    });
    try {
      const clipboard = container!.resolve<TestClipboard>(SheetClipboard.symbol);
      editor.commands.run(SelectRangeCommand, { anchor: [0, 0], focus: [0, 0] });
      editor.commands.run(StartFormulaBarEditCommand, void 0);
      editor.commands.run(CancelCellEditCommand, void 0);

      keyboardEvents.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', metaKey: true, cancelable: true }));
      expect((await clipboard.read())?.plainText).toBe('left');

      keyboardEvents.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', metaKey: true, cancelable: true }));
      expect((await clipboard.read())?.plainText).toBe('left');
      expect(editor.queries.run(ReadSheetCellDataQuery, void 0).getItem(0, 0)?.value).toBe('left');

      await clipboard.write({ plainText: 'A\tB\nC\tD' });
      editor.commands.run(SelectRangeCommand, { anchor: [1, 1], focus: [1, 1] });
      keyboardEvents.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', metaKey: true, cancelable: true }));
      await Promise.resolve();
      const cells = editor.queries.run(ReadSheetCellDataQuery, void 0);
      expect(cells.getItem(1, 1)?.value).toBe('A');
      expect(cells.getItem(1, 2)?.value).toBe('B');
      expect(cells.getItem(2, 1)?.value).toBe('C');
      expect(cells.getItem(2, 2)?.value).toBe('D');
    } finally {
      editor.destroy();
    }
  });

  it('BUG-869 keeps the anchor checkbox visible when its merge is removed', () => {
    const state = createSheetState({ size: 6 });
    state.cellMerges.setItem(3, 1, { endRow: 4, endColumn: 3 });
    let container: Container | null = null;
    const editor = createSheetEditor({
      sheetState: state,
      adapters: {
        ...createHeadlessAdapters(),
        registerEnvironment: (value) => {
          container = value;
        },
      },
    });
    const range = { anchor: [3, 1] as const, focus: [4, 3] as const };
    editor.commands.run(InsertCheckboxesCommand, range);
    expect(editor.queries.run(ReadCheckboxRangeQuery, range).count).toBe(1);
    const nodes = container!.resolve<DataStorage<string, unknown>>(DataStorage.symbol);
    expect(nodes.get('checkbox:merged:3:1')).toBeDefined();

    editor.commands.run(ToggleMergeCellsCommand, range);
    expect(editor.queries.run(ReadCheckboxRangeQuery, range).count).toBe(1);
    expect(nodes.get('checkbox:merged:3:1')).toBeUndefined();
    expect(nodes.get('checkbox:grid:3:1')).toBeDefined();
    editor.destroy();
  });

  it('installs formula boundaries despite forged methods on retained services', () => {
    let container: Container | null = null;
    @Injectable()
    class ForgedFormulaBoundaryPlugin extends SheetPlugin<null> {
      public static readonly symbol = Symbol.for('ForgedFormulaBoundaryPlugin');
      public constructor() { super({ key: new PluginKey('ForgedFormulaBoundaryPlugin'), state: null }); }
      public configure(context: SheetPluginSetupContext): void {
        for (const token of [
          IDependencyGraph.symbol, IAggregationCache.symbol, FormulaResultStore.symbol,
          FormulaCalculationTraceBus.symbol, IFunctionRegistry.symbol,
          IFormulaExternalServiceProvider.symbol, IFormulaTextServiceProvider.symbol,
          FormulaResultProviderRegistry.symbol, FormulaRichResultProviderRegistry.symbol,
          FormulaSourceProviderRegistry.symbol,
        ]) {
          Object.assign(context.container.resolve<object>(token), { enforceCommandBoundary: () => void 0 });
        }
      }
      public registerState() { return { key: this.key, state: null }; }
      public getPluginConfig(): null { return null; }
      public apply(): null { return null; }
      public render(): null { return null; }
    }
    const editor = createSheetEditor({
      sheetState: createSheetState(),
      adapters: {
        ...createHeadlessAdapters(),
        registerEnvironment: (value) => { container = value; },
      },
      plugins: [ForgedFormulaBoundaryPlugin],
    });
    try {
      const services = container!;
      const formula = services.resolve<SheetFormulaPlugin>(SheetFormulaPlugin.symbol);
      expect(() => { (formula as unknown as { graph: unknown }).graph = {}; }).toThrow();
      expect(() => { (formula as unknown as { resultStore: unknown }).resultStore = {}; }).toThrow();
      expect(() => services.resolve<IDependencyGraph>(IDependencyGraph.symbol).updateCell(cellKey(0, 0), []))
        .toThrow('editor.commands.run');
      expect(() => services.resolve<IAggregationCache>(IAggregationCache.symbol).setSum(0, 0, 0, 0, 1))
        .toThrow('editor.commands.run');
      expect(() => services.resolve<FormulaResultStore>(FormulaResultStore.symbol).set(cellKey(0, 0), 1))
        .toThrow('editor.commands.run');
      expect(() => services.resolve<IFunctionRegistry>(IFunctionRegistry.symbol).register({
        name: 'FORGED', evaluate: () => 1,
      })).toThrow('editor.commands.run');
      expect(() => services.resolve<FormulaResultProviderRegistry>(FormulaResultProviderRegistry.symbol).register({
        provider: { getFormulaResult: () => 1 },
      })).toThrow('editor.commands.run');
      expect(() => services.resolve<FormulaRichResultProviderRegistry>(FormulaRichResultProviderRegistry.symbol).register({
        provider: { getFormulaRichResult: () => undefined },
      })).toThrow('editor.commands.run');
      expect(() => services.resolve<FormulaSourceProviderRegistry>(FormulaSourceProviderRegistry.symbol).register({
        provider: { getFormulaSource: () => '=1' },
      })).toThrow('editor.commands.run');
    } finally {
      editor.destroy();
    }
  });

  it('installs command boundaries despite forged setup methods on retained services', () => {
    let runtime: SheetPluginSetupContext['runtime'] | null = null;
    let evaluators: DataValidationEvaluatorRegistry | null = null;
    let dataEngine: DataEngine | null = null;
    let pluginManager: PluginManager<SearCoreSheet, CellProperties> | null = null;
    let channel: CollaborationChannel | null = null;
    let formulaServices: IFormulaExternalServiceProvider | null = null;
    @Injectable()
    class ForgedBoundaryPlugin extends SheetPlugin<null> {
      public static readonly symbol = Symbol.for('ForgedBoundaryPlugin');
      public constructor() { super({ key: new PluginKey('ForgedBoundaryPlugin'), state: null }); }
      public configure(context: SheetPluginSetupContext): void {
        runtime = context.runtime;
        dataEngine = context.container.resolve<DataEngine>(DataEngine.symbol);
        pluginManager = context.container.resolve<PluginManager<SearCoreSheet, CellProperties>>(PluginManager.symbol);
        Object.assign(dataEngine, { enforceWriteBoundary: () => void 0 });
        Object.assign(pluginManager, { enforceWriteBoundary: () => void 0 });
        Object.assign(context.runtime.config, { enforceCommandBoundary: () => void 0 });
        Object.assign(context.runtime.scroll.manager, { enforceCommandBoundary: () => void 0 });
        Object.assign(context.runtime.scroll.manager, { enforceTeardownBoundary: () => void 0 });
        Object.assign(context.runtime.events.engine, { enforceWriteBoundary: () => void 0 });
        Object.assign(context.runtime.events.engine.eventRegistrar, { enforceCommandBoundary: () => void 0 });
        channel = context.container.resolve<CollaborationChannelBinding>(CollaborationChannelBinding.symbol).channel;
        formulaServices = context.container.resolve<IFormulaExternalServiceProvider>(IFormulaExternalServiceProvider.symbol);
        Object.assign(channel, { enforceCommandBoundary: () => void 0 });
        Object.assign(formulaServices, { enforceTeardownBoundary: () => void 0 });
        Object.assign(context.runtime.queries, { enforceWriteBoundary: () => void 0 });
        Object.assign(context.runtime.observations, { enforceWriteBoundary: () => void 0 });
        Object.assign(context.runtime.extensions, { enforceWriteBoundary: () => void 0 });
        Object.assign(context.runtime.render.strategies, { enforceCommandBoundary: () => void 0 });
        Object.assign(context.container.resolve<SheetCellInputValidationRegistry>(SheetCellInputValidationRegistry.symbol),
          { enforceCommandBoundary: () => void 0 });
        const validation = context.container.resolve<SheetDataValidationPlugin>(SheetDataValidationPlugin.symbol);
        evaluators = (validation as unknown as { dependencies: { evaluators: DataValidationEvaluatorRegistry } })
          .dependencies.evaluators;
        Object.assign(validation, { sealRuntimeWrites: () => void 0 });
        Object.assign(evaluators, { enforceCommandBoundary: () => void 0 });
      }
      public registerState() { return { key: this.key, state: null }; }
      public getPluginConfig(): null { return null; }
      public apply(): null { return null; }
      public render(): null { return null; }
    }
    const editor = createSheetEditor({
      sheetState: createSheetState(),
      adapters: createHeadlessAdapters(),
      plugins: [ForgedBoundaryPlugin],
      onCreated: ({ commands }) => {
        Object.assign(commands, { enforceRegistrationBoundary: () => void 0 });
      },
    });
    try {
      const services = runtime!;
      expect(() => services.config.updateDefaultConfigOverrides({ cellPadding: 40 }))
        .toThrow('editor.commands.run');
      expect(() => dataEngine!.replaceDataType(new PluginKey('forged'), {}))
        .toThrow('command transaction');
      expect(() => pluginManager!.unregisterPlugin('missing'))
        .toThrow('owning runtime');
      expect(() => services.scroll.manager.resize(400, 300)).toThrow('editor.commands.run');
      expect(() => services.scroll.manager.destroy()).toThrow('editor owner');
      expect(() => services.events.engine.on('mouseDown', () => void 0)).toThrow('editor.commands.run');
      expect(() => services.events.engine.eventRegistrar.register('forged')).toThrow('editor.commands.run');
      expect(() => channel!.disconnect()).toThrow('editor.commands.run');
      expect(() => formulaServices!.destroy()).toThrow('editor owner');
      expect(() => services.queries.register(defineSheetQuery<void, number>('test.forgedQuery'), () => 1))
        .toThrow('editor.commands.run');
      expect(() => services.observations.register(defineStateObservation<number>('test.forgedObservation'), {
        getSnapshot: () => 1, subscribe: () => () => void 0,
      })).toThrow('editor.commands.run');
      expect(() => services.extensions.register(defineSheetRuntimeCapability<number>('test.forgedCapability'), 1))
        .toThrow('editor.commands.run');
      expect(() => services.render.strategies.addStrategy('forged', {} as never)).toThrow('editor.commands.run');
      expect(() => evaluators!.register(DataValidationKind.Formula, () => true)).toThrow('editor.commands.run');
      expect(() => editor.commands.register(defineSheetCommand<void>('test.forgedRegistration'),
        () => new LocalActionCommand('test.forgedRegistration', () => void 0)))
        .toThrow('editor.commands.run');
    } finally {
      editor.destroy();
    }
  });

  it('keeps retained event handlers and event names under command ownership', () => {
    let container: Container | null = null;
    let unregister: (() => void) | undefined;
    const RegisterEventCommand = defineSheetCommand<void>('test.event.register');
    const UnregisterEventCommand = defineSheetCommand<void>('test.event.unregister');
    const editor = createSheetEditor({
      sheetState: createSheetState(),
      adapters: {
        ...createHeadlessAdapters(),
        registerEnvironment: (value) => { container = value; },
      },
      onCreated: ({ commands }) => {
        commands.register(RegisterEventCommand, () => new LocalActionCommand(RegisterEventCommand.id, () => {
          const events = container!.resolve<EventEngine<CellProperties>>(EventEngine.symbol);
          unregister = events.registerEvent('mouseDown', () => void 0);
        }));
        commands.register(UnregisterEventCommand, () => new LocalActionCommand(UnregisterEventCommand.id, () => {
          unregister?.();
        }));
      },
    });
    try {
      const events = container!.resolve<EventEngine<CellProperties>>(EventEngine.symbol);
      expect((events as unknown as { eventListeners?: unknown }).eventListeners).toBeUndefined();
      expect(() => events.on('mouseDown', () => void 0)).toThrow('editor.commands.run');
      expect(() => events.off()).toThrow('editor.commands.run');
      expect(() => events.destroy()).toThrow('editor owner');
      expect(() => events.eventRegistrar.registeredEvents.push('forged')).toThrow();
      expect(() => events.eventRegistrar.register('forged')).toThrow('editor.commands.run');
      editor.commands.run(RegisterEventCommand, void 0);
      expect(() => unregister!()).toThrow('editor.commands.run');
      editor.commands.run(UnregisterEventCommand, void 0);
    } finally {
      editor.destroy();
    }
  });

  it('keeps a retained formula service registry alive until editor teardown', () => {
    let container: Container | null = null;
    const editor = createSheetEditor({
      sheetState: createSheetState(),
      adapters: {
        ...createHeadlessAdapters(),
        registerEnvironment: (value) => { container = value; },
      },
    });
    const services = container!.resolve<IFormulaExternalServiceProvider>(IFormulaExternalServiceProvider.symbol);
    try {
      expect(services.get(FormulaAddInServiceDefinition)).toBeDefined();
      expect(() => services.destroy()).toThrow('editor owner');
      expect(services.get(FormulaAddInServiceDefinition)).toBeDefined();
    } finally {
      editor.destroy();
    }
  });

  it('rejects forged transaction callbacks on retained Sheet plugins', () => {
    let container: Container | null = null;
    const editor = createSheetEditor({
      sheetState: createSheetState(),
      adapters: {
        ...createHeadlessAdapters(),
        registerEnvironment: (value) => { container = value; },
      },
    });
    try {
      const selection = container!.resolve<SheetSelectionPlugin>(SheetSelectionPlugin.symbol);
      expect(() => { (selection as unknown as { depth: number }).depth = 900; }).toThrow();
      expect(() => { (selection as unknown as { apply: unknown }).apply = () => null; }).toThrow();
      const cellEditor = container!.resolve<SheetCellEditorPlugin>(SheetCellEditorPlugin.symbol);
      const formula = container!.resolve<SheetFormulaPlugin>(SheetFormulaPlugin.symbol);
      const filter = container!.resolve<SheetFilterPlugin>(SheetFilterPlugin.symbol);
      const find = container!.resolve<SheetFindReplacePlugin>(SheetFindReplacePlugin.symbol);
      const transaction = { pluginKey: new PluginKey('SheetDataPlugin'), operations: [] } as never;
      const scheduler = container!.resolve<RecalcScheduler>(RecalcScheduler.symbol);
      const trace = container!.resolve<FormulaCalculationTraceBus>(FormulaCalculationTraceBus.symbol);
      const formulaKeys = [...scheduler.getFormulaKeys()];
      const filterVersion = filter.version;
      const findRevision = editor.queries.run(ReadSheetFindRevisionQuery, undefined);
      const displayedValues = container!.resolve<SheetDisplayedValueChanges>(SheetDisplayedValueChanges.symbol);
      Object.assign(find, { commands: { isExecuting: () => true } });

      for (const callback of [
        () => selection.onTransactionCommitted(transaction),
        () => cellEditor.onTransactionCommitted(transaction),
        () => formula.onTransactionCommitted(transaction),
        () => filter.onTransactionCommitted(transaction),
        () => find.onTransactionCommitted(transaction),
      ]) expect(callback).toThrow('editor.commands.run');

      Object.assign(formula, { initialDataComplete: false, initialDirtyKeys: [cellKey(0, 0)] });
      expect(() => formula.onInitialDataCell({} as never, { type: CellType.Formula, formula: '=A1' }, 0, 0))
        .toThrow('initial data scanning has completed');
      expect(() => formula.onInitialDataComplete({} as never)).toThrow('initial data scanning has completed');
      expect(Reflect.get(formula, 'updateAstCache')).toBeUndefined();
      expect(Reflect.get(formula, 'rebuildDependencyGraph')).toBeUndefined();
      expect([...scheduler.getFormulaKeys()]).toEqual(formulaKeys);
      expect(() => scheduler.dispose()).toThrow('editor.commands.run');
      expect(() => trace.emit({
        type: FormulaCalculationTraceEventType.DependenciesChanged,
        key: cellKey(0, 0), row: 0, col: 0, previousDependencies: [], dependencies: [],
      })).toThrow('editor.commands.run');

      expect(filter.version).toBe(filterVersion);
      expect(editor.queries.run(ReadSheetFindRevisionQuery, undefined)).toBe(findRevision);
      expect(() => displayedValues.publish([{ row: 0, column: 0 }])).toThrow('editor.commands.run');
      expect(filter.version).toBe(filterVersion);
    } finally {
      editor.destroy();
    }
  });

  it('locks every default plugin document state after Sheet assembly', () => {
    const sheetState = createSheetState({ size: 2 });
    sheetState.sheetData.addItem(0, 0, { type: CellType.String, value: 'original' });
    let container: Container | null = null;
    const editor = createSheetEditor({
      sheetState,
      adapters: {
        ...createHeadlessAdapters(),
        registerEnvironment: (value) => { container = value; },
      },
    });
    try {
      const seen = new WeakSet<object>();
      const assertLocked = (value: unknown): void => {
        if (value === null || typeof value !== 'object' || seen.has(value)) return;
        seen.add(value);
        if (value instanceof CSRMatrix) {
          expect(Object.isExtensible(value)).toBe(false);
          expect(() => CSRMatrix.prototype.addItem.call(value, 0, 0, null)).toThrow();
          value.forEachStored((entry) => assertLocked(entry));
          assertLocked(value.getDefaultValue());
          return;
        }
        if (value instanceof Rect) {
          expect(Object.isFrozen(value)).toBe(true);
          expect(() => value.update([[0, 0], [0, 0]])).toThrow();
          return;
        }
        expect(Object.isFrozen(value)).toBe(true);
        for (const entry of Object.values(value)) assertLocked(entry);
      };
      const plugins = container!.resolve<PluginManager<SearCoreSheet, CellProperties>>(PluginManager.symbol);
      for (const plugin of plugins.getAllPlugins()) assertLocked(plugin.getState());
      expect(sheetState.sheetData.getItem(0, 0)?.value).toBe('original');
    } finally {
      editor.destroy();
    }
  });

  it('does not lend command write authority to retained highlight listeners', () => {
    let container: Container | null = null;
    const notify = defineSheetCommand<void>('test.highlight.notify');
    let registry: SheetHighlightRegistry | null = null;
    const editor = createSheetEditor({
      sheetState: createSheetState(),
      adapters: {
        ...createHeadlessAdapters(),
        registerEnvironment: (value) => { container = value; },
      },
      onCreated: ({ commands }) => {
        registry = container!.resolve<SheetHighlightRegistry>(SheetHighlightRegistry.symbol);
        commands.register(notify, () => new LocalActionCommand(notify.id, () => registry!.invalidate()));
      },
    });
    try {
      const authority: boolean[] = [];
      registry!.subscribe(() => {
        authority.push(editor.commands.isExecuting());
        authority.push(runInsideCommandExecution('forged', () => editor.commands.isExecuting()));
      });
      editor.commands.run(notify, void 0);
      expect(authority).toEqual([false, false]);
    } finally {
      editor.destroy();
    }
  });

  it('requires commands for mutations through a retained collaboration channel', async () => {
    let container: Container | null = null;
    const editor = createSheetEditor({
      sheetState: createSheetState(),
      adapters: {
        ...createHeadlessAdapters(),
        registerEnvironment: (value) => { container = value; },
      },
    });
    try {
      const channel = container!.resolve<CollaborationChannelBinding>(CollaborationChannelBinding.symbol).channel;
      const options = { url: 'ws://example.test', resourceId: 'sheet-1' };
      await expect(channel.connect(options)).rejects.toThrow('editor.commands.run');
      expect(() => channel.disconnect()).toThrow('editor.commands.run');
      expect(() => channel.submitLocal('sheet.data', [])).toThrow('editor.commands.run');
      expect(() => channel.destroy()).toThrow('editor.commands.run');

      const listenerAuthority: boolean[] = [];
      const listenerWrites: unknown[] = [];
      const transportEvents: string[] = [];
      editor.commands.subscribe(({ phase, id }) => {
        if (id === 'collaboration.applyTransportEvent') transportEvents.push(phase);
      });
      channel.subscribeStatus(() => {
        listenerAuthority.push(editor.commands.isExecuting());
        try {
          runInsideCommandExecution('forged', () => channel.disconnect());
        } catch (error) { listenerWrites.push(error); }
      });

      await editor.commands.run(ConnectSheetCollaborationCommand, options).completion;
      expect(channel.getStatus().state).toBe(CollaborationConnectionState.Online);
      expect(transportEvents).toEqual(['started', 'completed']);
      expect(listenerAuthority).toEqual([false, false, false]);
      expect(listenerWrites).toHaveLength(3);
      editor.commands.run(DisconnectSheetCollaborationCommand, void 0);
      expect(channel.getStatus().state).toBe(CollaborationConnectionState.Disconnected);
    } finally {
      editor.destroy();
    }
  });

  it('does not grant direct interaction writes to a retained store listener', () => {
    let container: Container | null = null;
    const editor = createSheetEditor({
      sheetState: createSheetState(),
      adapters: {
        ...createHeadlessAdapters(),
        registerEnvironment: (value) => { container = value; },
      },
    });
    try {
      const store = container!.resolve<SheetInteractionStore>(SheetInteractionStore.symbol);
      const errors: unknown[] = [];
      const observedAuthority: boolean[] = [];
      store.subscribe(() => {
        observedAuthority.push(editor.commands.isExecuting());
        try {
          runInsideCommandExecution('forged', () => store.apply({ type: 'forged' }));
        } catch (error) { errors.push(error); }
      });

      editor.commands.run(SelectRangeCommand, { anchor: [0, 0], focus: [0, 0] });

      expect(observedAuthority).toEqual([false]);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({ message: expect.stringContaining('editor.commands.run') });
    } finally {
      editor.destroy();
    }
  });
  it('publishes detached formula-bar text and caret state across command-driven selection and editing', () => {
    const state = createSheetState();
    state.sheetData.addItem(0, 0, { type: CellType.String, value: 'alpha' });
    state.sheetData.addItem(0, 1, { type: CellType.Number, value: 42 });
    state.sheetData.addItem(1, 0, { type: CellType.Boolean, value: true });
    const editor = createSheetEditor({ sheetState: state, adapters: createHeadlessAdapters() });
    try {
      expect(editor.observations.getSnapshot(SheetFormulaBarObservation).cell).toBeNull();
      editor.commands.run(SelectRangeCommand, { anchor: [0, 0], focus: [0, 0] });
      const selected = editor.observations.getSnapshot(SheetFormulaBarObservation);
      expect(selected).toMatchObject({ cell: [0, 0], text: 'alpha', editing: false });
      selected.cell![0] = 1;
      expect(editor.observations.getSnapshot(SheetFormulaBarObservation).cell).toEqual([0, 0]);

      editor.commands.run(StartFormulaBarEditCommand, void 0);
      editor.commands.run(SetFormulaBarDraftCommand, { text: '=SUM(1,2)', selectionStart: 4, selectionEnd: 8 });
      expect(editor.observations.getSnapshot(SheetFormulaBarObservation)).toMatchObject({
        cell: [0, 0], text: '=SUM(1,2)', editing: true, selectionStart: 4, selectionEnd: 8,
      });
      editor.commands.run(CancelCellEditCommand, void 0);

      editor.commands.run(SelectRangeCommand, { anchor: [0, 1], focus: [0, 1] });
      expect(editor.observations.getSnapshot(SheetFormulaBarObservation).text).toBe('42');
      editor.commands.run(SelectRangeCommand, { anchor: [1, 0], focus: [1, 0] });
      expect(editor.observations.getSnapshot(SheetFormulaBarObservation).text).toBe('true');
      editor.commands.run(SelectRangeCommand, { anchor: [1, 1], focus: [1, 1] });
      expect(editor.observations.getSnapshot(SheetFormulaBarObservation).text).toBe('');
    } finally {
      editor.destroy();
    }
  });
  it('searches the formatted display text of a numeric cell', () => {
    const state = createSheetState({ size: 2 });
    state.sheetData.addItem(0, 0, { type: CellType.Number, value: 0.25 });
    state.cellFormats.addItem(0, 0, { kind: 'percent' });
    const editor = createSheetEditor({ sheetState: state, adapters: createHeadlessAdapters() });
    expect(editor.queries.run(FindSheetMatchesQuery, { text: '25%' }))
      .toMatchObject([{ row: 0, column: 0, text: '25%' }]);
    expect(editor.queries.run(FindSheetMatchesQuery, { text: '0.25' })).toEqual([]);
    editor.destroy();
  });

  it('keeps a bulk replacement undoable and invalidates find pages after data changes', () => {
    const state = createSheetState({ size: 2 });
    state.sheetData.addItem(0, 0, { type: CellType.String, value: 'foo' });
    state.sheetData.addItem(1, 0, { type: CellType.String, value: 'foo' });
    const editor = createSheetEditor({ sheetState: state, adapters: createHeadlessAdapters() });
    const page = editor.queries.run(FindSheetMatchPageQuery, { text: 'foo', limit: 1 });
    expect(page).toMatchObject({ total: 2, startIndex: 0, revision: 0 });
    editor.commands.run(ReplaceAllSheetMatchesCommand, { text: 'foo', replacement: 'bar' });
    expect(editor.queries.run(ReadSheetFindRevisionQuery, undefined)).toBe(1);
    expect(editor.queries.run(FindSheetMatchesQuery, { text: 'bar' })).toHaveLength(2);
    expect(() => editor.queries.run(FindSheetMatchPageQuery, {
      text: 'foo', limit: 1, cursor: page.matches[0], expectedRevision: page.revision,
    })).toThrow('Find results changed');
    editor.commands.run(UndoSheetCommand, undefined);
    expect(editor.queries.run(FindSheetMatchesQuery, { text: 'foo' })).toHaveLength(2);
    editor.destroy();
  });

  it.each([
    [0, 1, CellRegion.Grid],
    [0, 1.5, CellRegion.Grid],
    [1, 1, CellRegion.Grid],
    [1, 1.5, CellRegion.Grid],
    [0, 1, CellRegion.RowHeader],
    [0, 1.5, CellRegion.RowHeader],
    [1, 1, CellRegion.ColumnHeader],
    [1, 1.5, CellRegion.ColumnHeader],
  ] as const)(
    'locates axis %s insertion edges at zoom %s from %s with header offsets and scrolling',
    (axis, zoom, region) => {
      const state = createSheetState({ size: 8 });
      state.rowSizes.addItem(0, 0, 30);
      state.rowSizes.addItem(0, 1, 50);
      state.columnSizes.addItem(0, 0, 80);
      state.columnSizes.addItem(0, 1, 140);
      state.sheetData.addItem(axis === 0 ? 1 : 0, axis === 0 ? 0 : 1, { type: CellType.String, value: 'offset-drag' });
      let container: Container | undefined;
      const editor = createSheetEditor({
        sheetState: state,
        viewport: { width: 150, height: 80 },
        adapters: {
          ...createHeadlessAdapters(),
          pointerCapture: RangeMovePointer,
          registerEnvironment: (value) => {
            container = value;
          },
        },
      });
      const core = container!.resolve<SearCoreSheet>(SearCoreSheet.symbol);
      editor.commands.run(UpdateSheetDefaultConfigCommand, { sheetOffsetX: 84, sheetOffsetY: 36 });
      editor.commands.run(SetSheetZoomCommand, zoom);
      editor.commands.run(SelectRangeCommand, {
        anchor: axis === 0 ? [1, 0] : [0, 1],
        focus: axis === 0 ? [1, 7] : [7, 1],
      });
      editor.commands.run(ScrollViewportToCommand, { x: 20, y: 10 });
      const scroll = core.renderEngine.scrollManager.getState();
      const screen = (x: number, y: number) => ({ x: (x - scroll.x) * zoom, y: (y - scroll.y) * zoom });
      const start =
        region === CellRegion.Grid
          ? axis === 0
            ? screen(130, 66)
            : screen(164, 80)
          : axis === 0
          ? { x: 25 * zoom, y: screen(0, 91).y }
          : { x: screen(234, 0).x, y: 18 * zoom };
      const selection = container!.resolve<SheetSelectionPlugin>(SheetSelectionPlugin.symbol);
      const pointer = container!.resolve<RangeMovePointer>(PointerCapture.symbol);
      selection.onMouseDown(core, {
        origin: { offsetX: start.x, offsetY: start.y },
        target: { properties: { region } },
      } as never);
      expect(pointer.handlers).not.toBeNull();
      pointer.handlers!.onRelease({ view: axis === 0 ? screen(130, 130) : screen(360, 80) });
      const moved = editor.commands.run(ExportSheetStateCommand, undefined).sheetState;
      expect(moved.sheetData.getItem(axis === 0 ? 2 : 0, axis === 0 ? 0 : 2)?.value).toBe('offset-drag');
      expect(core.renderEngine.scrollManager.getState()).toEqual(scroll);
      editor.destroy();
    },
  );
  it.each([0, 1] as const)(
    'replays axis %s reordering and its inverse through collaborative owner operations',
    (axis) => {
      const makeState = () => {
        const state = createSheetState({ size: 4 });
        state.sheetData.addItem(0, 0, { type: CellType.String, value: 'shared-axis' });
        state.cellFills.addItem(0, 0, '#ff0000');
        state.rowSizes.addItem(0, 0, 41);
        state.columnSizes.addItem(0, 0, 141);
        return state;
      };
      let container: Container | undefined;
      const local = createSheetEditor({
        sheetState: makeState(),
        adapters: {
          ...createHeadlessAdapters(),
          registerEnvironment: (value) => {
            container = value;
          },
        },
      });
      const remote = createSheetEditor({ sheetState: makeState(), adapters: createHeadlessAdapters() });
      const plugins = container!.resolve<PluginManager<SearCoreSheet, CellProperties>>(PluginManager.symbol);
      const replay = (result: ReturnType<typeof local.commands.run>) => {
        result.pipeline.steps.forEach(({ transaction }) => {
          if (!transaction) return;
          const owner = plugins.getTransactionOTContribution(transaction);
          if (owner?.collaborative)
            remote.commands.run(ApplyRemoteOperationsCommand, {
              ownerId: owner.ownerId,
              operations: transaction.operations,
            });
        });
      };
      replay(local.commands.run(axis === 0 ? MoveRowsCommand : MoveColumnsCommand, { index: 0, count: 2, before: 4 }));
      let moved = remote.commands.run(ExportSheetStateCommand, undefined).sheetState;
      expect(moved.sheetData.getItem(axis === 0 ? 2 : 0, axis === 0 ? 0 : 2)?.value).toBe('shared-axis');
      expect(moved.cellFills?.getItem(axis === 0 ? 2 : 0, axis === 0 ? 0 : 2)).toBe('#ff0000');
      expect((axis === 0 ? moved.rowSizes : moved.columnSizes).getItem(0, 2)).toBe(axis === 0 ? 41 : 141);
      replay(local.commands.run(UndoSheetCommand, undefined));
      moved = remote.commands.run(ExportSheetStateCommand, undefined).sheetState;
      expect(moved.sheetData.getItem(0, 0)?.value).toBe('shared-axis');
      local.destroy();
      remote.destroy();
    },
  );
  it('persists relative and absolute formula references through row reordering and restores them on undo', () => {
    const state = createSheetState({ size: 4 });
    state.sheetData.addItem(0, 0, { type: CellType.Number, value: 7 });
    state.sheetData.addItem(1, 0, { type: CellType.Number, value: 9 });
    state.sheetData.addItem(3, 1, { type: CellType.Formula, formula: '=$A$1+A2', value: 0 });
    const editor = createSheetEditor({ sheetState: state, adapters: createHeadlessAdapters() });
    const snapshot = () => editor.commands.run(ExportSheetStateCommand, undefined).sheetState;
    editor.commands.run(MoveRowsCommand, { index: 0, count: 2, before: 3 });
    expect(snapshot().sheetData.getItem(3, 1)?.formula).toBe('=$A$2+A3');
    editor.commands.run(UndoSheetCommand, undefined);
    expect(snapshot().sheetData.getItem(3, 1)?.formula).toBe('=$A$1+A2');
    editor.commands.run(RedoSheetCommand, undefined);
    expect(snapshot().sheetData.getItem(3, 1)?.formula).toBe('=$A$2+A3');
    const moved = snapshot();
    editor.destroy();
    const remounted = createSheetEditor({ sheetState: moved, adapters: createHeadlessAdapters() });
    expect(remounted.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData.getItem(3, 1)?.formula).toBe(
      '=$A$2+A3',
    );
    remounted.destroy();
  });
  it.each([0, 1] as const)('reorders axis %s, carries independent matrices, and supports undo and redo', (axis) => {
    const state = createSheetState({ size: 4 });
    for (let i = 0; i < 4; i++)
      state.sheetData.addItem(axis === 0 ? i : 0, axis === 0 ? 0 : i, { type: CellType.String, value: String(i) });
    state.cellFills.addItem(0, 0, '#ff0000');
    state.duplicates.addItem(0, 0, '#00ff00');
    state.cellAlignments.addItem(0, 0, SheetHorizontalAlignment.Center);
    state.cellFormats.addItem(0, 0, { kind: 'text' });
    state.rowSizes.addItem(0, 0, 41);
    state.columnSizes.addItem(0, 0, 141);
    const editor = createSheetEditor({ sheetState: state, adapters: createHeadlessAdapters() });
    const snapshot = () => editor.commands.run(ExportSheetStateCommand, undefined).sheetState;
    const values = () =>
      Array.from({ length: 4 }, (_, i) => snapshot().sheetData.getItem(axis === 0 ? i : 0, axis === 0 ? 0 : i)?.value);
    editor.commands.run(axis === 0 ? MoveRowsCommand : MoveColumnsCommand, { index: 0, count: 2, before: 4 });
    expect(values()).toEqual(['2', '3', '0', '1']);
    const point = axis === 0 ? [2, 0] : [0, 2];
    expect(snapshot().cellFills?.getItem(...(point as [number, number]))).toBe('#ff0000');
    expect(snapshot().duplicates?.getItem(...(point as [number, number]))).toBe('#00ff00');
    expect(snapshot().cellAlignments.getItem(...(point as [number, number]))).toBe(SheetHorizontalAlignment.Center);
    expect(snapshot().cellFormats?.getItem(...(point as [number, number]))).toEqual({ kind: 'text' });
    expect((axis === 0 ? snapshot().rowSizes : snapshot().columnSizes).getItem(0, 2)).toBe(axis === 0 ? 41 : 141);
    editor.commands.run(UndoSheetCommand, undefined);
    expect(values()).toEqual(['0', '1', '2', '3']);
    editor.commands.run(RedoSheetCommand, undefined);
    expect(values()).toEqual(['2', '3', '0', '1']);
    editor.destroy();
  });

  it('moves a complete multirow merge, and atomically rejects inserting into or splitting one', () => {
    const state = createSheetState({ size: 4 });
    state.cellMerges.addItem(0, 0, { endRow: 1, endColumn: 1 });
    state.sheetData.addItem(0, 0, { type: CellType.String, value: 'merge' });
    const editor = createSheetEditor({ sheetState: state, adapters: createHeadlessAdapters() });
    const snapshot = () => editor.commands.run(ExportSheetStateCommand, undefined).sheetState;
    expect(() => editor.commands.run(MoveRowsCommand, { index: 0, before: 4 })).toThrow('merged cell');
    expect(snapshot().sheetData.getItem(0, 0)?.value).toBe('merge');
    expect(() => editor.commands.run(MoveRowsCommand, { index: 3, before: 1 })).toThrow('merged cell');
    editor.commands.run(MoveRowsCommand, { index: 0, count: 2, before: 4 });
    expect(snapshot().cellMerges?.getItem(2, 0)).toEqual({ endRow: 3, endColumn: 1 });
    editor.commands.run(UndoSheetCommand, undefined);
    expect(snapshot().cellMerges?.getItem(0, 0)).toEqual({ endRow: 1, endColumn: 1 });
    editor.destroy();
  });

  it.each([
    [0, CellRegion.Grid],
    [1, CellRegion.Grid],
    [0, CellRegion.RowHeader],
    [1, CellRegion.ColumnHeader],
  ] as const)(
    'drags complete axis %s from %s with a local insertion preview and selects the moved block',
    (axis, region) => {
      const state = createSheetState({ size: 4 });
      state.sheetData.addItem(0, 0, { type: CellType.String, value: 'axis-drag' });
      const headerRender = jest.spyOn(SheetHeaderHighlightPlugin.prototype, 'render');
      let container: Container | undefined;
      const editor = createSheetEditor({
        sheetState: state,
        adapters: {
          ...createHeadlessAdapters(),
          pointerCapture: RangeMovePointer,
          keyboardRouter: RangeMoveKeyboard,
          registerEnvironment: (value) => {
            container = value;
          },
        },
      });
      const core = container!.resolve<SearCoreSheet>(SearCoreSheet.symbol);
      const selection = container!.resolve<SheetSelectionPlugin>(SheetSelectionPlugin.symbol);
      const pointer = container!.resolve<RangeMovePointer>(PointerCapture.symbol);
      const focus: [number, number] =
        axis === 0 ? [1, state.sheetData.shape[1] - 1] : [state.sheetData.shape[0] - 1, 1];
      editor.commands.run(SelectRangeCommand, { anchor: [0, 0], focus });
      const event = {
        origin: {
          offsetX:
            region === CellRegion.RowHeader ? 25 : region === CellRegion.ColumnHeader ? 200 : axis === 0 ? 80 : 250,
          offsetY:
            region === CellRegion.ColumnHeader ? 12 : axis === 0 ? (region === CellRegion.RowHeader ? 60 : 72) : 60,
        },
        target: { properties: { region } },
      } as never;
      selection.onMouseDown(core, event);
      expect(pointer.handlers).not.toBeNull();
      const point = { view: { x: axis === 0 ? 80 : 440, y: axis === 0 ? 115 : 60 } };
      pointer.handlers!.onMove!(point);
      const preview = container!
        .resolve<SheetHighlightRegistry>(SheetHighlightRegistry.symbol)
        .getHighlights({ searCore: core });
      expect(preview).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ edge: axis === 0 ? 'bottom' : 'right', type: 'sheet-axis-move-guide' }),
        ]),
      );
      expect(editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData.getItem(0, 0)?.value).toBe(
        'axis-drag',
      );
      pointer.handlers!.onRelease(point);
      expect(core.renderEngine.scrollManager.getState()).toEqual(expect.objectContaining({ x: 0, y: 0 }));
      const moved = editor.commands.run(ExportSheetStateCommand, undefined).sheetState;
      expect(moved.sheetData.getItem(axis === 0 ? 2 : 0, axis === 0 ? 0 : 2)?.value).toBe('axis-drag');
      expect(editor.queries.run(GetActiveCell, undefined)).toEqual(axis === 0 ? [2, 0] : [0, 2]);
      headerRender.mockClear();
      editor.commands.run(UndoSheetCommand, undefined);
      expect(headerRender).toHaveBeenCalled();
      expect(editor.queries.run(GetActiveCell, undefined)).toEqual([0, 0]);
      headerRender.mockClear();
      editor.commands.run(RedoSheetCommand, undefined);
      expect(headerRender).toHaveBeenCalled();
      expect(editor.queries.run(GetActiveCell, undefined)).toEqual(axis === 0 ? [2, 0] : [0, 2]);
      editor.destroy();
      headerRender.mockRestore();
      expect(pointer.handlers).toBeNull();
    },
  );
  it.each([0, 1] as const)(
    'keeps unselected headers, resize handles and whole-sheet selection out of axis %s dragging',
    (axis) => {
      const state = createSheetState({ size: 4 });
      let container: Container | undefined;
      const editor = createSheetEditor({
        sheetState: state,
        adapters: {
          ...createHeadlessAdapters(),
          pointerCapture: RangeMovePointer,
          registerEnvironment: (value) => {
            container = value;
          },
        },
      });
      const drag = container!.resolve<SheetRangeDrag>(SheetRangeDrag.symbol);
      const event = (index: number, edge = false) =>
        ({
          origin: {
            offsetX: axis === 0 ? 25 : 50 + index * 100 + (edge ? 100 : 50),
            offsetY: axis === 0 ? 24 + index * 24 + (edge ? 24 : 12) : 12,
          },
          target: { properties: { region: axis === 0 ? CellRegion.RowHeader : CellRegion.ColumnHeader } },
        } as never);
      editor.commands.run(SelectRangeCommand, {
        anchor: axis === 0 ? [1, 0] : [0, 1],
        focus: axis === 0 ? [1, 3] : [3, 1],
      });
      expect(drag.onMouseDown(event(0))).toBe(false);
      expect(drag.onMouseDown(event(1, true))).toBe(false);
      expect(drag.isActive()).toBe(false);
      expect(drag.onMouseDown(event(1))).toBe(true);
      editor.commands.run(HandleSheetRangeDragCommand, { action: SheetRangeDragAction.Cancel });
      editor.commands.run(SelectRangeCommand, { anchor: [0, 0], focus: [3, 3] });
      expect(drag.onMouseDown(event(1))).toBe(false);
      editor.commands.run(SelectRangeCommand, { anchor: [1, 1], focus: [2, 2] });
      expect(drag.onMouseDown(event(1))).toBe(false);
      editor.destroy();
    },
  );
  it.each([
    [1, 234, 66],
    [1, 304, 91],
    [1, 234, 116],
    [1, 164, 91],
    [1.5, 234, 66],
    [1.5, 304, 91],
    [1.5, 234, 116],
    [1.5, 164, 91],
  ])('targets the pointer cell at zoom %s regardless of grabbed border (%s, %s)', (zoom, x, y) => {
    const state = createSheetState();
    state.columnSizes.addItem(0, 0, 80);
    state.columnSizes.addItem(0, 1, 140);
    state.rowSizes.addItem(0, 0, 30);
    state.rowSizes.addItem(0, 1, 50);
    let container: Container | undefined;
    const editor = createSheetEditor({
      sheetState: state,
      viewport: { width: 150, height: 80 },
      adapters: {
        ...createHeadlessAdapters(),
        pointerCapture: RangeMovePointer,
        registerEnvironment: (value) => {
          container = value;
        },
      },
    });
    const core = container!.resolve<SearCoreSheet>(SearCoreSheet.symbol);
    editor.commands.run(UpdateSheetDefaultConfigCommand, { sheetOffsetX: 84, sheetOffsetY: 36 });
    editor.commands.run(SetSheetZoomCommand, zoom);
    editor.commands.run(SelectRangeCommand, { anchor: [1, 1], focus: [1, 1] });
    editor.commands.run(ScrollViewportToCommand, { x: 20, y: 10 });
    const scroll = core.renderEngine.scrollManager.getState();
    const point = { x: (x - scroll.x) * zoom, y: (y - scroll.y) * zoom };
    const selection = container!.resolve<SheetSelectionPlugin>(SheetSelectionPlugin.symbol);
    const pointer = container!.resolve<RangeMovePointer>(PointerCapture.symbol);
    const cursor = container!.resolve<CursorEngine>(CursorEngine.symbol);
    const override = jest.spyOn(cursor, 'override');
    expect(
      container!.resolve<CursorRegistry>(CursorRegistry.symbol).resolve(null, {
        core,
        origin: { offsetX: point.x, offsetY: point.y } as never,
        world: { x, y },
        view: { x: point.x / zoom, y: point.y / zoom },
        target: { region: 'grid' } as CellProperties,
      }),
    ).toBe(CursorToken.Grab);
    selection.onMouseDown(core, {
      origin: { offsetX: point.x, offsetY: point.y },
      target: { properties: { region: 'grid' } },
    } as never);
    expect(override).toHaveBeenCalledWith(CursorToken.Grabbing);
    const preview = () =>
      container!
        .resolve<SheetHighlightRegistry>(SheetHighlightRegistry.symbol)
        .getHighlights({ searCore: core })
        .find((highlight) => highlight.stroke === '#16834b');
    for (const [worldX, worldY, target] of [
      [85, 37, [0, 0]],
      [163, 65, [0, 0]],
      [164, 66, [1, 1]],
      [165, 67, [1, 1]],
      [303, 115, [1, 1]],
      [163, 67, [1, 0]],
      [165, 65, [0, 1]],
    ] as const) {
      pointer.handlers!.onMove!({ view: { x: (worldX - scroll.x) * zoom, y: (worldY - scroll.y) * zoom } });
      expect(preview()?.start).toEqual(target);
    }
    editor.destroy();
    expect(override).toHaveBeenLastCalledWith(null);
  });
  it('auto-scrolls while captured at a viewport edge and releases animation work on cancellation', () => {
    let container: Container | undefined;
    const editor = createSheetEditor({
      sheetState: createSheetState(),
      viewport: { width: 150, height: 60 },
      adapters: {
        ...createHeadlessAdapters(),
        platform: RangeMovePlatform,
        pointerCapture: RangeMovePointer,
        registerEnvironment: (value) => {
          container = value;
        },
      },
    });
    const core = container!.resolve<SearCoreSheet>(SearCoreSheet.symbol);
    const platform = container!.resolve<RangeMovePlatform>(Platform.symbol);
    const pointer = container!.resolve<RangeMovePointer>(PointerCapture.symbol);
    const selection = container!.resolve<SheetSelectionPlugin>(SheetSelectionPlugin.symbol);
    editor.commands.run(SelectRangeCommand, { anchor: [0, 0], focus: [0, 0] });
    selection.onMouseDown(core, {
      origin: { offsetX: 80, offsetY: 48 },
      target: { properties: { region: 'grid' } },
    } as never);
    pointer.handlers!.onMove!({ view: { x: 145, y: 58 } });
    platform.frame!(16);
    expect(core.renderEngine.scrollManager.getState().x).toBeGreaterThan(0);
    expect(platform.frame).not.toBeNull();
    editor.commands.run(HandleSheetRangeDragCommand, { action: SheetRangeDragAction.Cancel });
    expect(platform.frame).toBeNull();
    expect(pointer.handlers).toBeNull();
    editor.destroy();
  });
  it('replays every move owner through the collaboration boundary, including inverse moves', () => {
    const makeState = () => {
      const state = createSheetState();
      state.sheetData.addItem(0, 0, { type: CellType.String, value: 'shared' });
      state.cellFills.addItem(0, 0, '#ff0000');
      state.cellAlignments.addItem(0, 0, 'center');
      state.duplicates.addItem(0, 0, '#00ff00');
      return state;
    };
    let container: Container | undefined;
    const local = createSheetEditor({
      sheetState: makeState(),
      adapters: {
        ...createHeadlessAdapters(),
        registerEnvironment: (value) => {
          container = value;
        },
      },
    });
    const remote = createSheetEditor({ sheetState: makeState(), adapters: createHeadlessAdapters() });
    const plugins = container!.resolve<PluginManager<SearCoreSheet, CellProperties>>(PluginManager.symbol);
    const replay = (result: {
      pipeline: { steps: readonly { transaction?: import('@searsuite/sear-domain-transaction').Transaction }[] };
    }) => {
      result.pipeline.steps.forEach(({ transaction }) => {
        if (!transaction) return;
        const owner = plugins.getTransactionOTContribution(transaction);
        if (owner?.collaborative)
          remote.commands.run(ApplyRemoteOperationsCommand, {
            ownerId: owner.ownerId,
            operations: transaction.operations,
          });
      });
    };
    replay(local.commands.run(MoveSheetRangeCommand, { source: { start: [0, 0], end: [0, 0] }, target: [1, 1] }));
    let snapshot = remote.commands.run(ExportSheetStateCommand, undefined).sheetState;
    expect(snapshot.sheetData.getItem(1, 1)?.value).toBe('shared');
    expect(snapshot.cellFills?.getItem(1, 1)).toBe('#ff0000');
    expect(snapshot.cellAlignments.getItem(1, 1)).toBe('center');
    expect(snapshot.duplicates?.getItem(1, 1)).toBe('#00ff00');
    replay(local.commands.run(UndoSheetCommand, undefined));
    snapshot = remote.commands.run(ExportSheetStateCommand, undefined).sheetState;
    expect(snapshot.sheetData.getItem(0, 0)?.value).toBe('shared');
    expect(snapshot.cellAlignments.getItem(0, 0)).toBe('center');
    local.destroy();
    remote.destroy();
  });
  it('keeps drag previews local, cancels with Escape, and commits the exact destination on release', async () => {
    const state = createSheetState();
    state.sheetData.addItem(0, 0, { type: CellType.String, value: 'drag' });
    let container: Container | undefined;
    const editor = createSheetEditor({
      sheetState: state,
      adapters: {
        ...createHeadlessAdapters(),
        pointerCapture: RangeMovePointer,
        keyboardRouter: RangeMoveKeyboard,
        registerEnvironment: (value) => {
          container = value;
        },
      },
    });
    const core = container!.resolve<SearCoreSheet>(SearCoreSheet.symbol);
    const selection = container!.resolve<SheetSelectionPlugin>(SheetSelectionPlugin.symbol);
    const pointer = container!.resolve<RangeMovePointer>(PointerCapture.symbol);
    const keyboard = container!.resolve<RangeMoveKeyboard>(KeyboardRouter.symbol);
    const drag = container!.resolve<SheetRangeDrag>(SheetRangeDrag.symbol);
    editor.commands.run(SelectRangeCommand, { anchor: [0, 0], focus: [0, 0] });
    const event = { origin: { offsetX: 80, offsetY: 48 }, target: { properties: { region: 'grid' } } } as never;
    expect(selection.onMouseDown(core, event)).toBe(false);
    expect(drag.isActive()).toBe(true);
    pointer.handlers!.onMove!({ view: { x: 180, y: 72 } });
    expect(
      container!.resolve<SheetHighlightRegistry>(SheetHighlightRegistry.symbol).getHighlights({ searCore: core }),
    ).toEqual(expect.arrayContaining([expect.objectContaining({ start: [1, 1], end: [1, 1], stroke: '#16834b' })]));
    expect(editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData.getItem(0, 0)?.value).toBe(
      'drag',
    );
    // Snapshot reads are not mutations and must leave the gesture active.
    expect(drag.isActive()).toBe(true);
    keyboard.handlers.onEscape!();
    expect(drag.isActive()).toBe(false);
    expect(pointer.handlers).toBeNull();
    selection.onMouseDown(core, event);
    pointer.handlers!.onRelease({ view: { x: 180, y: 72 } });
    await Promise.resolve();
    const result = editor.commands.run(ExportSheetStateCommand, undefined).sheetState;
    expect(result.sheetData.getItem(0, 0)).toBeNull();
    expect(result.sheetData.getItem(1, 1)?.value).toBe('drag');
    editor.commands.run(UndoSheetCommand, undefined);
    editor.commands.run(SelectRangeCommand, { anchor: [0, 0], focus: [0, 0] });
    selection.onMouseDown(core, event);
    expect(drag.isActive()).toBe(true);
    editor.destroy();
    expect(pointer.handlers).toBeNull();
    expect(drag.isActive()).toBe(false);
  });
  it('keeps retained range drag handles from ending an assembled gesture outside commands', () => {
    let container: Container | undefined;
    const editor = createSheetEditor({
      sheetState: createSheetState(),
      adapters: {
        ...createHeadlessAdapters(),
        pointerCapture: RangeMovePointer,
        registerEnvironment: (value) => { container = value; },
      },
    });
    const core = container!.resolve<SearCoreSheet>(SearCoreSheet.symbol);
    const selection = container!.resolve<SheetSelectionPlugin>(SheetSelectionPlugin.symbol);
    const drag = container!.resolve<SheetRangeDrag>(SheetRangeDrag.symbol);
    const embedded = container!.resolve<SheetEmbeddedEditor>(SheetEmbeddedEditor.symbol);
    expect(() => embedded.dispose()).toThrow('editor owner');
    editor.commands.run(SelectRangeCommand, { anchor: [0, 0], focus: [0, 0] });
    selection.onMouseDown(core, {
      origin: { offsetX: 80, offsetY: 48 },
      target: { properties: { region: CellRegion.Grid } },
    } as never);
    expect(drag.isActive()).toBe(true);
    expect(() => drag.destroy()).toThrow('editor owner');
    expect(() => SheetRangeDrag.prototype.destroy.call(drag)).toThrow('editor owner');
    expect(() => drag.bind(core, () => selection.getState()[1], {})).toThrow('already bound');
    expect(() => drag.setUserInteraction(undefined)).toThrow('already bound');
    Object.assign(drag, { destroyed: true, core: null, readSelection: () => null });
    expect(drag.isActive()).toBe(true);
    editor.commands.run(HandleSheetRangeDragCommand, { action: SheetRangeDragAction.Cancel });
    expect(drag.isActive()).toBe(false);
    editor.destroy();
  });

  it('cancels an overwrite decision when the document changes before confirmation resolves', async () => {
    const state = createSheetState();
    state.sheetData.addItem(0, 0, { type: CellType.String, value: 'source' });
    state.sheetData.addItem(1, 1, { type: CellType.String, value: 'destination' });
    let container: Container | undefined;
    const editor = createSheetEditor({
      sheetState: state,
      adapters: {
        ...createHeadlessAdapters(),
        pointerCapture: RangeMovePointer,
        userInteraction: RangeMoveConfirmation,
        registerEnvironment: (value) => {
          container = value;
        },
      },
    });
    const core = container!.resolve<SearCoreSheet>(SearCoreSheet.symbol);
    const selection = container!.resolve<SheetSelectionPlugin>(SheetSelectionPlugin.symbol);
    const pointer = container!.resolve<RangeMovePointer>(PointerCapture.symbol);
    const confirmation = container!.resolve<RangeMoveConfirmation>(UserInteractionService.symbol);
    let resolve: (confirmed: boolean) => void = () => {};
    confirmation.confirm.mockImplementation(
      () =>
        new Promise<boolean>((done) => {
          resolve = done;
        }),
    );
    editor.commands.run(SelectRangeCommand, { anchor: [0, 0], focus: [0, 0] });
    selection.onMouseDown(core, {
      origin: { offsetX: 80, offsetY: 48 },
      target: { properties: { region: 'grid' } },
    } as never);
    pointer.handlers!.onRelease({ view: { x: 180, y: 72 } });
    expect(confirmation.confirm).toHaveBeenCalledTimes(1);
    editor.commands.run(ClearRangeContentsCommand, { anchor: [0, 0], focus: [0, 0] });
    resolve(true);
    await Promise.resolve();
    expect(editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData.getItem(1, 1)?.value).toBe(
      'destination',
    );
    editor.destroy();
  });
  it('moves plugin-owned cell state atomically and restores all of it in one undo', () => {
    const state = createSheetState();
    state.sheetData.addItem(0, 0, { type: CellType.String, value: 'move' });
    state.cellFills.addItem(0, 0, '#ff0000');
    state.duplicates.addItem(0, 0, '#00ff00');
    state.cellAlignments.addItem(0, 0, 'center');
    state.cellVerticalAlignments.addItem(0, 0, 'top');
    state.cellFormats.addItem(0, 0, { kind: 'text' });
    state.fixedRows?.addItem(0, 0, true);
    const editor = createSheetEditor({ sheetState: state, adapters: createHeadlessAdapters() });
    const snapshot = () => editor.commands.run(ExportSheetStateCommand, undefined).sheetState;
    editor.commands.run(MoveSheetRangeCommand, { source: { start: [0, 0], end: [0, 0] }, target: [1, 1] });
    const moved = snapshot();
    expect(moved.sheetData.getItem(0, 0)).toBeNull();
    expect(moved.sheetData.getItem(1, 1)?.value).toBe('move');
    expect(moved.cellFills?.getItem(1, 1)).toBe('#ff0000');
    expect(moved.duplicates?.getItem(1, 1)).toBe('#00ff00');
    expect(moved.cellAlignments.getItem(1, 1)).toBe('center');
    expect(moved.cellVerticalAlignments?.getItem(1, 1)).toBe('top');
    expect(moved.cellFormats?.getItem(1, 1)).toEqual({ kind: 'text' });
    expect(moved.fixedRows?.getItem(0, 0)).toBe(true);
    expect(editor.queries.run(GetActiveCell, undefined)).toEqual([1, 1]);
    editor.commands.run(UndoSheetCommand, undefined);
    const restored = snapshot();
    expect(restored.sheetData.getItem(0, 0)?.value).toBe('move');
    expect(restored.cellFills?.getItem(0, 0)).toBe('#ff0000');
    expect(restored.cellAlignments.getItem(0, 0)).toBe('center');
    expect(restored.duplicates?.getItem(0, 0)).toBe('#00ff00');
    expect(restored.cellFormats?.getItem(0, 0)).toEqual({ kind: 'text' });
    editor.commands.run(RedoSheetCommand, undefined);
    expect(snapshot().sheetData.getItem(1, 1)?.value).toBe('move');
    editor.destroy();
  });

  it('moves overlapping rectangles without destroying unread cells and requires overwrite authorization', () => {
    const state = createSheetState();
    state.sheetData.addItem(0, 0, { type: CellType.String, value: 'a' });
    state.sheetData.addItem(0, 1, { type: CellType.String, value: 'b' });
    state.sheetData.addItem(1, 0, { type: CellType.String, value: 'c' });
    const editor = createSheetEditor({ sheetState: state, adapters: createHeadlessAdapters() });
    const input = { source: { start: [0, 0], end: [1, 0] }, target: [0, 1] } as const;
    expect(editor.queries.run(GetSheetRangeMoveConflict, input)).toBe(true);
    expect(() => editor.commands.run(MoveSheetRangeCommand, input)).toThrow('destination contains');
    expect(editor.commands.run(ExportSheetStateCommand, undefined).sheetState.sheetData.getItem(0, 0)?.value).toBe('a');
    editor.commands.run(MoveSheetRangeCommand, { ...input, overwrite: true });
    let moved = editor.commands.run(ExportSheetStateCommand, undefined).sheetState;
    expect(moved.sheetData.getItem(0, 1)?.value).toBe('a');
    expect(moved.sheetData.getItem(1, 1)?.value).toBe('c');
    editor.commands.run(UndoSheetCommand, undefined);
    const overlap = { source: { start: [0, 0], end: [0, 1] }, target: [1, 0] } as const;
    editor.commands.run(MoveSheetRangeCommand, { ...overlap, overwrite: true });
    moved = editor.commands.run(ExportSheetStateCommand, undefined).sheetState;
    expect(moved.sheetData.getItem(1, 0)?.value).toBe('a');
    expect(moved.sheetData.getItem(1, 1)?.value).toBe('b');
    editor.destroy();
  });

  it('moves complete merges and rejects split merges and invalid coordinates', () => {
    const state = createSheetState();
    state.cellMerges.setItem(0, 0, { endRow: 0, endColumn: 1 });
    const editor = createSheetEditor({ sheetState: state, adapters: createHeadlessAdapters() });
    expect(() =>
      editor.commands.run(MoveSheetRangeCommand, { source: { start: [0, 0], end: [0, 0] }, target: [1, 0] }),
    ).toThrow('splits a merged');
    expect(() =>
      editor.commands.run(MoveSheetRangeCommand, { source: { start: [0, 0], end: [0, 1] }, target: [2, 0] }),
    ).toThrow('outside sheet');
    editor.commands.run(MoveSheetRangeCommand, { source: { start: [0, 0], end: [0, 1] }, target: [1, 0] });
    let moved = editor.commands.run(ExportSheetStateCommand, undefined).sheetState;
    expect(moved.cellMerges?.getItem(0, 0)).toBeNull();
    expect(moved.cellMerges?.getItem(1, 0)).toEqual({ endRow: 1, endColumn: 1 });
    editor.commands.run(UndoSheetCommand, undefined);
    moved = editor.commands.run(ExportSheetStateCommand, undefined).sheetState;
    expect(moved.cellMerges?.getItem(0, 0)).toEqual({ endRow: 0, endColumn: 1 });
    editor.destroy();
  });

  it.each([
    [2, 2],
    [2, 3],
    [3, 2],
    [3, 3],
  ])('blocks partial destination merges at %s,%s even with overwrite', (row, column) => {
    const state = createSheetState({ size: 6 });
    state.sheetData.addItem(0, 0, { type: CellType.String, value: 'source' });
    state.sheetData.addItem(2, 2, { type: CellType.String, value: 'destination' });
    state.cellMerges.setItem(2, 2, { endRow: 3, endColumn: 3 });
    const editor = createSheetEditor({ sheetState: state, adapters: createHeadlessAdapters() });
    const input = { source: { start: [0, 0], end: [0, 0] }, target: [row, column] } as const;
    expect(editor.queries.run(AnalyzeSheetRangeMove, input)).toMatchObject({
      status: SheetRangeMoveStatus.Blocked,
      context: { destination: { start: [row, column], end: [row, column] } },
      issue: { code: 'SHEET_MOVE_SPLIT_MERGE' },
    });
    expect(() => editor.commands.run(MoveSheetRangeCommand, { ...input, overwrite: true })).toThrow('splits a merged');
    const unchanged = editor.commands.run(ExportSheetStateCommand, undefined).sheetState;
    expect(unchanged.sheetData.getItem(0, 0)?.value).toBe('source');
    expect(unchanged.sheetData.getItem(2, 2)?.value).toBe('destination');
    expect(unchanged.cellMerges?.getItem(2, 2)).toEqual({ endRow: 3, endColumn: 3 });
    editor.destroy();
  });

  it('replaces fully covered destination merges atomically and restores them through undo and redo', () => {
    const state = createSheetState({ size: 6 });
    state.sheetData.addItem(0, 0, { type: CellType.String, value: 'source' });
    state.sheetData.addItem(2, 2, { type: CellType.String, value: 'destination' });
    state.cellMerges.setItem(2, 2, { endRow: 3, endColumn: 3 });
    const editor = createSheetEditor({ sheetState: state, adapters: createHeadlessAdapters() });
    const input = { source: { start: [0, 0], end: [1, 1] }, target: [2, 2] } as const;
    expect(editor.queries.run(AnalyzeSheetRangeMove, input).status).toBe(SheetRangeMoveStatus.RequiresConfirmation);
    expect(() => editor.commands.run(MoveSheetRangeCommand, input)).toThrow('contains');
    editor.commands.run(MoveSheetRangeCommand, { ...input, overwrite: true });
    const snapshot = () => editor.commands.run(ExportSheetStateCommand, undefined).sheetState;
    expect(snapshot().cellMerges?.getItem(2, 2)).toBeNull();
    expect(snapshot().sheetData.getItem(2, 2)?.value).toBe('source');
    expect(snapshot().sheetData.getItem(0, 0)).toBeNull();
    editor.commands.run(UndoSheetCommand, undefined);
    expect(snapshot().cellMerges?.getItem(2, 2)).toEqual({ endRow: 3, endColumn: 3 });
    expect(snapshot().sheetData.getItem(2, 2)?.value).toBe('destination');
    expect(snapshot().sheetData.getItem(0, 0)?.value).toBe('source');
    editor.commands.run(RedoSheetCommand, undefined);
    expect(snapshot().cellMerges?.getItem(2, 2)).toBeNull();
    expect(snapshot().sheetData.getItem(2, 2)?.value).toBe('source');
    editor.destroy();
  });

  it('revalidates destination topology at commit rather than trusting an earlier assessment', () => {
    const editor = createSheetEditor({ sheetState: createSheetState({ size: 6 }), adapters: createHeadlessAdapters() });
    const input = { source: { start: [0, 0], end: [0, 0] }, target: [2, 2] } as const;
    expect(editor.queries.run(AnalyzeSheetRangeMove, input).status).toBe(SheetRangeMoveStatus.Allowed);
    editor.commands.run(ToggleMergeCellsCommand, { anchor: [2, 2], focus: [3, 3] });
    expect(editor.queries.run(AnalyzeSheetRangeMove, input).status).toBe(SheetRangeMoveStatus.Blocked);
    expect(() => editor.commands.run(MoveSheetRangeCommand, { ...input, overwrite: true })).toThrow('splits a merged');
    editor.destroy();
  });

  it('requires confirmation before replacing a merge even when its cell values are empty', () => {
    const state = createSheetState({ size: 6 });
    state.cellMerges.setItem(2, 2, { endRow: 3, endColumn: 3 });
    const editor = createSheetEditor({ sheetState: state, adapters: createHeadlessAdapters() });
    const input = { source: { start: [0, 0], end: [1, 1] }, target: [2, 2] } as const;
    expect(editor.queries.run(AnalyzeSheetRangeMove, input).status).toBe(SheetRangeMoveStatus.RequiresConfirmation);
    expect(() => editor.commands.run(MoveSheetRangeCommand, input)).toThrow('contains');
    editor.destroy();
  });

  it('allows an overlapping destination to intersect a merge wholly owned by the moving source', () => {
    const state = createSheetState({ size: 6 });
    state.cellMerges.setItem(1, 1, { endRow: 2, endColumn: 2 });
    const editor = createSheetEditor({ sheetState: state, adapters: createHeadlessAdapters() });
    const input = { source: { start: [1, 1], end: [2, 2] }, target: [2, 2] } as const;
    expect(editor.queries.run(AnalyzeSheetRangeMove, input).status).toBe(SheetRangeMoveStatus.Allowed);
    editor.commands.run(MoveSheetRangeCommand, input);
    const moved = editor.commands.run(ExportSheetStateCommand, undefined).sheetState;
    expect(moved.cellMerges?.getItem(1, 1)).toBeNull();
    expect(moved.cellMerges?.getItem(2, 2)).toEqual({ endRow: 3, endColumn: 3 });
    editor.destroy();
  });

  it('preserves formula reference identities and updates dependents in the same move', () => {
    const state = createSheetState();
    state.sheetData.addItem(0, 0, { type: CellType.Number, value: '5' });
    state.sheetData.addItem(0, 1, { type: CellType.Formula, formula: '=$A$1+1' });
    state.sheetData.addItem(1, 0, { type: CellType.Formula, formula: '=A1+2' });
    const editor = createSheetEditor({ sheetState: state, adapters: createHeadlessAdapters() });
    editor.commands.run(MoveSheetRangeCommand, { source: { start: [0, 0], end: [0, 0] }, target: [1, 1] });
    let moved = editor.commands.run(ExportSheetStateCommand, undefined).sheetState;
    expect(moved.sheetData.getItem(0, 1)?.formula).toBe('=$B$2+1');
    expect(moved.sheetData.getItem(1, 0)?.formula).toBe('=B2+2');
    editor.commands.run(UndoSheetCommand, undefined);
    moved = editor.commands.run(ExportSheetStateCommand, undefined).sheetState;
    expect(moved.sheetData.getItem(0, 1)?.formula).toBe('=$A$1+1');
    editor.commands.run(MoveSheetRangeCommand, { source: { start: [0, 1], end: [0, 1] }, target: [1, 1] });
    moved = editor.commands.run(ExportSheetStateCommand, undefined).sheetState;
    expect(moved.sheetData.getItem(1, 1)?.formula).toBe('=$A$1+1');
    editor.destroy();
  });
  it('preserves the selected input surface during IME entry, commit, and editor teardown', () => {
    let editorContainer: Container | undefined;
    const embeddedEditor = new FakeSheetEmbeddedEditor();
    const editor = createSheetEditor({
      sheetState: createSheetState(),
      embeddedEditor,
      adapters: {
        ...createHeadlessAdapters(),
        textInput: WebTextInput,
        registerEnvironment: (container) => {
          editorContainer = container;
        },
      },
    });
    editor.commands.run(SelectRangeCommand, { anchor: [0, 0], focus: [0, 0] });
    const plugin = editorContainer!.resolve<SheetCellEditorPlugin>(SheetCellEditorPlugin.symbol);
    const core = editorContainer!.resolve<SearCoreSheet>(SearCoreSheet.symbol);
    plugin.onMouseUp(core, { target: { properties: {} } } as never);
    const input = document.getElementById('searTextInput') as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    input.dispatchEvent(new CompositionEvent('compositionstart'));
    input.dispatchEvent(new CompositionEvent('compositionupdate', { data: 'zhong' }));
    expect(document.getElementById('searTextInput')).toBe(input);
    expect(embeddedEditor.editContexts).toHaveLength(1);
    input.value = 'zhong';
    input.dispatchEvent(new Event('input'));
    expect(embeddedEditor.inputs.filter((item) => item.type === 'insertText')).toHaveLength(0);
    input.dispatchEvent(new CompositionEvent('compositionend', { data: 'Chinese' }));
    editor.commands.run(CommitCellEditCommand, void 0);
    expect(
      JSON.stringify(editor.commands.run(ExportSheetStateCommand, void 0).sheetState.sheetData.getItem(0, 0)?.value),
    ).toContain('Chinese');
    expect(document.getElementById('searTextInput')).toBe(input);
    input.value = 'next';
    input.dispatchEvent(new Event('input'));
    expect(embeddedEditor.editContexts).toHaveLength(2);
    editor.commands.run(CancelCellEditCommand, void 0);
    editor.destroy();
    expect(document.getElementById('searTextInput')).toBeNull();
    input.value = 'late';
    input.dispatchEvent(new Event('input'));
    expect(embeddedEditor.editContexts).toHaveLength(2);
  });

  it('edits the active cell of a reversed range and normalizes a merged target', () => {
    const state = createSheetState();
    const embeddedEditor = new FakeSheetEmbeddedEditor();
    const editor = createSheetEditor({ sheetState: state, embeddedEditor, adapters: createHeadlessAdapters() });
    editor.commands.run(SelectRangeCommand, {
      anchor: [0, 0],
      focus: [1, 1],
      activeAnchor: [1, 1],
      activeFocus: [1, 1],
    });
    expect(editor.queries.run(GetActiveCell, void 0)).toEqual([1, 1]);
    editor.commands.run(HandleDocumentInputCommand, { kind: 'text', text: 'active' });
    editor.commands.run(CommitCellEditCommand, void 0);
    let cells = editor.commands.run(ExportSheetStateCommand, void 0).sheetState.sheetData;
    expect(JSON.stringify(cells.getItem(1, 1)?.value)).toContain('active');
    expect(cells.getItem(0, 0)).toBeNull();
    editor.commands.run(ToggleMergeCellsCommand, { anchor: [0, 0], focus: [0, 1] });
    editor.commands.run(SelectRangeCommand, { anchor: [0, 1], focus: [0, 1] });
    editor.commands.run(HandleDocumentInputCommand, { kind: 'text', text: 'merged' });
    editor.commands.run(CommitCellEditCommand, void 0);
    cells = editor.commands.run(ExportSheetStateCommand, void 0).sheetState.sheetData;
    expect(JSON.stringify(cells.getItem(0, 0)?.value)).toContain('merged');
    expect(cells.getItem(0, 1)).toBeNull();
    editor.destroy();
  });

  it('starts replacement editing from selected input, commits through history and preserves other cells', () => {
    const state = createSheetState();
    state.sheetData.addItem(0, 0, { type: CellType.String, value: 'original' });
    state.sheetData.addItem(0, 1, { type: CellType.String, value: 'neighbor' });
    const embeddedEditor = new FakeSheetEmbeddedEditor();
    const editor = createSheetEditor({ sheetState: state, embeddedEditor, adapters: createHeadlessAdapters() });
    const readCell = (row: number, col: number) =>
      editor.commands.run(ExportSheetStateCommand, void 0).sheetState.sheetData.getItem(row, col);
    editor.commands.run(HandleDocumentInputCommand, { kind: 'text', text: 'ignored' });
    expect(embeddedEditor.editContexts).toHaveLength(0);
    editor.commands.run(SelectRangeCommand, { anchor: [0, 0], focus: [1, 1] });
    expect(editor.queries.run(GetActiveCell, void 0)).toEqual([0, 0]);
    editor.commands.run(HandleDocumentInputCommand, { kind: 'text', text: 'a' });
    editor.commands.run(HandleDocumentInputCommand, { kind: 'text', text: 'bc' });
    expect(embeddedEditor.editContexts).toHaveLength(1);
    expect(readCell(0, 0)?.value).toBe('original');
    editor.commands.run(CommitCellEditCommand, void 0);
    expect(JSON.stringify(readCell(0, 0)?.value)).toContain('abc');
    expect(JSON.stringify(readCell(0, 0)?.value)).not.toContain('original');
    expect(readCell(0, 1)?.value).toBe('neighbor');
    editor.commands.run(UndoSheetCommand, void 0);
    expect(readCell(0, 0)?.value).toBe('original');
    editor.commands.run(RedoSheetCommand, void 0);
    expect(JSON.stringify(readCell(0, 0)?.value)).toContain('abc');
    editor.commands.run(HandleDocumentInputCommand, { kind: 'compositionUpdate', text: 'zhong', caretOffset: 5 });
    expect(embeddedEditor.editContexts).toHaveLength(2);
    editor.commands.run(HandleDocumentInputCommand, { kind: 'compositionUpdate', text: '', caretOffset: 0 });
    editor.commands.run(HandleDocumentInputCommand, { kind: 'text', text: 'Chinese' });
    editor.commands.run(CancelCellEditCommand, void 0);
    expect(JSON.stringify(readCell(0, 0)?.value)).toContain('abc');
    editor.commands.run(HandleDocumentInputCommand, { kind: 'text', text: '=1+2' });
    editor.commands.run(CommitCellEditCommand, void 0);
    expect(readCell(0, 0)?.formula).toBe('=1+2');
    editor.destroy();
  });

  it('completes a function inside the active cell edit session', () => {
    const editor = createSheetEditor({
      sheetState: createSheetState(),
      embeddedEditor: new FakeSheetEmbeddedEditor(),
      adapters: createHeadlessAdapters(),
    });
    editor.commands.run(SelectRangeCommand, { anchor: [0, 0], focus: [0, 0] });
    editor.commands.run(HandleDocumentInputCommand, { kind: 'text', text: '=SU' });
    const assist = editor.observations.getSnapshot(FormulaInputAssistObservation);
    expect(assist.suggestions.some((suggestion) => suggestion.name === 'SUM')).toBe(true);
    editor.commands.run(AcceptFormulaSuggestionCommand, { name: 'SUM' });
    expect(editor.observations.getSnapshot(FormulaInputAssistObservation).signature?.name).toBe('SUM');
    editor.commands.run(HandleDocumentInputCommand, { kind: 'text', text: '1,2' });
    editor.commands.run(HandleDocumentInputCommand, { kind: 'text', text: ')' });
    editor.commands.run(CommitCellEditCommand, void 0);
    const cell = editor.commands.run(ExportSheetStateCommand, void 0).sheetState.sheetData.getItem(0, 0);
    expect(cell?.formula).toBe('=SUM(1,2)');
    expect(editor.observations.getSnapshot(FormulaInputAssistObservation).suggestions).toEqual([]);
    editor.destroy();
  });

  it('registers one editor-local neutral text shaper and accepts a host override', () => {
    const defaultEditor = createSheetEditor({ sheetState: createSheetState(), adapters: createHeadlessAdapters() });
    expect(defaultEditor.services.require(SheetRuntimeCapability.TextShaper)).toBeInstanceOf(RenderContextTextShaper);
    defaultEditor.destroy();

    const customTextShaper = {
      shape: jest.fn(() => ({ width: 0, height: 0, glyphs: [], clusters: [], caretStops: [] })),
    } as unknown as TextShaper;
    const customEditor = createSheetEditor({
      sheetState: createSheetState(),
      adapters: {
        ...createHeadlessAdapters(),
        createTextShaper: () => customTextShaper,
      },
    });
    expect(customEditor.services.require(SheetRuntimeCapability.TextShaper)).toBe(customTextShaper);
    customEditor.destroy();
  });

  it('registers plugin-owned cell visual readers and clears them during teardown', () => {
    const state = createSheetState();
    state.cellAlignments.addItem(0, 1, SheetHorizontalAlignment.Right);
    state.cellFills.addItem(1, 0, '#ffcc00');
    const editor = createSheetEditor({ sheetState: state, adapters: createHeadlessAdapters() });
    const visualReaders = editor.services.require(SheetRuntimeCapability.Render).cellVisualReaders;

    expect(visualReaders.read({ rowIndex: 0, columnIndex: 1 })).toMatchObject({
      horizontalAlign: SheetHorizontalAlignment.Right,
    });
    expect(visualReaders.read({ rowIndex: 1, columnIndex: 0 })).toMatchObject({ fill: '#ffcc00' });

    editor.destroy();
    expect(visualReaders.read({ rowIndex: 0, columnIndex: 1 })).toEqual({});
  });

  it('creates, evaluates, clears, and restores highlight rules through the editor API', () => {
    const state = createSheetState({ size: 3 });
    state.sheetData.addItem(0, 0, { type: 'number', value: 10 });
    const editor = createSheetEditor({ sheetState: state, adapters: createHeadlessAdapters() });
    const visualReaders = editor.services.require(SheetRuntimeCapability.Render).cellVisualReaders;

    editor.commands.run(AddCellHighlightRuleCommand, {
      anchor: [0, 0], focus: [1, 1],
      condition: { kind: CellHighlightKind.Value, operator: CellHighlightValueOperator.Greater, value: '5' },
      style: CellHighlightStyle.RedFill,
    });
    expect(editor.queries.run(ReadCellHighlightRulesQuery, void 0)).toHaveLength(1);
    expect(visualReaders.read({ rowIndex: 0, columnIndex: 0 }).fill).toBe('#FBC8CF');
    expect(visualReaders.read({ rowIndex: 1, columnIndex: 1 }).fill).toBeUndefined();
    expect(editor.commands.run(ExportSheetStateCommand, void 0).sheetState.cellHighlights.getRules()).toHaveLength(1);

    editor.commands.run(ClearCellHighlightRulesCommand, { range: { anchor: [0, 0], focus: [0, 0] } });
    expect(visualReaders.read({ rowIndex: 0, columnIndex: 0 }).fill).toBeUndefined();
    expect(editor.queries.run(ReadCellHighlightRulesQuery, void 0)).toHaveLength(2);
    editor.commands.run(UndoSheetCommand, void 0);
    expect(visualReaders.read({ rowIndex: 0, columnIndex: 0 }).fill).toBe('#FBC8CF');
    editor.destroy();
  });

  it('registers data validation commands, document state, history and evaluator capability', () => {
    const editor = createSheetEditor({ sheetState: createSheetState({ size: 3 }), adapters: createHeadlessAdapters() });
    editor.commands.run(SetDataValidationRuleCommand, {
      anchor: [0, 0], focus: [2, 0],
      rule: { condition: { kind: DataValidationKind.Dropdown, options: [{ label: 'Ready' }] },
        inputPolicy: DataValidationInputPolicy.Reject },
    });
    expect(editor.queries.run(ReadDataValidationRulesQuery, void 0)).toHaveLength(1);
    expect(editor.commands.run(ExportSheetStateCommand, void 0).sheetState.dataValidations?.getRules()).toHaveLength(1);
    expect(editor.services.require(DataValidationEvaluatorRegistryCapability)).toBeDefined();
    expect(() => editor.services.require(DataValidationEvaluatorRegistryCapability)
      .register(DataValidationKind.Person, () => true)).toThrow('editor.commands.run');
    editor.commands.run(UndoSheetCommand, void 0);
    expect(editor.queries.run(ReadDataValidationRulesQuery, void 0)).toHaveLength(0);
    editor.destroy();
  });

  it('BUG-628 shows formatted source dates as dropdown choices and accepts their visible text', () => {
    const state = createSheetState({ size: 3 });
    state.sheetData.addItem(0, 0, { type: CellType.Number, value: 45200 });
    state.sheetData.addItem(0, 1, { type: CellType.Number, value: 45200 });
    state.cellFormats.addItem(0, 0, { kind: 'date' });
    const editor = createSheetEditor({ sheetState: state,
      embeddedEditor: new FakeSheetEmbeddedEditor(), adapters: createHeadlessAdapters() });
    editor.commands.run(SetDataValidationRuleCommand, {
      anchor: [0, 1], focus: [0, 1],
      rule: { condition: { kind: DataValidationKind.Dropdown,
        sourceRange: { start: [0, 0], end: [0, 0] } },
      inputPolicy: DataValidationInputPolicy.Reject },
    });
    expect(editor.queries.run(ReadDataValidationIssueQuery, [0, 1])).toBeNull();
    const picker = editor.queries.run(ReadDropdownCellQuery, { row: 0, column: 1 });
    expect(picker?.options.map((option) => option.label)).toEqual(['2023-10-1']);
    editor.commands.run(PickDropdownOptionCommand, { row: 0, column: 1, label: '2023-10-1' });
    expect(editor.queries.run(ReadSheetCellDataQuery, void 0).getItem(0, 1))
      .toMatchObject({ type: CellType.String, value: '2023-10-1' });
    expect(editor.queries.run(ReadDataValidationIssueQuery, [0, 1])).toBeNull();
    editor.destroy();
  });

  it('BUG-631 commits typed checkbox validation choices as boolean cells', () => {
    const editor = createSheetEditor({ sheetState: createSheetState(),
      embeddedEditor: new FakeSheetEmbeddedEditor(), adapters: createHeadlessAdapters() });
    editor.commands.run(SetDataValidationRuleCommand, {
      anchor: [0, 0], focus: [0, 0],
      rule: { condition: { kind: DataValidationKind.Checkbox },
        inputPolicy: DataValidationInputPolicy.Reject },
    });
    editor.commands.run(SelectRangeCommand, { anchor: [0, 0], focus: [0, 0] });
    editor.commands.run(HandleDocumentInputCommand, { kind: 'text', text: 'TRUE' });
    editor.commands.run(CommitCellEditCommand, void 0);
    expect(editor.queries.run(ReadSheetCellDataQuery, void 0).getItem(0, 0))
      .toMatchObject({ type: CheckboxCellType, value: true });
    expect(editor.queries.run(ReadDataValidationIssueQuery, [0, 0])).toBeNull();
    editor.commands.run(HandleDocumentInputCommand, { kind: 'text', text: 'FALSE' });
    editor.commands.run(CommitCellEditCommand, void 0);
    expect(editor.queries.run(ReadSheetCellDataQuery, void 0).getItem(0, 0))
      .toMatchObject({ type: CheckboxCellType, value: false });
    editor.destroy();
  });

  it('BUG-472 assembles identity validation and commits all 18 digits as text', () => {
    const editor = createSheetEditor({ sheetState: createSheetState(),
      embeddedEditor: new FakeSheetEmbeddedEditor(), adapters: createHeadlessAdapters() });
    editor.commands.run(SetDataValidationRuleCommand, {
      anchor: [0, 0], focus: [0, 0],
      rule: { condition: { kind: DataValidationKind.IdentityCard },
        inputPolicy: DataValidationInputPolicy.Reject },
    });
    editor.commands.run(SelectRangeCommand, { anchor: [0, 0], focus: [0, 0] });
    editor.commands.run(HandleDocumentInputCommand, { kind: 'text', text: '110105194912310011' });
    editor.commands.run(CommitCellEditCommand, void 0);

    expect(editor.queries.run(ReadSheetCellDataQuery, void 0).getItem(0, 0))
      .toMatchObject({ type: CellType.String, value: '110105194912310011' });
    expect(editor.queries.run(ReadDataValidationIssueQuery, [0, 0])).toBeNull();
    editor.destroy();
  });

  it('rejects invalid edits and publishes warnings for allowed invalid edits', () => {
    const editor = createSheetEditor({ sheetState: createSheetState(),
      embeddedEditor: new FakeSheetEmbeddedEditor(), adapters: createHeadlessAdapters() });
    editor.commands.run(SetDataValidationRuleCommand, {
      anchor: [0, 0], focus: [0, 0],
      rule: { condition: { kind: DataValidationKind.Number }, inputPolicy: DataValidationInputPolicy.Reject },
    });
    editor.commands.run(SelectRangeCommand, { anchor: [0, 0], focus: [0, 0] });
    editor.commands.run(HandleDocumentInputCommand, { kind: 'text', text: 'invalid' });
    editor.commands.run(CommitCellEditCommand, void 0);
    expect(editor.commands.run(ExportSheetStateCommand, void 0).sheetState.sheetData.getItem(0, 0)).toBeNull();
    editor.commands.run(CancelCellEditCommand, void 0);

    const id = editor.queries.run(ReadDataValidationRulesQuery, void 0)[0]!.rule.id;
    editor.commands.run(SetDataValidationRuleCommand, {
      id, anchor: [0, 0], focus: [0, 0],
      rule: { condition: { kind: DataValidationKind.Number }, inputPolicy: DataValidationInputPolicy.Warn },
    });
    const warning = jest.fn();
    const dispose = editor.observations.subscribe(DataValidationWarningObservation, warning);
    editor.commands.run(HandleDocumentInputCommand, { kind: 'text', text: 'invalid' });
    editor.commands.run(CommitCellEditCommand, void 0);
    expect(editor.commands.run(ExportSheetStateCommand, void 0).sheetState.sheetData.getItem(0, 0)).not.toBeNull();
    expect(warning).toHaveBeenCalledWith(expect.objectContaining({ row: 0, column: 0, ruleId: id }));
    dispose();
    editor.destroy();
  });


  it('clears every rule when multiple rules share one highlight anchor', () => {
    const editor = createSheetEditor({ sheetState: createSheetState({ size: 3 }), adapters: createHeadlessAdapters() });
    for (const kind of [CellHighlightKind.Empty, CellHighlightKind.NotEmpty]) {
      editor.commands.run(AddCellHighlightRuleCommand, {
        anchor: [0, 0], focus: [1, 1], condition: { kind }, style: CellHighlightStyle.RedFill,
      });
    }
    expect(editor.queries.run(ReadCellHighlightRulesQuery, void 0)).toHaveLength(2);
    editor.commands.run(ClearCellHighlightRulesCommand, {});
    expect(editor.queries.run(ReadCellHighlightRulesQuery, void 0)).toHaveLength(0);
    editor.destroy();
  });

  it('BUG-438 updates a highlight rule across anchors and restores both anchors on undo', () => {
    const editor = createSheetEditor({ sheetState: createSheetState({ size: 5 }), adapters: createHeadlessAdapters() });
    editor.commands.run(AddCellHighlightRuleCommand, {
      anchor: [1, 1], focus: [2, 1],
      condition: { kind: CellHighlightKind.Value, operator: CellHighlightValueOperator.Greater, value: '5' },
      style: CellHighlightStyle.RedFill,
    });
    editor.commands.run(AddCellHighlightRuleCommand, {
      anchor: [1, 1], focus: [2, 1], condition: { kind: CellHighlightKind.Empty }, style: CellHighlightStyle.RedFill,
    });
    const before = editor.queries.run(ReadCellHighlightRulesQuery, void 0);
    const id = before[0]!.rule.id;
    const priority = before[0]!.rule.priority;

    editor.commands.run(UpdateCellHighlightRuleCommand, {
      id, anchor: [2, 2], focus: [3, 2],
      condition: { kind: CellHighlightKind.Value, operator: CellHighlightValueOperator.Greater, value: '15' },
      style: CellHighlightStyle.GreenFill,
    });
    expect(editor.queries.run(ReadCellHighlightRulesQuery, void 0)).toMatchObject([
      { row: 2, column: 2, rule: { id, priority, endRow: 3, endColumn: 2,
        condition: { value: '15' }, style: CellHighlightStyle.GreenFill } },
      { row: 1, column: 1, rule: { condition: { kind: CellHighlightKind.Empty } } },
    ]);
    editor.commands.run(UndoSheetCommand, void 0);
    expect(editor.queries.run(ReadCellHighlightRulesQuery, void 0)).toMatchObject([
      { row: 1, column: 1, rule: { id, endRow: 2, endColumn: 1,
        condition: { value: '5' }, style: CellHighlightStyle.RedFill } },
      { row: 1, column: 1, rule: { condition: { kind: CellHighlightKind.Empty } } },
    ]);
    editor.commands.run(RedoSheetCommand, void 0);
    expect(editor.queries.run(ReadCellHighlightRulesQuery, void 0).find(({ rule }) => rule.id === id))
      .toMatchObject({ row: 2, column: 2, rule: { endRow: 3, endColumn: 2, style: CellHighlightStyle.GreenFill } });
    editor.destroy();
  });

  it('moves a highlight range with its selected cells and restores it on undo', () => {
    const state = createSheetState({ size: 4 });
    state.sheetData.addItem(0, 0, { type: 'number', value: 10 });
    const editor = createSheetEditor({ sheetState: state, adapters: createHeadlessAdapters() });
    editor.commands.run(AddCellHighlightRuleCommand, {
      anchor: [0, 0], focus: [1, 1],
      condition: { kind: CellHighlightKind.Value, operator: CellHighlightValueOperator.Greater, value: '5' },
      style: CellHighlightStyle.RedFill,
    });
    editor.commands.run(MoveSheetRangeCommand, { source: { start: [0, 0], end: [1, 1] }, target: [2, 2] });
    expect(editor.queries.run(ReadCellHighlightRulesQuery, void 0)).toMatchObject([
      { row: 2, column: 2, rule: { endRow: 3, endColumn: 3 } },
    ]);
    editor.commands.run(UndoSheetCommand, void 0);
    expect(editor.queries.run(ReadCellHighlightRulesQuery, void 0)).toMatchObject([
      { row: 0, column: 0, rule: { endRow: 1, endColumn: 1 } },
    ]);
    editor.destroy();
  });

  it('splits a partially moved highlight rule and restores its identity on undo', () => {
    const state = createSheetState({ size: 6 });
    state.cellHighlights.setItem(0, 0, [{
      id: 'source-rule', priority: 1, endRow: 2, endColumn: 2,
      condition: { kind: CellHighlightKind.NotEmpty }, style: CellHighlightStyle.RedFill,
    }]);
    const editor = createSheetEditor({ sheetState: state, adapters: createHeadlessAdapters() });
    const input = { source: { start: [1, 1], end: [2, 2] }, target: [3, 3] } as const;
    expect(editor.queries.run(AnalyzeSheetRangeMove, input).status).toBe(SheetRangeMoveStatus.Allowed);

    editor.commands.run(MoveSheetRangeCommand, input);
    const moved = editor.commands.run(ExportSheetStateCommand, void 0).sheetState.cellHighlights;
    expect(moved.findRules(1, 1)).toHaveLength(0);
    expect(moved.findRules(0, 1)).toHaveLength(1);
    expect(moved.findRules(1, 0)).toHaveLength(1);
    expect(moved.findRules(3, 3)).toHaveLength(1);
    const ids = moved.getRules().map(({ rule }) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);

    editor.commands.run(UndoSheetCommand, void 0);
    expect(editor.commands.run(ExportSheetStateCommand, void 0).sheetState.cellHighlights.getRules()).toMatchObject([
      { row: 0, column: 0, rule: { id: 'source-rule', endRow: 2, endColumn: 2 } },
    ]);
    editor.commands.run(RedoSheetCommand, void 0);
    expect(editor.commands.run(ExportSheetStateCommand, void 0).sheetState.cellHighlights.findRules(3, 3)).toHaveLength(1);
    editor.destroy();
  });

  it('requires confirmation for target rules and preserves their uncovered portions', () => {
    const state = createSheetState({ size: 6 });
    const condition = { kind: CellHighlightKind.NotEmpty } as const;
    state.cellHighlights.setItem(0, 0, [{
      id: 'source-rule', priority: 1, endRow: 1, endColumn: 1,
      condition, style: CellHighlightStyle.YellowFill,
    }]);
    state.cellHighlights.setItem(2, 2, [{
      id: 'target-rule', priority: 2, endRow: 4, endColumn: 4,
      condition, style: CellHighlightStyle.RedFill,
    }]);
    const editor = createSheetEditor({ sheetState: state, adapters: createHeadlessAdapters() });
    const input = { source: { start: [0, 0], end: [1, 1] }, target: [2, 2] } as const;
    expect(editor.queries.run(AnalyzeSheetRangeMove, input).status).toBe(SheetRangeMoveStatus.RequiresConfirmation);
    expect(() => editor.commands.run(MoveSheetRangeCommand, input)).toThrow('destination contains');
    editor.commands.run(MoveSheetRangeCommand, { ...input, overwrite: true });

    const moved = editor.commands.run(ExportSheetStateCommand, void 0).sheetState.cellHighlights;
    expect(moved.findRules(0, 0)).toHaveLength(0);
    expect(moved.findRules(2, 2).map(({ rule }) => rule.id)).toEqual(['source-rule']);
    expect(moved.findRules(2, 4).map(({ rule }) => rule.style)).toEqual([CellHighlightStyle.RedFill]);
    expect(moved.findRules(4, 2).map(({ rule }) => rule.id)).toEqual(['target-rule']);
    const ids = moved.getRules().map(({ rule }) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
    editor.commands.run(UndoSheetCommand, void 0);
    expect(editor.commands.run(ExportSheetStateCommand, void 0).sheetState.cellHighlights.getRules()).toHaveLength(2);
    editor.destroy();
  });

  it('confirms and clears destination rules when the source has no highlight rule', () => {
    const state = createSheetState({ size: 5 });
    state.cellHighlights.setItem(2, 2, [{
      id: 'target-rule', priority: 1, endRow: 3, endColumn: 3,
      condition: { kind: CellHighlightKind.NotEmpty }, style: CellHighlightStyle.RedFill,
    }]);
    const editor = createSheetEditor({ sheetState: state, adapters: createHeadlessAdapters() });
    const input = { source: { start: [0, 0], end: [1, 1] }, target: [2, 2] } as const;
    expect(editor.queries.run(AnalyzeSheetRangeMove, input).status).toBe(SheetRangeMoveStatus.RequiresConfirmation);
    editor.commands.run(MoveSheetRangeCommand, { ...input, overwrite: true });
    expect(editor.commands.run(ExportSheetStateCommand, void 0).sheetState.cellHighlights.getRules()).toHaveLength(0);
    editor.destroy();
  });

  it('trims a destination rule whose anchor lies outside the overwritten range', () => {
    const state = createSheetState({ size: 6 });
    state.cellHighlights.setItem(1, 3, [{
      id: 'target-rule', priority: 1, endRow: 4, endColumn: 4,
      condition: { kind: CellHighlightKind.NotEmpty }, style: CellHighlightStyle.RedFill,
    }]);
    const editor = createSheetEditor({ sheetState: state, adapters: createHeadlessAdapters() });
    const input = { source: { start: [0, 0], end: [1, 1] }, target: [2, 2] } as const;
    expect(editor.queries.run(AnalyzeSheetRangeMove, input).status).toBe(SheetRangeMoveStatus.RequiresConfirmation);
    editor.commands.run(MoveSheetRangeCommand, { ...input, overwrite: true });
    const moved = editor.commands.run(ExportSheetStateCommand, void 0).sheetState.cellHighlights;
    expect(moved.findRules(2, 3)).toHaveLength(0);
    expect(moved.findRules(2, 4)).toHaveLength(1);
    expect(moved.findRules(1, 3)).toHaveLength(1);
    editor.destroy();
  });

  it('initializes an injected embedded editor and disposes it with the local Sheet runtime', () => {
    let editorContainer: Container | undefined;
    const embeddedEditor = new FakeSheetEmbeddedEditor();
    let isCommandExecuting: (() => boolean) | undefined;
    const initialize = embeddedEditor.initialize.bind(embeddedEditor);
    jest.spyOn(embeddedEditor, 'initialize').mockImplementation((context) => {
      isCommandExecuting = context.isCommandExecuting;
      initialize(context);
    });
    const editor = createSheetEditor({
      sheetState: createSheetState(),
      embeddedEditor,
      adapters: {
        ...createHeadlessAdapters(),
        registerEnvironment: (container) => {
          editorContainer = container;
        },
      },
    });

    expect(embeddedEditor.initializeCount).toBe(1);
    expect(isCommandExecuting?.()).toBe(false);
    expect(editorContainer!.resolve(SheetEmbeddedEditor.symbol)).toBe(embeddedEditor);
    expect(editor.services.require(SheetRuntimeCapability.EmbeddedEditor)).toEqual({
      editor: embeddedEditor,
    });

    editor.destroy();
    editor.destroy();
    expect(embeddedEditor.disposeCount).toBe(1);
  });

  it('isolates two live editor containers and destroying one does not affect the other', () => {
    let firstContainer: Container | undefined;
    let secondContainer: Container | undefined;
    const first = createSheetEditor({
      sheetState: createSheetState(),
      adapters: {
        ...createHeadlessAdapters(),
        registerEnvironment: (container) => {
          firstContainer = container;
        },
      },
    });
    const second = createSheetEditor({
      sheetState: createSheetState(),
      adapters: {
        ...createHeadlessAdapters(),
        registerEnvironment: (container) => {
          secondContainer = container;
        },
      },
    });

    expect(firstContainer).toBeDefined();
    expect(secondContainer).toBeDefined();
    expect(firstContainer).not.toBe(secondContainer);
    expect(firstContainer!.resolve(SearCoreSheet.symbol)).not.toBe(secondContainer!.resolve(SearCoreSheet.symbol));
    expect(firstContainer!.resolve(SessionStateRegistry.symbol)).not.toBe(
      secondContainer!.resolve(SessionStateRegistry.symbol),
    );
    expect(first.services.require(SheetRuntimeCapability.Toolbar)).toBe(
      firstContainer!.resolve(SearToolbar.symbol),
    );
    expect(first.services.require(SheetRuntimeCapability.Toolbar)).not.toBe(
      second.services.require(SheetRuntimeCapability.Toolbar),
    );
    expect(first.services.require(SheetRuntimeCapability.Events).engine).toBe(
      firstContainer!.resolve(EventEngine.symbol),
    );
    expect(first.services.require(SheetRuntimeCapability.Events).engine).toBe(
      firstContainer!.resolve<SearCoreSheet>(SearCoreSheet.symbol).eventEngine,
    );
    expect(first.services.require(SheetRuntimeCapability.Collaboration).session).not.toBe(
      second.services.require(SheetRuntimeCapability.Collaboration).session,
    );

    first.commands.run(SelectRangeCommand, { anchor: [0, 0], focus: [0, 0] });
    second.commands.run(SelectRangeCommand, { anchor: [1, 1], focus: [1, 1] });
    first.destroy();

    expect(() => first.services.require(SheetRuntimeCapability.Toolbar)).toThrow(
      'Runtime capability registry for SheetEditor has been destroyed.',
    );

    second.commands.run(SetSheetZoomCommand, 1.2);
    expect(
      readSessionState(
        second.commands.run(CaptureSheetSessionStateCommand, void 0).sessionState,
        SheetZoomSessionStateDefinition,
      ),
    ).toBe(1.2);
    expect(second.commands.run(ExportSheetStateCommand, void 0).sheetState.sheetData.shape).toEqual([2, 2]);
    second.destroy();
  });

  it('restores sheet session state and keeps undo history sheet-local across remounts', () => {
    const original = createSheetState();
    const cell = { type: CellType.String, value: 'Sheet A' };
    original.sheetData.addItem(0, 0, cell);
    const firstMount = createSheetEditor({ sheetState: original, adapters: createHeadlessAdapters() });

    firstMount.commands.run(ClearRangeContentsCommand, { anchor: [0, 0], focus: [0, 0] });
    firstMount.commands.run(SelectRangeCommand, { anchor: [1, 0], focus: [1, 1] });
    firstMount.commands.run(SetSheetZoomCommand, 1.2);
    firstMount.commands.run(ScrollViewportToCommand, { x: 10, y: 12 });
    const documentState = firstMount.commands.run(ExportSheetStateCommand, void 0).sheetState;
    const sessionState = firstMount.commands.run(CaptureSheetSessionStateCommand, void 0).sessionState;
    firstMount.destroy();

    const otherSheet = createSheetEditor({ sheetState: createSheetState(), adapters: createHeadlessAdapters() });
    expect(otherSheet.observations.getSnapshot(SheetHistoryStatusObservation)).toEqual({
      canUndo: false,
      canRedo: false,
    });
    otherSheet.destroy();

    const remounted = createSheetEditor({
      sheetState: documentState,
      sessionState,
      adapters: createHeadlessAdapters(),
    });
    const restored = remounted.commands.run(CaptureSheetSessionStateCommand, void 0).sessionState;
    expect(readSessionState(restored, SheetSelectionSessionStateDefinition)?.[1].shape).toEqual([
      [1, 0],
      [1, 1],
    ]);
    expect(readSessionState(restored, SheetViewportSessionStateDefinition)).toEqual(
      readSessionState(sessionState, SheetViewportSessionStateDefinition),
    );
    expect(readSessionState(restored, SheetZoomSessionStateDefinition)).toBe(1.2);
    expect(remounted.observations.getSnapshot(SheetHistoryStatusObservation)).toEqual({
      canUndo: true,
      canRedo: false,
    });

    remounted.commands.run(UndoSheetCommand, void 0);
    expect(remounted.commands.run(ExportSheetStateCommand, void 0).sheetState.sheetData.getItem(0, 0)).toEqual(cell);
    remounted.destroy();
  });

  it('captures built-in and third-party contributors in one snapshot and preserves unclaimed state', () => {
    let firstContainer: Container | undefined;
    const first = createSheetEditor({
      sheetState: createSheetState(),
      plugins: [ThirdPartySessionPlugin],
      adapters: {
        ...createHeadlessAdapters(),
        registerEnvironment: (container) => {
          firstContainer = container;
        },
      },
    });
    firstContainer!.resolve<ThirdPartySessionPlugin>(ThirdPartySessionPlugin.symbol).setSession(true, 'row-4');
    const firstSession = first.commands.run(CaptureSheetSessionStateCommand, void 0).sessionState;
    expect(readSessionState(firstSession, thirdPartySessionState)).toEqual({ open: true, selectedId: 'row-4' });
    expect(Object.keys(firstSession).sort()).toEqual([
      'sheet.history',
      'sheet.selection',
      'sheet.selection.additional',
      'sheet.viewport',
      'sheet.zoom',
      'third-party.panel',
    ]);
    first.destroy();

    let secondContainer: Container | undefined;
    const second = createSheetEditor({
      sheetState: createSheetState(),
      sessionState: firstSession,
      plugins: [ThirdPartySessionPlugin],
      adapters: {
        ...createHeadlessAdapters(),
        registerEnvironment: (container) => {
          secondContainer = container;
        },
      },
    });
    expect(secondContainer!.resolve<ThirdPartySessionPlugin>(ThirdPartySessionPlugin.symbol).getSession()).toEqual({
      open: true,
      selectedId: 'row-4',
    });
    second.destroy();

    const withoutPlugin = createSheetEditor({
      sheetState: createSheetState(),
      sessionState: firstSession,
      adapters: createHeadlessAdapters(),
    });
    const unclaimedSession = withoutPlugin.commands.run(CaptureSheetSessionStateCommand, void 0).sessionState;
    expect(readSessionState(unclaimedSession, thirdPartySessionState)).toEqual({
      open: true,
      selectedId: 'row-4',
    });
    withoutPlugin.destroy();
  });

  it('installs configured default dimensions when the initial sparse matrices have none', () => {
    const sheetState = createSheetState({ includeDimensionDefaults: false });
    const editor = createSheetEditor({
      sheetState,
      adapters: {
        platform: HeadlessPlatform,
        createRenderContexts: () => ({
          renderContext: new HeadlessRenderContext(),
          offScreenRenderContext: new HeadlessOffScreenRenderContext(),
          hitRenderContext: new HeadlessHitRenderContext(),
        }),
        scroller: HeadlessScroller,
        eventRegistrar: HeadlessEventRegistrar,
        textInput: HeadlessTextInput,
        keyboardRouter: HeadlessKeyboardRouter,
        pointerCapture: HeadlessPointerCapture,
        cursorEngine: HeadlessCursorEngine,
        collabTransport: HeadlessCollabTransport,
        toolbar: HeadlessToolbar,
      },
    });

    const exported = editor.commands.run(ExportSheetStateCommand, void 0).sheetState;
    expect(exported.rowSizes.getDefaultValue()).toBe(24);
    expect(exported.columnSizes.getDefaultValue()).toBe(100);
    expect(sheetState.rowSizes.getDefaultValue()).toBeUndefined();
    editor.destroy();
  });

  it('allows plugins to add strategies', () => {
    let editorContainer: Container | undefined;
    const editor = createSheetEditor({
      sheetState: createSheetState({ includeHiddenOriginalSizes: true }),
      plugins: [StrategyPlugin, StrategyPluginAfter],
      adapters: {
        platform: HeadlessPlatform,
        createRenderContexts: () => ({
          renderContext: new HeadlessRenderContext(),
          offScreenRenderContext: new HeadlessOffScreenRenderContext(),
          hitRenderContext: new HeadlessHitRenderContext(),
        }),
        scroller: HeadlessScroller,
        eventRegistrar: HeadlessEventRegistrar,
        textInput: HeadlessTextInput,
        keyboardRouter: HeadlessKeyboardRouter,
        pointerCapture: HeadlessPointerCapture,
        cursorEngine: HeadlessCursorEngine,
        collabTransport: HeadlessCollabTransport,
        toolbar: HeadlessToolbar,
        registerEnvironment: (container) => {
          editorContainer = container;
        },
      },
    });

    const strategies = editorContainer!.resolve<RenderStrategyManager<CellProperties>>(RenderStrategyManager.symbol);
    expect(strategies.getStrategy(testStrategyToken)).toBe(testStrategy);
    expect(strategies.getStrategy(testStrategyTokenAfter)).toBe(testStrategy);
    editor.destroy();
  });

  it('exposes third-party plugin observations and tears host subscriptions down with the editor', () => {
    let editorContainer: Container | undefined;
    const editor = createSheetEditor({
      sheetState: createSheetState(),
      plugins: [ThirdPartyObservationPlugin],
      adapters: {
        platform: HeadlessPlatform,
        createRenderContexts: () => ({
          renderContext: new HeadlessRenderContext(),
          offScreenRenderContext: new HeadlessOffScreenRenderContext(),
          hitRenderContext: new HeadlessHitRenderContext(),
        }),
        scroller: HeadlessScroller,
        eventRegistrar: HeadlessEventRegistrar,
        textInput: HeadlessTextInput,
        keyboardRouter: HeadlessKeyboardRouter,
        pointerCapture: HeadlessPointerCapture,
        cursorEngine: HeadlessCursorEngine,
        collabTransport: HeadlessCollabTransport,
        toolbar: HeadlessToolbar,
        registerEnvironment: (container) => {
          editorContainer = container;
        },
      },
    });
    const plugin = editorContainer!.resolve<ThirdPartyObservationPlugin>(ThirdPartyObservationPlugin.symbol);
    const received: number[] = [];

    expect(editor.observations.getSnapshot(thirdPartyStatusObservation)).toBe(1);
    editor.observations.subscribe(thirdPartyStatusObservation, (value) => received.push(value));
    plugin.publish(2);

    expect(received).toEqual([1, 2]);
    expect(plugin.listenerCount).toBe(1);
    editor.destroy();
    expect(plugin.listenerCount).toBe(0);
    plugin.publish(3);
    expect(received).toEqual([1, 2]);
  });

  it('covers missing branches with all optional properties', () => {
    @Injectable()
    class EmptyPlugin extends SheetPlugin<null> {
      public static readonly symbol = Symbol.for('EmptyPlugin');
      public constructor() {
        super({ key: new PluginKey('Empty'), state: null });
      }
      public registerState() {
        return { key: this.key, state: null };
      }
      public getPluginConfig(): null {
        return null;
      }
      public apply(): null {
        return null;
      }
      public render(): null {
        return null;
      }
      // no configure, initialize, start, etc.
    }

    @Injectable()
    class FullPlugin extends SheetPlugin<null> {
      public static readonly symbol = Symbol.for('FullPlugin');
      public constructor() {
        super({ key: new PluginKey('Full'), state: null });
      }
      public registerState() {
        return { key: this.key, state: null };
      }
      public getPluginConfig(): null {
        return null;
      }
      public apply(): null {
        return null;
      }
      public render(): null {
        return null;
      }
      public initialize() {}
      public start() {}
      public onEditorDestroy() {}
      public static registerServices(context: any) {}
    }

    const editor = createSheetEditor({
      viewport: { width: 100, height: 100 },
      sheetState: createSheetState(),
      plugins: [EmptyPlugin, FullPlugin],
      adapters: {
        platform: HeadlessPlatform,
        createRenderContexts: () => ({
          renderContext: new HeadlessRenderContext(),
          offScreenRenderContext: new HeadlessOffScreenRenderContext(),
          hitRenderContext: new HeadlessHitRenderContext(),
        }),
        scroller: HeadlessScroller,
        eventRegistrar: HeadlessEventRegistrar,
        textInput: HeadlessTextInput,
        keyboardRouter: HeadlessKeyboardRouter,
        pointerCapture: HeadlessPointerCapture,
        cursorEngine: HeadlessCursorEngine,
        collabTransport: HeadlessCollabTransport,
        toolbar: HeadlessToolbar,
        registerEnvironment: jest.fn(),
      },
    });

    editor.destroy();
  });

  it('covers remaining branches (custom container, no plugins, multiple destroy, onCreated)', () => {
    const onCreated = jest.fn();
    let editorContainer: Container | undefined;
    const registerCellEditorServicesSpy = jest.spyOn(SheetCellEditorPlugin, 'registerServices');

    const editor = createSheetEditor({
      // no viewport, uses default
      sheetState: createSheetState(),
      // no plugins
      adapters: {
        platform: HeadlessPlatform,
        createRenderContexts: () => ({
          renderContext: new HeadlessRenderContext(),
          offScreenRenderContext: new HeadlessOffScreenRenderContext(),
          hitRenderContext: new HeadlessHitRenderContext(),
        }),
        scroller: HeadlessScroller,
        eventRegistrar: HeadlessEventRegistrar,
        textInput: HeadlessTextInput,
        keyboardRouter: HeadlessKeyboardRouter,
        pointerCapture: HeadlessPointerCapture,
        cursorEngine: HeadlessCursorEngine,
        collabTransport: HeadlessCollabTransport,
        toolbar: HeadlessToolbar,
        registerEnvironment: (container) => {
          editorContainer = container;
        },
      },
      onCreated,
    });

    expect(onCreated).toHaveBeenCalledWith(editor);
    expect(registerCellEditorServicesSpy).toHaveBeenCalled();
    expect(editor.commands).toBeDefined();
    expect(editor.observations).toBeDefined();
    expect(editor.commands.getRegisteredCommandIds()).toEqual(
      expect.arrayContaining([
        BeginCellEditCommand.id,
        CommitCellEditCommand.id,
        CancelCellEditCommand.id,
        HandleDocumentInputCommand.id,
        RequestCellEditorRenderCommand.id,
        UpdateCellEditorDocumentSelectionCommand.id,
        ApplyRemoteOperationsCommand.id,
        BeginSheetResizeDragCommand.id,
        ResizeSheetRowsCommand.id,
        UndoSheetCommand.id,
        RedoSheetCommand.id,
        SelectRangeCommand.id,
        EnsureSelectionVisibleCommand.id,
        ApplyViewportScrollCommand.id,
        ScrollViewportToCommand.id,
        SetSheetZoomCommand.id,
      ]),
    );
    editor.commands.run(SetSheetZoomCommand, 1.2);
    expect(editorContainer!.resolve<SheetZoomPlugin>(SheetZoomPlugin.symbol).getScale()).toBe(1.2);
    editor.commands.run(ScrollViewportToCommand, { x: 10, y: 12 });
    const scrollManager = editorContainer!.resolve<SearCoreSheet>(SearCoreSheet.symbol).renderEngine.scrollManager;
    const commandIds: string[] = [];
    const stopObserving = editor.commands.subscribe((event) => commandIds.push(event.id));
    scrollManager.addPublisher((_manager, update) => {
      update({ x: 0, y: 0, deltaX: 0, deltaY: 0 });
      return () => void 0;
    });
    expect(commandIds).toContain(ApplyViewportScrollCommand.id);
    stopObserving();
    expect(
      scrollManager.getState(),
    ).toMatchObject({
      x: 10,
      y: 12,
    });
    registerCellEditorServicesSpy.mockRestore();
    editor.commands.run(SelectRangeCommand, { anchor: [0, 0], focus: [1, 1] });
    expect(
      editorContainer!.resolve<SheetSelectionPlugin>(SheetSelectionPlugin.symbol).getState()[0].getPoint(1),
    ).toEqual([1, 1]);
    editor.destroy();
    editor.destroy(); // covers if (destroyed) return;
  });

  it('binds formula result invalidation to the assembled grid render request', () => {
    let editorContainer: Container | undefined;
    const invalidate = defineSheetCommand<readonly number[]>('test.formula.invalidate');
    const editor = createSheetEditor({
      sheetState: createSheetState(),
      adapters: {
        platform: HeadlessPlatform,
        createRenderContexts: () => ({
          renderContext: new HeadlessRenderContext(),
          offScreenRenderContext: new HeadlessOffScreenRenderContext(),
          hitRenderContext: new HeadlessHitRenderContext(),
        }),
        scroller: HeadlessScroller,
        eventRegistrar: HeadlessEventRegistrar,
        textInput: HeadlessTextInput,
        keyboardRouter: HeadlessKeyboardRouter,
        pointerCapture: HeadlessPointerCapture,
        cursorEngine: HeadlessCursorEngine,
        collabTransport: HeadlessCollabTransport,
        toolbar: HeadlessToolbar,
        registerEnvironment: (container) => {
          editorContainer = container;
        },
      },
      onCreated: ({ commands }) => commands.register(invalidate, (keys) =>
        new LocalActionCommand(invalidate.id, () => editorContainer!
          .resolve<FormulaRenderInvalidator>(FormulaRenderInvalidator.symbol).invalidateFormulaResults(keys))),
    });
    const core = editorContainer!.resolve<SearCoreSheet>(SearCoreSheet.symbol);
    const requestRender = jest.spyOn(core, 'requestRender');
    const executePipeline = jest.spyOn(core, 'executePipeline');
    const invalidator = editorContainer!.resolve<FormulaRenderInvalidator>(FormulaRenderInvalidator.symbol);

    editor.commands.run(invalidate, [0]);

    expect(requestRender).toHaveBeenCalledTimes(1);
    expect(requestRender.mock.calls[0][0].key.key).toBe('SheetGrid$');
    expect(executePipeline).toHaveBeenCalledTimes(1);
    expect(executePipeline.mock.calls[0][0].steps.map((step) => step.kind)).toEqual([PipelineStepKind.Render]);

    editor.commands.run(ToggleMergeCellsCommand, { anchor: [0, 0], focus: [0, 1] });
    requestRender.mockClear();
    executePipeline.mockClear();
    editor.commands.run(invalidate, [0]);
    expect(requestRender).not.toHaveBeenCalled();
    expect(executePipeline.mock.calls[0][0].steps.map((step) => step.renderPluginKey?.key)).toEqual([
      'SheetGrid$', 'SheetCellMergeRender$',
    ]);

    editor.destroy();
    requestRender.mockClear();
    invalidator.invalidateFormulaResults([1]);
    expect(requestRender).not.toHaveBeenCalled();
  });

  it('updates another cell in a duplicate rule when a formula display value changes', () => {
    const state = createSheetState({ size: 3 });
    state.sheetData.addItem(0, 0, { type: CellType.String, value: 'same' });
    state.sheetData.addItem(1, 0, { type: CellType.Formula, formula: '=A1' });
    let editorContainer: Container | undefined;
    const setTestResult = defineSheetCommand<string>('test.formula.setResult');
    const publishTestResult = defineSheetCommand<void>('test.formula.publishResult');
    const invalidateTestResult = defineSheetCommand<void>('test.formula.invalidateResult');
    const editor = createSheetEditor({
      sheetState: state,
      adapters: {
        ...createHeadlessAdapters(),
        registerEnvironment: (container) => { editorContainer = container; },
      },
      onCreated: ({ commands }) => {
        commands.register(setTestResult, (value) => new LocalActionCommand(setTestResult.id, () =>
          editorContainer!.resolve<FormulaResultStore>(FormulaResultStore.symbol).set(cellKey(1, 0), value)));
        commands.register(publishTestResult, () => new LocalActionCommand(publishTestResult.id, () =>
          editorContainer!.resolve<SheetDisplayedValueChanges>(SheetDisplayedValueChanges.symbol)
            .publish([{ row: 1, column: 0 }])));
        commands.register(invalidateTestResult, () => new LocalActionCommand(invalidateTestResult.id, () =>
          editorContainer!.resolve<FormulaRenderInvalidator>(FormulaRenderInvalidator.symbol)
            .invalidateFormulaResults([cellKey(1, 0)])));
      },
    });
    const visualReaders = editor.services.require(SheetRuntimeCapability.Render).cellVisualReaders;
    editor.commands.run(AddCellHighlightRuleCommand, {
      anchor: [0, 0], focus: [1, 0],
      condition: { kind: CellHighlightKind.Duplicate }, style: CellHighlightStyle.RedFill,
    });
    const changes = editorContainer!.resolve<SheetDisplayedValueChanges>(SheetDisplayedValueChanges.symbol);
    const received = jest.fn();
    const listenerAuthority: boolean[] = [];
    const unsubscribe = changes.subscribe(received);
    changes.subscribe(() => listenerAuthority.push(editor.commands.isExecuting()));
    editor.commands.run(setTestResult, 'other');
    editor.commands.run(publishTestResult, void 0);
    expect(visualReaders.read({ rowIndex: 0, columnIndex: 0 }).fill).toBeUndefined();

    editor.commands.run(setTestResult, 'same');
    editor.commands.run(invalidateTestResult, void 0);
    expect(received).toHaveBeenLastCalledWith([{ row: 1, column: 0 }]);
    expect(listenerAuthority).toEqual([false, false]);
    expect(visualReaders.read({ rowIndex: 0, columnIndex: 0 }).fill).toBe('#FBC8CF');
    unsubscribe();
    editor.destroy();
  });

  it('rejects retained formula dependency and aggregate cache writes outside commands', () => {
    let editorContainer: Container | undefined;
    const updateDerivedState = defineSheetCommand<void>('test.formula.updateDerivedState');
    const editor = createSheetEditor({
      sheetState: createSheetState(),
      adapters: {
        ...createHeadlessAdapters(),
        registerEnvironment: (container) => { editorContainer = container; },
      },
      onCreated: ({ commands }) => commands.register(updateDerivedState, () =>
        new LocalActionCommand(updateDerivedState.id, () => {
          const graph = editorContainer!.resolve<IDependencyGraph>(IDependencyGraph.symbol);
          const aggregates = editorContainer!.resolve<IAggregationCache>(IAggregationCache.symbol);
          graph.updateCell(cellKey(0, 0), []);
          aggregates.setSum(0, 0, 0, 0, 1);
        })),
    });
    const graph = editorContainer!.resolve<IDependencyGraph>(IDependencyGraph.symbol);
    const aggregates = editorContainer!.resolve<IAggregationCache>(IAggregationCache.symbol);
    const scheduler = editorContainer!.resolve<RecalcScheduler>(RecalcScheduler.symbol) as unknown as {
      schedule(): void;
      runBatch(): void;
      flushResults(results: unknown[], context: unknown): void;
    };
    const key = cellKey(0, 0);
    expect(() => graph.updateCell(key, [])).toThrow('editor.commands.run');
    expect(() => graph.markDirty([key])).toThrow('editor.commands.run');
    expect(() => aggregates.setSum(0, 0, 0, 0, 1)).toThrow('editor.commands.run');
    expect(() => aggregates.clear()).toThrow('editor.commands.run');
    expect(() => scheduler.schedule()).toThrow('editor.commands.run');
    expect(() => scheduler.runBatch()).toThrow('editor.commands.run');
    expect(() => scheduler.flushResults([], {})).toThrow('editor.commands.run');

    editor.commands.run(updateDerivedState, undefined);
    expect(graph.size).toBe(1);
    expect(aggregates.getSum(0, 0, 0, 0)).toBe(1);
    editor.destroy();
  });

  it('exports the current sheet state through a formal cloned snapshot command', () => {
    const sheetState = createSheetState({ includeHiddenOriginalSizes: true });
    const rowHiddenOriginalSizes = sheetState.rowHiddenOriginalSizes;
    const columnHiddenOriginalSizes = sheetState.columnHiddenOriginalSizes;
    const cellMerges = sheetState.cellMerges;
    if (!rowHiddenOriginalSizes || !columnHiddenOriginalSizes) {
      throw new Error('Expected complete hidden and merge test state.');
    }
    const cell = { type: CellType.String, value: 'Hello' };
    sheetState.sheetData.addItem(0, 0, cell);
    sheetState.rowSizes.addItem(0, 0, 32);
    sheetState.columnSizes.addItem(0, 1, 144);
    sheetState.cellAlignments.addItem(1, 0, 'center');
    sheetState.fixedRows?.addItem(0, 1, true);
    rowHiddenOriginalSizes.addItem(0, 1, 28);
    columnHiddenOriginalSizes.addItem(0, 0, 96);
    cellMerges.setItem(0, 0, { endRow: 1, endColumn: 1 });
    const editor = createSheetEditor({
      sheetState,
      adapters: {
        platform: HeadlessPlatform,
        createRenderContexts: () => ({
          renderContext: new HeadlessRenderContext(),
          offScreenRenderContext: new HeadlessOffScreenRenderContext(),
          hitRenderContext: new HeadlessHitRenderContext(),
        }),
        scroller: HeadlessScroller,
        eventRegistrar: HeadlessEventRegistrar,
        textInput: HeadlessTextInput,
        keyboardRouter: HeadlessKeyboardRouter,
        pointerCapture: HeadlessPointerCapture,
        cursorEngine: HeadlessCursorEngine,
        collabTransport: HeadlessCollabTransport,
        toolbar: HeadlessToolbar,
      },
    });

    const result = editor.commands.run(ExportSheetStateCommand, void 0);

    expect(editor.commands.has(ExportSheetStateCommand)).toBe(true);
    expect(result.sheetState.sheetData).not.toBe(sheetState.sheetData);
    expect(result.sheetState.rowSizes).not.toBe(sheetState.rowSizes);
    expect(result.sheetState.columnSizes).not.toBe(sheetState.columnSizes);
    expect(result.sheetState.cellAlignments).not.toBe(sheetState.cellAlignments);
    expect(result.sheetState.fixedRows).not.toBe(sheetState.fixedRows);
    expect(result.sheetState.rowHiddenOriginalSizes).not.toBe(rowHiddenOriginalSizes);
    expect(result.sheetState.columnHiddenOriginalSizes).not.toBe(columnHiddenOriginalSizes);
    expect(result.sheetState.cellMerges).not.toBe(cellMerges);
    expect(result.sheetState.sheetData.getItem(0, 0)).toEqual(cell);
    expect(result.sheetState.sheetData.getItem(0, 0)).not.toBe(cell);
    expect(result.sheetState.rowSizes.getItem(0, 0)).toBe(32);
    expect(result.sheetState.columnSizes.getItem(0, 1)).toBe(144);
    expect(result.sheetState.cellAlignments.getItem(1, 0)).toBe('center');
    expect(result.sheetState.fixedRows?.getItem(0, 1)).toBe(true);
    expect(result.sheetState.rowHiddenOriginalSizes?.getItem(0, 1)).toBe(28);
    expect(result.sheetState.columnHiddenOriginalSizes?.getItem(0, 0)).toBe(96);
    expect(result.sheetState.cellMerges.getItem(0, 0)).toEqual({ endRow: 1, endColumn: 1 });

    sheetState.sheetData.addItem(0, 0, { type: CellType.String, value: 'Changed' });
    sheetState.rowSizes.addItem(0, 0, 40);
    cellMerges.setItem(0, 0, { endRow: 0, endColumn: 1 });
    expect(result.sheetState.sheetData.getItem(0, 0)).toEqual(cell);
    expect(result.sheetState.rowSizes.getItem(0, 0)).toBe(32);
    expect(result.sheetState.cellMerges.getItem(0, 0)).toEqual({ endRow: 1, endColumn: 1 });
    editor.destroy();
  });

  it('persists borders with history, remount, row moves and atomic cell range moves', () => {
    const editor = createSheetEditor({ sheetState: createSheetState({ size: 4 }), adapters: createHeadlessAdapters() });
    const stroke = { color: '#256cfb', style: SheetBorderLineStyle.Double };
    const read = (row: number, column: number) => editor.queries.run(ReadSheetCellBorderQuery, { row, column });
    editor.commands.run(SetRangeCellBorderCommand, {
      anchor: [0, 0],
      focus: [0, 0],
      preset: SheetBorderPreset.All,
      stroke,
    });
    expect(read(0, 0)).toEqual({ top: stroke, bottom: stroke, left: stroke, right: stroke });
    editor.commands.run(UndoSheetCommand, undefined);
    expect(read(0, 0)).toBeNull();
    editor.commands.run(RedoSheetCommand, undefined);
    expect(read(0, 0)?.top).toEqual(stroke);
    editor.commands.run(MoveRowsCommand, { index: 0, before: 3 });
    expect(read(0, 0)).toBeNull();
    expect(read(2, 0)?.top).toEqual(stroke);
    editor.commands.run(MoveSheetRangeCommand, { source: { start: [2, 0], end: [2, 0] }, target: [3, 1] });
    expect(read(2, 0)).toBeNull();
    expect(read(3, 1)?.top).toEqual(stroke);
    editor.commands.run(UndoSheetCommand, undefined);
    expect(read(2, 0)?.top).toEqual(stroke);
    expect(read(3, 1)).toBeNull();
    const state = editor.commands.run(ExportSheetStateCommand, undefined).sheetState;
    expect(state.cellBorders).toBeInstanceOf(CellBorderMatrix);
    editor.destroy();
    const remount = createSheetEditor({ sheetState: state, adapters: createHeadlessAdapters() });
    expect(remount.queries.run(ReadSheetCellBorderQuery, { row: 2, column: 0 })?.top).toEqual(stroke);
    remount.destroy();
  });

  it('replays border changes and their inverses through collaborative owner operations', () => {
    let container: Container | undefined;
    const local = createSheetEditor({
      sheetState: createSheetState({ size: 4 }),
      adapters: {
        ...createHeadlessAdapters(),
        registerEnvironment: (value) => {
          container = value;
        },
      },
    });
    const remote = createSheetEditor({ sheetState: createSheetState({ size: 4 }), adapters: createHeadlessAdapters() });
    const plugins = container!.resolve<PluginManager<SearCoreSheet, CellProperties>>(PluginManager.symbol);
    const replay = (result: ReturnType<typeof local.commands.run>) => {
      result.pipeline.steps.forEach(({ transaction }) => {
        if (!transaction) return;
        const owner = plugins.getTransactionOTContribution(transaction);
        if (owner?.collaborative)
          remote.commands.run(ApplyRemoteOperationsCommand, {
            ownerId: owner.ownerId,
            operations: transaction.operations,
          });
      });
    };
    const stroke = { color: '#ff0000', style: SheetBorderLineStyle.Thick };
    replay(
      local.commands.run(SetRangeCellBorderCommand, {
        anchor: [1, 1],
        focus: [2, 2],
        preset: SheetBorderPreset.Outside,
        stroke,
      }),
    );
    expect(remote.queries.run(ReadSheetCellBorderQuery, { row: 1, column: 1 })).toEqual({ top: stroke, left: stroke });
    replay(local.commands.run(UndoSheetCommand, undefined));
    expect(remote.queries.run(ReadSheetCellBorderQuery, { row: 1, column: 1 })).toBeNull();
    replay(local.commands.run(RedoSheetCommand, undefined));
    expect(remote.queries.run(ReadSheetCellBorderQuery, { row: 1, column: 1 })?.top).toEqual(stroke);
    local.destroy();
    remote.destroy();
  });

  it('registers fixed-row commands and includes their result in exported document state', () => {
    const editor = createSheetEditor({ sheetState: createSheetState(), adapters: createHeadlessAdapters() });

    editor.commands.run(SetSheetRowsFixedCommand, { index: 0, count: 2, fixed: true });
    let fixedRows = editor.commands.run(ExportSheetStateCommand, void 0).sheetState.fixedRows;

    expect(editor.commands.has(SetSheetRowsFixedCommand)).toBe(true);
    expect(fixedRows?.getItem(0, 0)).toBe(true);
    expect(fixedRows?.getItem(0, 1)).toBe(true);
    editor.commands.run(UndoSheetCommand, void 0);
    fixedRows = editor.commands.run(ExportSheetStateCommand, void 0).sheetState.fixedRows;
    expect(fixedRows?.getItem(0, 0)).toBeNull();
    expect(fixedRows?.getItem(0, 1)).toBeNull();
    editor.commands.run(RedoSheetCommand, void 0);
    fixedRows = editor.commands.run(ExportSheetStateCommand, void 0).sheetState.fixedRows;
    expect(fixedRows?.getItem(0, 0)).toBe(true);
    expect(fixedRows?.getItem(0, 1)).toBe(true);
    editor.destroy();
  });

  it('undoes and redoes persisted cell, alignment, dimension, merge, and structure commands', () => {
    const sheetState = createSheetState({ includeHiddenOriginalSizes: true });
    const cell = { type: CellType.String, value: 'History' };
    sheetState.sheetData.addItem(0, 0, cell);
    const editor = createSheetEditor({
      sheetState,
      adapters: {
        platform: HeadlessPlatform,
        createRenderContexts: () => ({
          renderContext: new HeadlessRenderContext(),
          offScreenRenderContext: new HeadlessOffScreenRenderContext(),
          hitRenderContext: new HeadlessHitRenderContext(),
        }),
        scroller: HeadlessScroller,
        eventRegistrar: HeadlessEventRegistrar,
        textInput: HeadlessTextInput,
        keyboardRouter: HeadlessKeyboardRouter,
        pointerCapture: HeadlessPointerCapture,
        cursorEngine: HeadlessCursorEngine,
        collabTransport: HeadlessCollabTransport,
        toolbar: HeadlessToolbar,
      },
    });
    const exportState = () => editor.commands.run(ExportSheetStateCommand, void 0).sheetState;
    const historyStatus = () => editor.observations.getSnapshot(SheetHistoryStatusObservation);
    const historyStatuses: Array<{ canUndo: boolean; canRedo: boolean }> = [];
    const disposeHistory = editor.observations.subscribe(SheetHistoryStatusObservation, (status) =>
      historyStatuses.push(status),
    );

    expect(historyStatuses).toEqual([{ canUndo: false, canRedo: false }]);

    editor.commands.run(ClearRangeContentsCommand, { anchor: [0, 0], focus: [0, 0] });
    expect(exportState().sheetData.getItem(0, 0)).toBeNull();
    expect(historyStatus()).toEqual({ canUndo: true, canRedo: false });
    expect(historyStatuses.at(-1)).toEqual({ canUndo: true, canRedo: false });
    disposeHistory();
    disposeHistory();
    editor.commands.run(UndoSheetCommand, void 0);
    expect(exportState().sheetData.getItem(0, 0)).toEqual(cell);
    editor.commands.run(RedoSheetCommand, void 0);
    expect(exportState().sheetData.getItem(0, 0)).toBeNull();
    editor.commands.run(UndoSheetCommand, void 0);

    editor.commands.run(SetRangeAlignmentCommand, {
      anchor: [0, 0],
      focus: [0, 0],
      alignment: SheetHorizontalAlignment.Center,
    });
    expect(exportState().cellAlignments.getItem(0, 0)).toBe('center');
    editor.commands.run(UndoSheetCommand, void 0);
    expect(exportState().cellAlignments.getItem(0, 0)).toBe('left');

    editor.commands.run(ResizeSheetRowsCommand, { index: 0, size: 40 });
    expect(exportState().rowSizes.getItem(0, 0)).toBe(40);
    editor.commands.run(UndoSheetCommand, void 0);
    expect(exportState().rowSizes.getItem(0, 0)).toBe(24);

    editor.commands.run(ToggleMergeCellsCommand, { anchor: [0, 0], focus: [1, 1] });
    expect(exportState().cellMerges.getItem(0, 0)).toEqual({ endRow: 1, endColumn: 1 });
    editor.commands.run(UndoSheetCommand, void 0);
    expect(exportState().cellMerges.getItem(0, 0)).toBeNull();

    editor.commands.run(DeleteRowCommand, { index: 0 });
    expect(exportState().sheetData.shape[0]).toBe(1);
    editor.commands.run(UndoSheetCommand, void 0);
    expect(exportState().sheetData.shape[0]).toBe(2);
    expect(exportState().sheetData.getItem(0, 0)).toEqual(cell);

    editor.destroy();
  });
});

describe('default sheet sorting', () => {
  it('BUG-579 moves a validation rule with its row and restores it on undo', () => {
    const state = createSheetState({ size: 4 });
    for (const [row, name, number] of [
      [0, 'Name', 'Num'], [1, 'apple', 3], [2, 'banana', 1], [3, 'pear', 2],
    ] as const) {
      state.sheetData.addItem(row, 0, { type: CellType.String, value: name });
      state.sheetData.addItem(row, 1, { type: typeof number === 'number' ? CellType.Number : CellType.String, value: number });
    }
    state.cellFills.addItem(1, 1, '#bbffbb');
    const editor = createSheetEditor({ sheetState: state, adapters: createHeadlessAdapters() });
    const sort = (direction: SheetSortDirection) => editor.commands.run(SortSheetRangeCommand, {
      range: { start: [0, 0], end: [3, 1] }, firstRowIsHeader: true,
      keys: [{ column: 0, direction }],
    });
    const read = () => editor.commands.run(ExportSheetStateCommand, void 0).sheetState;
    try {
      sort(SheetSortDirection.Descending);
      expect(read().sheetData.getItem(3, 0)?.value).toBe('apple');
      editor.commands.run(SetDataValidationRuleCommand, {
        anchor: [3, 1], focus: [3, 1],
        rule: { condition: { kind: DataValidationKind.Number }, inputPolicy: DataValidationInputPolicy.Reject },
      });
      sort(SheetSortDirection.Ascending);
      expect(read().sheetData.getItem(1, 0)?.value).toBe('apple');
      expect(read().cellFills.getItem(1, 1)).toBe('#bbffbb');
      expect(read().dataValidations?.findRules(1, 1)).toHaveLength(1);
      expect(read().dataValidations?.findRules(3, 1)).toHaveLength(0);
      editor.commands.run(UndoSheetCommand, void 0);
      expect(read().sheetData.getItem(3, 0)?.value).toBe('apple');
      expect(read().dataValidations?.findRules(3, 1)).toHaveLength(1);
      expect(read().dataValidations?.findRules(1, 1)).toHaveLength(0);
    } finally {
      editor.destroy();
    }
  });

  it('moves values and independently owned fills atomically and supports undo', () => {
    const state = createSheetState({ size: 4 });
    state.sheetData.addItem(0, 0, { type: CellType.Number, value: 30 });
    state.sheetData.addItem(1, 0, { type: CellType.Number, value: 10 });
    state.sheetData.addItem(2, 0, { type: CellType.Number, value: 20 });
    state.sheetData.addItem(0, 1, { type: CellType.String, value: 'third' });
    state.sheetData.addItem(1, 1, { type: CellType.String, value: 'first' });
    state.sheetData.addItem(2, 1, { type: CellType.String, value: 'second' });
    state.cellFills.addItem(0, 1, '#ff0000');
    state.cellFills.addItem(1, 1, '#00ff00');
    state.cellFills.addItem(2, 1, '#0000ff');
    const editor = createSheetEditor({ sheetState: state, adapters: createHeadlessAdapters() });
    editor.commands.run(SortSheetRangeCommand, {
      range: { start: [0, 0], end: [2, 1] },
      keys: [{ column: 0, direction: SheetSortDirection.Ascending }],
    });
    const read = () => editor.commands.run(ExportSheetStateCommand, void 0).sheetState;
    expect([0, 1, 2].map((row) => read().sheetData.getItem(row, 1)?.value))
      .toEqual(['first', 'second', 'third']);
    expect([0, 1, 2].map((row) => read().cellFills.getItem(row, 1)))
      .toEqual(['#00ff00', '#0000ff', '#ff0000']);
    editor.commands.run(UndoSheetCommand, void 0);
    expect([0, 1, 2].map((row) => read().sheetData.getItem(row, 1)?.value))
      .toEqual(['third', 'first', 'second']);
    expect([0, 1, 2].map((row) => read().cellFills.getItem(row, 1)))
      .toEqual(['#ff0000', '#00ff00', '#0000ff']);
    editor.destroy();
  });

  it('rejects intersecting merged cells before changing any owner', () => {
    const state = createSheetState({ size: 4 });
    state.sheetData.addItem(0, 0, { type: CellType.Number, value: 2 });
    state.sheetData.addItem(2, 0, { type: CellType.Number, value: 1 });
    state.cellMerges.addItem(1, 1, { endRow: 1, endColumn: 2 });
    const editor = createSheetEditor({ sheetState: state, adapters: createHeadlessAdapters() });
    expect(() => editor.commands.run(SortSheetRangeCommand, {
      range: { start: [0, 0], end: [2, 2] },
      keys: [{ column: 0, direction: SheetSortDirection.Ascending }],
    })).toThrow('merged cells');
    expect(state.sheetData.getItem(0, 0)?.value).toBe(2);
    editor.destroy();
  });

  it('rebases relative formula references when formula cells move', () => {
    const state = createSheetState({ size: 3 });
    state.sheetData.addItem(0, 0, { type: CellType.Number, value: 2 });
    state.sheetData.addItem(1, 0, { type: CellType.Number, value: 1 });
    state.sheetData.addItem(0, 1, { type: CellType.Formula, formula: '=A1' });
    state.sheetData.addItem(1, 1, { type: CellType.Formula, formula: '=A2' });
    const editor = createSheetEditor({ sheetState: state, adapters: createHeadlessAdapters() });
    editor.commands.run(SortSheetRangeCommand, {
      range: { start: [0, 0], end: [1, 1] },
      keys: [{ column: 0, direction: SheetSortDirection.Ascending }],
    });
    const sorted = editor.commands.run(ExportSheetStateCommand, void 0).sheetState;
    expect(sorted.sheetData.getItem(0, 1)?.formula).toBe('=A1');
    expect(sorted.sheetData.getItem(1, 1)?.formula).toBe('=A2');
    editor.destroy();
  });

  it('sorts formulas with references above the first row and preserves reference errors', () => {
    const state = createSheetState({ size: 5 });
    state.sheetData.addItem(0, 0, { type: CellType.Number, value: 2 });
    state.sheetData.addItem(1, 0, { type: CellType.Number, value: 1 });
    state.sheetData.addItem(0, 1, { type: CellType.Formula, formula: '=A$1' });
    state.sheetData.addItem(1, 1, { type: CellType.Formula, formula: '=A1' });
    state.sheetData.addItem(1, 2, { type: CellType.Formula, formula: '=SUM(A1:A2)' });
    state.sheetData.addItem(1, 3, { type: CellType.Formula, formula: '=SUM(1:2)' });
    state.sheetData.addItem(1, 4, { type: CellType.Formula, formula: '=Sheet2!A1' });
    const editor = createSheetEditor({ sheetState: state, adapters: createHeadlessAdapters() });
    const sort = (direction: SheetSortDirection) => editor.commands.run(SortSheetRangeCommand, {
      range: { start: [0, 0], end: [1, 4] },
      keys: [{ column: 0, direction }],
    });
    const read = () => editor.commands.run(ExportSheetStateCommand, void 0).sheetState.sheetData;

    sort(SheetSortDirection.Ascending);
    expect([1, 2, 3, 4].map((column) => read().getItem(0, column)?.formula))
      .toEqual(['=#REF!', '=SUM(#REF!)', '=SUM(#REF!)', '=#REF!']);
    expect(read().getItem(1, 1)?.formula).toBe('=A$1');
    editor.commands.run(UndoSheetCommand, void 0);
    expect(read().getItem(1, 1)?.formula).toBe('=A1');
    editor.commands.run(RedoSheetCommand, void 0);
    expect(read().getItem(0, 1)?.formula).toBe('=#REF!');

    sort(SheetSortDirection.Descending);
    expect(read().getItem(1, 1)?.formula).toBe('=#REF!');
    expect(read().getItem(1, 2)?.formula).toBe('=SUM(#REF!)');
    editor.destroy();
  });
});

it('guards input validators retained by a Sheet plugin after assembly', () => {
  const RegisterValidatorCommand = defineSheetCommand<void>('test.inputValidation.register');
  let retained: SheetCellInputValidationRegistry | null = null;
  let disposeRuntime: (() => void) | undefined;
  @Injectable()
  class RetainedValidatorPlugin extends SheetPlugin<null> {
    public static readonly symbol = Symbol.for('RetainedValidatorPlugin');
    private disposeInitial: (() => void) | undefined;
    public constructor() { super({ key: new PluginKey('RetainedValidatorPlugin'), state: null }); }
    public configure(context: SheetPluginSetupContext): void {
      const registry = context.container.resolve<SheetCellInputValidationRegistry>(SheetCellInputValidationRegistry.symbol);
      retained = registry;
      this.disposeInitial = registry.register('test.initial', () => ({ valid: true, reject: false }));
    }
    public registerCommands(commands: SheetCommandBus): void {
      commands.register(RegisterValidatorCommand, () => new LocalActionCommand(RegisterValidatorCommand.id, () => {
        disposeRuntime = retained!.register('test.runtime', () => ({ valid: false, reject: true }));
      }));
    }
    public registerState() { return { key: this.key, state: null }; }
    public getPluginConfig(): null { return null; }
    public apply(): null { return null; }
    public render(): null { return null; }
    public dispose(): void { this.disposeInitial?.(); }
  }

  const editor = createSheetEditor({
    sheetState: createSheetState({ size: 2 }), adapters: createHeadlessAdapters(),
    plugins: [RetainedValidatorPlugin],
  });
  const events: string[] = [];
  const unsubscribe = editor.commands.subscribe((event) => {
    if (event.phase === 'completed') events.push(event.id);
  });
  try {
    expect(() => retained!.register('test.direct', () => ({ valid: false, reject: true })))
      .toThrow('editor.commands.run');
    editor.commands.run(RegisterValidatorCommand, undefined);
    expect(retained!.validate(0, 0, 'x').reject).toBe(true);
    disposeRuntime!();
    expect(retained!.validate(0, 0, 'x').valid).toBe(true);
    expect(events).toEqual([RegisterValidatorCommand.id, UnregisterSheetInputValidatorCommand.id]);
  } finally {
    unsubscribe();
    editor.destroy();
  }
});

it('guards lifecycle controllers retained by a Sheet plugin after assembly', () => {
  const RegisterLifecycleCommand = defineSheetCommand<void>('test.lifecycle.register');
  const RemoveLifecycleCommand = defineSheetCommand<void>('test.lifecycle.remove');
  const calls: string[] = [];
  let retained: SheetLifecycleCoordinator | null = null;
  let retainedCore: SearCoreSheet | null = null;
  let unregisterInitial: (() => void) | undefined;
  let unregisterRuntime: (() => void) | undefined;
  const controller = (name: string) => ({
    start: () => { calls.push(`start:${name}`); },
    destroy: () => { calls.push(`destroy:${name}`); },
  });

  @Injectable()
  class RetainedLifecyclePlugin extends SheetPlugin<null> {
    public static readonly symbol = Symbol.for('RetainedLifecyclePlugin');
    public constructor() { super({ key: new PluginKey('RetainedLifecyclePlugin'), state: null }); }
    public configure(context: SheetPluginSetupContext): void {
      retained = context.runtime.lifecycle;
      unregisterInitial = retained.register(controller('initial'));
    }
    public initialize(context: SheetPluginRuntimeContext): void { retainedCore = context.core; }
    public registerCommands(commands: SheetCommandBus): void {
      commands.register(RegisterLifecycleCommand, () => new LocalActionCommand(RegisterLifecycleCommand.id, () => {
        unregisterRuntime = retained!.register(controller('runtime'));
      }));
      commands.register(RemoveLifecycleCommand, () => new LocalActionCommand(RemoveLifecycleCommand.id, () => {
        unregisterRuntime?.();
      }));
    }
    public registerState() { return { key: this.key, state: null }; }
    public getPluginConfig(): null { return null; }
    public apply(): null { return null; }
    public render(): null { return null; }
  }

  const editor = createSheetEditor({
    sheetState: createSheetState({ size: 2 }), adapters: createHeadlessAdapters(),
    plugins: [RetainedLifecyclePlugin],
  });
  try {
    expect(() => retained!.register(controller('direct'))).toThrow('editor.commands.run');
    expect(() => unregisterInitial!()).toThrow('editor.commands.run');
    expect(() => retained!.destroy()).toThrow('editor owner');
    expect(() => retainedCore!.destroy()).toThrow('editor owner');
    expect(() => retainedCore!.getRenderEngine().scrollManager.destroy()).toThrow('editor owner');
    expect(() => { (retainedCore as unknown as { dataEngine: unknown }).dataEngine = {}; }).toThrow();
    expect(() => { (retainedCore as unknown as { eventEngine: unknown }).eventEngine = {}; }).toThrow();
    editor.commands.run(RegisterLifecycleCommand, undefined);
    expect(() => unregisterRuntime!()).toThrow('editor.commands.run');
    editor.commands.run(RemoveLifecycleCommand, undefined);
    expect(calls).toEqual(['start:initial', 'start:runtime', 'destroy:runtime']);
  } finally {
    editor.destroy();
  }
  expect(calls).toEqual(['start:initial', 'start:runtime', 'destroy:runtime', 'destroy:initial']);
});

it('prevents retained Sheet plugins from clearing active sessions directly', () => {
  let container: Container | undefined;
  const editor = createSheetEditor({
    sheetState: createSheetState({ size: 2 }),
    adapters: {
      ...createHeadlessAdapters(),
      registerEnvironment: (value) => { container = value; },
    },
  });
  try {
    editor.commands.run(StartFormatPainterCommand, {
      source: { start: [0, 0], end: [0, 0] }, mode: FormatPainterMode.Persistent,
    });
    const painter = container!.resolve<SheetFormatPainterPlugin>(SheetFormatPainterPlugin.symbol);
    expect(editor.observations.getSnapshot(FormatPainterObservation).mode).toBe(FormatPainterMode.Persistent);
    expect(() => painter.destroy()).toThrow('editor.commands.run');
    expect(() => Object.defineProperty(painter, 'assertRuntimeWriteAllowed', { value: () => void 0 }))
      .toThrow();
    expect(() => SheetFormatPainterPlugin.prototype.destroy.call(painter)).toThrow('editor.commands.run');
    expect(editor.observations.getSnapshot(FormatPainterObservation).mode).toBe(FormatPainterMode.Persistent);
  } finally {
    editor.destroy();
  }
});

it('rejects rebinding retained cell editor runtime services after assembly', () => {
  let container: Container | undefined;
  const editor = createSheetEditor({
    sheetState: createSheetState({ size: 2 }),
    adapters: {
      ...createHeadlessAdapters(),
      registerEnvironment: (value) => { container = value; },
    },
  });
  try {
    const cellEditor = container!.resolve<SheetCellEditorPlugin>(SheetCellEditorPlugin.symbol);
    expect(() => cellEditor.bindRuntimeServices(container!)).toThrow('cannot be rebound after assembly');
  } finally {
    editor.destroy();
  }
});

it('guards cell extensions retained by a Sheet plugin after assembly', () => {
  const RegisterCellExtensionCommand = defineSheetCommand<void>('test.cellExtension.register');
  const RemoveCellExtensionCommand = defineSheetCommand<void>('test.cellExtension.remove');
  const cellType = 'test.retained-cell';
  const definition: CellRenderDefinition = {
    type: cellType,
    createRenderer: () => ({ cellType, register: () => () => void 0 }),
  };
  let catalog: CellTypeCatalog | null = null;
  let commits: CellCommitStrategyRegistry | null = null;
  let displays: CellDisplayTextRegistry | null = null;
  let visuals: SheetCellVisualReaderRegistry | null = null;
  let coordinator: SheetRenderCoordinatorManager | null = null;
  let converters: CellFormulaValueConverterRegistry | null = null;
  let disposeDefinition: (() => void) | undefined;
  let disposeConverter: (() => void) | undefined;
  @Injectable()
  class RetainedCellExtensionPlugin extends SheetPlugin<null> {
    public static readonly symbol = Symbol.for('RetainedCellExtensionPlugin');
    public constructor() { super({ key: new PluginKey('RetainedCellExtensionPlugin'), state: null }); }
    public configure(context: SheetPluginSetupContext): void {
      catalog = context.runtime.cells.catalog;
      commits = context.container.resolve(CellCommitStrategyRegistry.symbol);
      displays = context.container.resolve(CellDisplayTextRegistry.symbol);
      visuals = context.runtime.render.cellVisualReaders;
      coordinator = context.container.resolve(SheetRenderCoordinatorManager.symbol);
      converters = context.container.resolve(CellFormulaValueConverterRegistry.symbol);
    }
    public registerCommands(commands: SheetCommandBus): void {
      commands.register(RegisterCellExtensionCommand, () =>
        new LocalActionCommand(RegisterCellExtensionCommand.id, () => {
          disposeDefinition = catalog!.register(definition);
          disposeConverter = converters!.register({ cellType, toFormulaValue: () => 42 });
        }));
      commands.register(RemoveCellExtensionCommand, () =>
        new LocalActionCommand(RemoveCellExtensionCommand.id, () => {
          disposeConverter?.();
          disposeDefinition?.();
        }));
    }
    public registerState() { return { key: this.key, state: null }; }
    public getPluginConfig(): null { return null; }
    public apply(): null { return null; }
    public render(): null { return null; }
  }

  const editor = createSheetEditor({
    sheetState: createSheetState({ size: 2 }), adapters: createHeadlessAdapters(),
    plugins: [RetainedCellExtensionPlugin],
  });
  try {
    expect(() => catalog!.register(definition)).toThrow('editor.commands.run');
    expect(() => converters!.register({ cellType, toFormulaValue: () => 42 }))
      .toThrow('editor.commands.run');
    expect(() => catalog!.unregister(CellType.String)).toThrow('editor.commands.run');
    expect(() => commits!.unregister('test')).toThrow('editor.commands.run');
    expect(() => displays!.register({ cellType: 'test', getDisplayText: () => 'changed' }))
      .toThrow('editor.commands.run');
    expect(() => visuals!.destroy()).toThrow('editor.commands.run');
    expect(() => coordinator!.registerStoredValueValidator('test', () => true))
      .toThrow('editor.commands.run');
    editor.commands.run(RegisterCellExtensionCommand, undefined);
    expect(catalog!.get(definition.type)).toBe(definition);
    expect(converters!.toFormulaValue({ type: cellType, value: 'ignored' })).toBe(42);
    expect(() => disposeDefinition!()).toThrow('editor.commands.run');
    expect(() => disposeConverter!()).toThrow('editor.commands.run');
    editor.commands.run(RemoveCellExtensionCommand, undefined);
    expect(catalog!.get(definition.type)).toBeUndefined();
  } finally {
    editor.destroy();
  }
});

it('guards setup contributions retained by a Sheet plugin after assembly', () => {
  const RegisterTransferCommand = defineSheetCommand<void>('test.formatTransfer.register');
  const RemoveTransferCommand = defineSheetCommand<void>('test.formatTransfer.remove');
  const RegisterQueryCommand = defineSheetCommand<void>('test.runtimeQuery.register');
  const RemoveQueryCommand = defineSheetCommand<void>('test.runtimeQuery.remove');
  const RuntimeQuery = defineSheetQuery<void, number>('test.runtimeQuery');
  const RuntimeCapability = defineSheetRuntimeCapability<number>('test.runtimeCapability');
  let runtime: SheetPluginSetupContext['runtime'] | null = null;
  let transfers: SheetFormatTransferRegistry | null = null;
  let moves: SheetRangeMoveRegistry | null = null;
  let reorders: SheetRangeReorderRegistry | null = null;
  let structures: SheetStructureMoveRegistry | null = null;
  let highlights: SheetHighlightRegistry | null = null;
  let disposeTransfer: (() => void) | undefined;
  let disposeQuery: (() => void) | undefined;
  @Injectable()
  class RetainedContributionPlugin extends SheetPlugin<null> {
    public static readonly symbol = Symbol.for('RetainedContributionPlugin');
    public constructor() { super({ key: new PluginKey('RetainedContributionPlugin'), state: null }); }
    public configure(context: SheetPluginSetupContext): void {
      runtime = context.runtime;
      transfers = context.container.resolve(SheetFormatTransferRegistry.symbol);
      moves = context.container.resolve(SheetRangeMoveRegistry.symbol);
      reorders = context.container.resolve(SheetRangeReorderRegistry.symbol);
      structures = context.container.resolve(SheetStructureMoveRegistry.symbol);
      highlights = context.container.resolve(SheetHighlightRegistry.symbol);
    }
    public registerCommands(commands: SheetCommandBus): void {
      commands.register(RegisterTransferCommand, () => new LocalActionCommand(RegisterTransferCommand.id, () => {
        disposeTransfer = transfers!.register({ id: 'test.transfer' });
      }));
      commands.register(RemoveTransferCommand, () =>
        new LocalActionCommand(RemoveTransferCommand.id, () => disposeTransfer?.()));
      commands.register(RegisterQueryCommand, () =>
        new LocalActionCommand(RegisterQueryCommand.id, () => {
          disposeQuery = runtime!.queries.register(RuntimeQuery, () => 7);
        }));
      commands.register(RemoveQueryCommand, () =>
        new LocalActionCommand(RemoveQueryCommand.id, () => disposeQuery?.()));
    }
    public registerState() { return { key: this.key, state: null }; }
    public getPluginConfig(): null { return null; }
    public apply(): null { return null; }
    public render(): null { return null; }
  }

  const editor = createSheetEditor({
    sheetState: createSheetState({ size: 2 }), adapters: createHeadlessAdapters(),
    plugins: [RetainedContributionPlugin],
  });
  try {
    expect(() => transfers!.register({ id: 'test.direct' })).toThrow('editor.commands.run');
    expect(() => moves!.destroy()).toThrow('editor.commands.run');
    expect(() => reorders!.destroy()).toThrow('editor.commands.run');
    expect(() => structures!.destroy()).toThrow('editor.commands.run');
    expect(() => runtime!.interaction.reducers.register({ type: 'test.direct', reduce: (state) => state }))
      .toThrow('editor.commands.run');
    expect(() => runtime!.interaction.pipelineSteps.register({ kind: 'test.direct', execute: () => void 0 }))
      .toThrow('editor.commands.run');
    expect(() => runtime!.render.strategies.addStrategy(Symbol('test.direct'), testStrategy))
      .toThrow('editor.commands.run');
    expect(() => runtime!.render.strategies.setViewScale(2)).toThrow('editor.commands.run');
    expect(() => runtime!.input.cursorRules.register({
      kind: CursorRuleKind.Type, cellType: 'test.direct', cursor: CursorToken.Pointer,
    })).toThrow('editor.commands.run');
    expect(() => highlights!.register({ key: 'test.direct', getHighlights: () => [] }))
      .toThrow('editor.commands.run');
    expect(() => highlights!.setEnabled('sheet.formatPainter.source', false))
      .toThrow('editor.commands.run');
    expect(() => runtime!.queries.register(RuntimeQuery, () => 7)).toThrow('editor.commands.run');
    expect(() => runtime!.observations.register(thirdPartyStatusObservation, {
      getSnapshot: () => 1, subscribe: () => () => void 0,
    })).toThrow('editor.commands.run');
    expect(() => runtime!.extensions.register(RuntimeCapability, 7)).toThrow('editor.commands.run');
    expect(() => runtime!.queries.destroy()).toThrow('editor.commands.run');
    expect(() => runtime!.observations.destroy()).toThrow('editor.commands.run');
    expect(() => runtime!.extensions.destroy()).toThrow('editor.commands.run');
    editor.commands.run(RegisterQueryCommand, undefined);
    expect(editor.queries.run(RuntimeQuery, undefined)).toBe(7);
    expect(() => disposeQuery!()).toThrow('editor.commands.run');
    editor.commands.run(RemoveQueryCommand, undefined);
    editor.commands.run(RegisterTransferCommand, undefined);
    expect(() => disposeTransfer!()).toThrow('editor.commands.run');
    editor.commands.run(RemoveTransferCommand, undefined);
  } finally {
    editor.destroy();
  }
});
