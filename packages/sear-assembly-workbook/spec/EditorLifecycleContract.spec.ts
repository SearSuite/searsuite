import { SheetMatrix } from '@searsuite/sear-domain-sheet';
import { AlignmentMatrix, VerticalAlignmentMatrix } from '@searsuite/sear-plugin-alignment';
import { CellFillMatrix } from '@searsuite/sear-plugin-cell-fill';
import { CellHighlightMatrix } from '@searsuite/sear-plugin-cell-highlight';
import { DuplicateMatrix } from '@searsuite/sear-plugin-duplicate';
import { CellFormatMatrix } from '@searsuite/sear-plugin-cell-format';
import { CellMergeMatrix } from '@searsuite/sear-plugin-cell-merge';
import { ClearRangeContentsCommand } from '@searsuite/sear-assembly-commands';
import { SelectRangeCommand } from '@searsuite/sear-plugin-selection';
import { HandleDocumentInputCommand, IsCellEditingQuery } from '@searsuite/sear-plugin-cell-editor';
import { PluginKey, type PluginStateRegistration } from '@searsuite/sear-assembly-plugin';
import { ExportSheetStateCommand } from '@searsuite/sear-assembly-sheet-kernel';
import {
  createDocEditor,
  createSheetEditor,
  type DocEditor,
  type SheetEditorAdapters,
} from '@searsuite/sear-assembly-setup';
import { DocRuntimeCapability, DocPlugin } from '@searsuite/sear-assembly-doc';
import { type SheetDocumentState } from '@searsuite/sear-assembly-sheet-state';
import { SheetRuntimeCapability, SheetPlugin } from '@searsuite/sear-assembly-commands';
import { ParagraphNode, TextNode } from '@searsuite/sear-domain-doc';
import { CellType } from '@searsuite/sear-domain-cell-types';
import { ColumnShapeDimensionsCSRMatrix, CSRMatrix, RowShapeDimensionsCSRMatrix } from '@searsuite/sear-domain-matrix';
import { createWorkbookDocumentState } from '@searsuite/sear-domain-workbook';
import { NodePlatform as HeadlessPlatform } from '@searsuite/sear-node-adapters';
import { Container, Injectable } from '@searsuite/sear-foundation-di';
import {
  CollabTransport,
  CollaborationChannelBinding,
  CollaborationConnectionState,
  CollaborationProtocolVersion,
  HeadlessCollabTransport,
  type CollaborationClientMessage,
  type CollaborationServerMessage,
  type CollaborationTransportConnectOptions,
} from '@searsuite/sear-plugin-collab';
import { SheetHistoryStatusObservation } from '@searsuite/sear-plugin-history';
import { UndoSheetCommand } from '@searsuite/sear-plugin-history';
import {
  ApplyFormatPainterCommand,
  CancelFormatPainterCommand,
  FormatPainterMode,
  FormatPainterObservation,
  StartFormatPainterCommand,
} from '@searsuite/sear-plugin-format-painter';
import { HeadlessToolbar } from '@searsuite/sear-assembly-plugin';
import { HeadlessRenderContext } from '@searsuite/sear-render-context';
import { type EventWithOffset } from '@searsuite/sear-render-context';
import { HeadlessCursorEngine } from '@searsuite/sear-render-cursor';
import { HeadlessEventRegistrar } from '@searsuite/sear-render-event-engine';
import { HeadlessKeyboardRouter, HeadlessPointerCapture, HeadlessTextInput } from '@searsuite/sear-render-input';
import { HeadlessScroller } from '@searsuite/sear-render-scroll';
import { createWorkbookEditor } from '../src';
import {
  ActivateWorkbookSheetCommand,
  AddWorkbookSheetCommand,
  RenameWorkbookSheetCommand,
  WorkbookFormulaPlugin,
  WorkbookCollaborationCapability,
  ConnectWorkbookCollaborationCommand,
  DisconnectWorkbookCollaborationCommand,
  WorkbookHistoryStatusObservation,
  WorkbookPlugin,
  WorkbookRuntimeCapability,
} from '@searsuite/sear-assembly-workbook-kernel';
import { runEditorLifecycleContract } from './support/EditorLifecycleContract';

function createSheetState(): SheetDocumentState {
  return {
    sheetData: new SheetMatrix({ data: [], indices: [0], indptr: [] }, [20, 20]),
    rowSizes: new RowShapeDimensionsCSRMatrix(void 0, [1, 20]),
    columnSizes: new ColumnShapeDimensionsCSRMatrix(void 0, [1, 20]),
    cellAlignments: new AlignmentMatrix(void 0, [20, 20]),
    cellVerticalAlignments: new VerticalAlignmentMatrix(void 0, [20, 20]),
    cellFills: new CellFillMatrix(void 0, [20, 20]),
    cellHighlights: new CellHighlightMatrix(void 0, [20, 20]),
    duplicates: new DuplicateMatrix(void 0, [20, 20]),
    cellFormats: new CellFormatMatrix(void 0, [20, 20]),
    rowHiddenOriginalSizes: new CSRMatrix<number>(void 0, [1, 20]),
    columnHiddenOriginalSizes: new CSRMatrix<number>(void 0, [1, 20]),
    cellMerges: new CellMergeMatrix(void 0, [20, 20]),
  };
}

function createAdapters(): SheetEditorAdapters {
  return {
    platform: HeadlessPlatform,
    createRenderContexts: () => ({
      renderContext: new HeadlessRenderContext(),
      offScreenRenderContext: new HeadlessRenderContext(),
      hitRenderContext: new HeadlessRenderContext(),
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

function createContractDocEditor(): DocEditor {
  const paragraph = new ParagraphNode({
    type: ParagraphNode.nodeType,
    attrs: {},
    content: [{ type: TextNode.nodeType, attrs: {}, content: [], text: 'Contract' }],
  });
  return createDocEditor({
    documentState: { document: [paragraph] },
    adapters: {
      platform: HeadlessPlatform,
      createRenderContext: () => new HeadlessRenderContext(),
      textInput: HeadlessTextInput,
      keyboardRouter: HeadlessKeyboardRouter,
      pointerCapture: HeadlessPointerCapture,
    },
  });
}

runEditorLifecycleContract('Sheet', {
  createEditor: () => createSheetEditor({ sheetState: createSheetState(), adapters: createAdapters() }),
  commandCapability: SheetRuntimeCapability.Commands,
});

runEditorLifecycleContract('Doc', {
  createEditor: createContractDocEditor,
  commandCapability: DocRuntimeCapability.Commands,
});

runEditorLifecycleContract('Workbook', {
  createEditor: () =>
    createWorkbookEditor({
      documentState: createWorkbookDocumentState({
        id: 'contract-workbook',
        sheets: [{ id: 'sheet-1', name: 'One' }],
        sheetStates: { 'sheet-1': createSheetState() },
      }),
      adapters: createAdapters(),
    }),
  commandCapability: WorkbookRuntimeCapability.Commands,
});

it('BUG-974 commits a cell draft before switching sheets', () => {
  const workbook = createWorkbookEditor({
    documentState: createWorkbookDocumentState({
      id: 'draft-switch-workbook',
      sheets: [
        { id: 'sheet-1', name: 'One' },
        { id: 'sheet-2', name: 'Two' },
      ],
      sheetStates: { 'sheet-1': createSheetState(), 'sheet-2': createSheetState() },
    }),
    adapters: createAdapters(),
  });
  try {
    const source = workbook.sheets.getActiveEditor();
    source.commands.run(SelectRangeCommand, { anchor: [2, 3], focus: [2, 3] });
    source.commands.run(HandleDocumentInputCommand, { kind: 'text', text: 'alpha' });
    expect(source.queries.run(IsCellEditingQuery, void 0)).toBe(true);
    workbook.commands.run(ActivateWorkbookSheetCommand, { sheetId: 'sheet-2' });
    expect(workbook.document.getState().sheetStates['sheet-1'].sheetData.getItem(2, 3)?.value).toBe('alpha');
    workbook.commands.run(ActivateWorkbookSheetCommand, { sheetId: 'sheet-1' });
    expect(
      workbook.sheets
        .getActiveEditor()
        .commands.run(ExportSheetStateCommand, void 0)
        .sheetState.sheetData.getItem(2, 3)?.value,
    ).toBe('alpha');
  } finally {
    workbook.destroy();
  }
});

it('BUG-1157 INT15-010 commits a cell draft before adding and activating a sheet', () => {
  const workbook = createWorkbookEditor({
    documentState: createWorkbookDocumentState({
      id: 'draft-add-workbook',
      sheets: [{ id: 'sheet-1', name: 'One' }],
      sheetStates: { 'sheet-1': createSheetState() },
    }),
    adapters: createAdapters(),
  });
  try {
    const source = workbook.sheets.getActiveEditor();
    source.commands.run(SelectRangeCommand, { anchor: [0, 0], focus: [0, 0] });
    source.commands.run(HandleDocumentInputCommand, { kind: 'text', text: 'draft-add' });
    expect(source.queries.run(IsCellEditingQuery, void 0)).toBe(true);
    workbook.commands.run(AddWorkbookSheetCommand, {
      sheet: { id: 'sheet-2', name: 'Two' },
      sheetState: createSheetState(),
    });
    expect(workbook.sheets.getActiveId()).toBe('sheet-2');
    expect(workbook.document.getState().sheetStates['sheet-1'].sheetData.getItem(0, 0)?.value).toBe('draft-add');
    workbook.commands.run(ActivateWorkbookSheetCommand, { sheetId: 'sheet-1' });
    expect(
      workbook.sheets
        .getActiveEditor()
        .commands.run(ExportSheetStateCommand, void 0)
        .sheetState.sheetData.getItem(0, 0)?.value,
    ).toBe('draft-add');
  } finally {
    workbook.destroy();
  }
});

it('BUG-1157 INT15-010 leaves the draft active when a new sheet cannot be added', () => {
  const workbook = createWorkbookEditor({
    documentState: createWorkbookDocumentState({
      id: 'draft-rejected-add-workbook',
      sheets: [{ id: 'sheet-1', name: 'One' }],
      sheetStates: { 'sheet-1': createSheetState() },
    }),
    adapters: createAdapters(),
  });
  try {
    const source = workbook.sheets.getActiveEditor();
    source.commands.run(SelectRangeCommand, { anchor: [0, 0], focus: [0, 0] });
    source.commands.run(HandleDocumentInputCommand, { kind: 'text', text: 'still-editing' });
    expect(() =>
      workbook.commands.run(AddWorkbookSheetCommand, {
        sheet: { id: 'sheet-2', name: 'One' },
        sheetState: createSheetState(),
      }),
    ).toThrow();
    expect(workbook.sheets.getActiveId()).toBe('sheet-1');
    expect(source.queries.run(IsCellEditingQuery, void 0)).toBe(true);
    expect(source.commands.run(ExportSheetStateCommand, void 0).sheetState.sheetData.getItem(0, 0)).toBeNull();
  } finally {
    workbook.destroy();
  }
});

it('BUG-832 keeps a reusable format brush across sheets and undoes against target formats', () => {
  const source = createSheetState();
  const target = createSheetState();
  source.cellFills.setItem(0, 0, '#ff0000');
  target.cellFills.setItem(1, 1, '#00ff00');
  const workbook = createWorkbookEditor({
    documentState: createWorkbookDocumentState({
      id: 'format-painter-workbook',
      sheets: [
        { id: 'sheet-1', name: 'One' },
        { id: 'sheet-2', name: 'Two' },
      ],
      sheetStates: { 'sheet-1': source, 'sheet-2': target },
    }),
    adapters: createAdapters(),
  });
  const cell = (row: number, column: number) => ({ start: [row, column] as const, end: [row, column] as const });
  try {
    workbook.sheets.getActiveEditor().commands.run(StartFormatPainterCommand, {
      source: cell(0, 0),
      mode: FormatPainterMode.Persistent,
    });
    workbook.commands.run(ActivateWorkbookSheetCommand, { sheetId: 'sheet-2' });
    const editor = workbook.sheets.getActiveEditor();
    expect(editor.observations.getSnapshot(FormatPainterObservation)).toMatchObject({
      mode: FormatPainterMode.Persistent,
      source: null,
    });
    editor.commands.run(ApplyFormatPainterCommand, { destination: cell(1, 1) });
    expect(editor.commands.run(ExportSheetStateCommand, void 0).sheetState.cellFills.getItem(1, 1)).toBe('#ff0000');
    expect(editor.observations.getSnapshot(FormatPainterObservation).mode).toBe(FormatPainterMode.Persistent);
    editor.commands.run(UndoSheetCommand, void 0);
    expect(editor.commands.run(ExportSheetStateCommand, void 0).sheetState.cellFills.getItem(1, 1)).toBe('#00ff00');
    editor.commands.run(CancelFormatPainterCommand, void 0);
    expect(editor.observations.getSnapshot(FormatPainterObservation).mode).toBeNull();
  } finally {
    workbook.destroy();
  }
});

let isolatedFormulaPlugins: WorkbookFormulaPlugin[] = [];

@Injectable()
class IsolatedWorkbookFormulaPlugin extends WorkbookFormulaPlugin {
  public constructor() {
    super();
    isolatedFormulaPlugins.push(this);
  }
}

@Injectable()
class RecordingCollabTransport extends CollabTransport {
  public static instances: RecordingCollabTransport[] = [];
  public readonly sent: CollaborationClientMessage[] = [];
  public disconnectCount = 0;
  readonly #listeners = new Set<(message: CollaborationServerMessage) => void>();

  public constructor() {
    super();
    RecordingCollabTransport.instances.push(this);
  }

  public connect(_options: CollaborationTransportConnectOptions): Promise<void> {
    return Promise.resolve();
  }

  public disconnect(): void {
    this.disconnectCount += 1;
  }

  public send(message: CollaborationClientMessage): void {
    this.sent.push(message);
  }

  public subscribe(listener: (message: CollaborationServerMessage) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  public emit(message: CollaborationServerMessage): void {
    this.#listeners.forEach((listener) => listener(message));
  }
}

function createStatefulWorkbook(id: string, dependencyValue: number) {
  const formulaSheet = createSheetState();
  formulaSheet.sheetData.addItem(0, 0, { type: CellType.Formula, formula: '=Two!A1+1' });
  const dependencySheet = createSheetState();
  dependencySheet.sheetData.addItem(0, 0, { type: CellType.Number, value: dependencyValue });
  return createWorkbookEditor({
    documentState: createWorkbookDocumentState({
      id,
      sheets: [
        { id: 'sheet-1', name: 'One' },
        { id: 'sheet-2', name: 'Two' },
      ],
      sheetStates: { 'sheet-1': formulaSheet, 'sheet-2': dependencySheet },
    }),
    adapters: { ...createAdapters(), collabTransport: RecordingCollabTransport },
    plugins: [IsolatedWorkbookFormulaPlugin],
  });
}

describe('stateful plugin isolation across WorkbookEditors', () => {
  it('isolates collaboration, sheet/workbook history, and workbook formula state', async () => {
    isolatedFormulaPlugins = [];
    RecordingCollabTransport.instances = [];
    const first = createStatefulWorkbook('first-workbook', 2);
    const second = createStatefulWorkbook('second-workbook', 10);
    const firstFormula = isolatedFormulaPlugins[0];
    const secondFormula = isolatedFormulaPlugins[1];
    const firstFormulaCell = firstFormula.parseReference('One!A1');
    const secondFormulaCell = secondFormula.parseReference('One!A1');

    expect(firstFormula.getFormulaResult(firstFormulaCell)).toBe(3);
    expect(secondFormula.getFormulaResult(secondFormulaCell)).toBe(11);

    first.commands.run(RenameWorkbookSheetCommand, { sheetId: 'sheet-2', name: 'Data' });
    expect(firstFormula.getSheetFormulaSource('sheet-1', 0, 0)).toBe('=Data!A1+1');
    expect(secondFormula.getSheetFormulaSource('sheet-1', 0, 0)).toBe('=Two!A1+1');
    expect(first.observations.getSnapshot(WorkbookHistoryStatusObservation).canUndo).toBe(true);
    expect(second.observations.getSnapshot(WorkbookHistoryStatusObservation).canUndo).toBe(false);

    await first.commands.run(ConnectWorkbookCollaborationCommand, {
      sheetId: 'sheet-1',
      options: { url: 'ws://example.test', resourceId: 'first-sheet' },
    });
    await second.commands.run(ConnectWorkbookCollaborationCommand, {
      sheetId: 'sheet-1',
      options: { url: 'ws://example.test', resourceId: 'second-sheet' },
    });
    first.sheets.getActiveEditor().commands.run(ClearRangeContentsCommand, { anchor: [0, 0], focus: [0, 0] });

    expect(RecordingCollabTransport.instances[0]?.sent).toHaveLength(1);
    expect(RecordingCollabTransport.instances[1]?.sent).toHaveLength(0);
    expect(first.sheets.getActiveEditor().observations.getSnapshot(SheetHistoryStatusObservation).canUndo).toBe(true);
    expect(second.sheets.getActiveEditor().observations.getSnapshot(SheetHistoryStatusObservation).canUndo).toBe(false);
    expect(secondFormula.getFormulaResult(secondFormulaCell)).toBe(11);

    first.destroy();
    expect(RecordingCollabTransport.instances[0]?.disconnectCount).toBe(1);
    expect(RecordingCollabTransport.instances[1]?.disconnectCount).toBe(0);
    expect(secondFormula.getFormulaResult(secondFormulaCell)).toBe(11);

    second.sheets.getActiveEditor().commands.run(ClearRangeContentsCommand, { anchor: [0, 0], focus: [0, 0] });
    expect(RecordingCollabTransport.instances[1]?.sent).toHaveLength(1);
    second.destroy();
    expect(RecordingCollabTransport.instances[1]?.disconnectCount).toBe(1);
  });
});

describe('Workbook-owned collaboration channels', () => {
  it('requires commands for mutations through a retained mounted Sheet channel', async () => {
    let sheetContainer: Container | null = null;
    const editor = createWorkbookEditor({
      documentState: createWorkbookDocumentState({
        id: 'guarded-collaboration',
        sheets: [{ id: 'sheet-1', name: 'One' }],
        sheetStates: { 'sheet-1': createSheetState() },
      }),
      adapters: {
        ...createAdapters(),
        registerEnvironment: (value) => {
          sheetContainer = value;
        },
      },
    });
    try {
      const channel = sheetContainer!.resolve<CollaborationChannelBinding>(CollaborationChannelBinding.symbol).channel;
      const options = { url: 'ws://example.test', resourceId: 'sheet-1' };
      await expect(channel.connect(options)).rejects.toThrow('editor.commands.run');
      expect(() => channel.disconnect()).toThrow('editor.commands.run');
      expect(() => channel.submitLocal('sheet.data', [])).toThrow('editor.commands.run');
      expect(() => channel.destroy()).toThrow('editor.commands.run');

      const transportEvents: string[] = [];
      editor.commands.subscribe(({ phase, id }) => {
        if (id === 'workbook.collaboration.applyTransportEvent') transportEvents.push(phase);
      });
      await editor.commands.run(ConnectWorkbookCollaborationCommand, { sheetId: 'sheet-1', options });
      expect(channel.getStatus().state).toBe(CollaborationConnectionState.Online);
      expect(transportEvents).toEqual(['started', 'completed']);
      editor.commands.run(DisconnectWorkbookCollaborationCommand, { sheetId: 'sheet-1' });
      expect(channel.getStatus().state).toBe(CollaborationConnectionState.Disconnected);
    } finally {
      editor.destroy();
    }
  });

  it('retains revision, pending work, and queued remote operations across SheetEditor remounts', async () => {
    RecordingCollabTransport.instances = [];
    const firstSheet = createSheetState();
    firstSheet.sheetData.addItem(0, 0, { type: CellType.String, value: 'local' });
    const editor = createWorkbookEditor({
      documentState: createWorkbookDocumentState({
        id: 'collaboration-workbook',
        sheets: [
          { id: 'sheet-1', name: 'One' },
          { id: 'sheet-2', name: 'Two' },
        ],
        sheetStates: { 'sheet-1': firstSheet, 'sheet-2': createSheetState() },
      }),
      adapters: { ...createAdapters(), collabTransport: RecordingCollabTransport },
    });
    const workbookCollaboration = editor.services.require(WorkbookCollaborationCapability);
    await editor.commands.run(ConnectWorkbookCollaborationCommand, {
      sheetId: 'sheet-1',
      options: { url: 'ws://example.test', resourceId: 'sheet-1' },
    });

    editor.sheets.getActiveEditor().commands.run(ClearRangeContentsCommand, { anchor: [0, 0], focus: [0, 0] });
    const transport = RecordingCollabTransport.instances[0];
    const submission = transport?.sent[0];
    if (!transport || !submission) throw new Error('Missing local collaboration submission.');
    expect(workbookCollaboration.getSheetStatus('sheet-1')).toMatchObject({ revision: 0, pendingCount: 1 });

    editor.commands.run(ActivateWorkbookSheetCommand, { sheetId: 'sheet-2' });
    expect(transport.disconnectCount).toBe(0);
    expect(workbookCollaboration.getSheetStatus('sheet-1')).toMatchObject({ revision: 0, pendingCount: 1 });

    transport.emit({ ...submission, kind: 'accepted', serverRevision: 1 });
    transport.emit({
      kind: 'accepted',
      protocolVersion: CollaborationProtocolVersion,
      resourceId: 'sheet-1',
      clientId: 'remote',
      operationId: 'remote:1',
      ownerId: 'sheet.data',
      operationType: { id: 'sear.matrix', version: 1 },
      baseRevision: 1,
      serverRevision: 2,
      payload: [
        {
          p: [0, 1],
          uc: { value: { type: CellType.String, value: 'remote' }, prev: null },
        },
      ],
    });
    expect(workbookCollaboration.getSheetStatus('sheet-1')).toMatchObject({ revision: 2, pendingCount: 0 });

    editor.commands.run(ActivateWorkbookSheetCommand, { sheetId: 'sheet-1' });
    const exported = editor.sheets.getActiveEditor().commands.run(ExportSheetStateCommand, void 0).sheetState;
    expect(exported.sheetData.getItem(0, 1)).toEqual({ type: CellType.String, value: 'remote' });
    expect(transport.disconnectCount).toBe(0);

    editor.destroy();
    expect(transport.disconnectCount).toBe(1);
  });
});

let failureEvents: string[] = [];

abstract class LifecycleSheetPlugin extends SheetPlugin<null> {
  public constructor(key: string) {
    super({ key: new PluginKey(key), state: null });
  }

  public registerState(): PluginStateRegistration<null> {
    return { key: this.key, state: null, dataEngine: { enabled: false } };
  }

  public apply(): null {
    return null;
  }

  public onEditorDestroy(): void {
    failureEvents.push(`destroy:${this.key.key}`);
  }
}

@Injectable()
class FirstFailingSheetPlugin extends LifecycleSheetPlugin {
  public static readonly symbol = Symbol.for('FirstFailingSheetPlugin');
  public constructor() {
    super('sheet-first');
  }
  public initialize(): void {
    failureEvents.push('initialize:sheet-first');
  }
}

@Injectable()
class SecondFailingSheetPlugin extends LifecycleSheetPlugin {
  public static readonly symbol = Symbol.for('SecondFailingSheetPlugin');
  public constructor() {
    super('sheet-second');
  }
  public initialize(): void {
    failureEvents.push('initialize:sheet-second');
    throw new Error('sheet setup failure');
  }
}

abstract class LifecycleDocPlugin extends DocPlugin<null> {
  public constructor(key: string) {
    super({ key: new PluginKey(key), state: null });
  }

  public registerState(): PluginStateRegistration<null> {
    return { key: this.key, state: null, dataEngine: { enabled: false } };
  }

  public apply(): null {
    return null;
  }

  public onEditorDestroy(): void {
    failureEvents.push(`destroy:${this.key.key}`);
  }
}

@Injectable()
class FirstFailingDocPlugin extends LifecycleDocPlugin {
  public static readonly symbol = Symbol.for('FirstFailingDocPlugin');
  public constructor() {
    super('doc-first');
  }
  public initialize(): void {
    failureEvents.push('initialize:doc-first');
  }
}

@Injectable()
class SecondFailingDocPlugin extends LifecycleDocPlugin {
  public static readonly symbol = Symbol.for('SecondFailingDocPlugin');
  public constructor() {
    super('doc-second');
  }
  public initialize(): void {
    failureEvents.push('initialize:doc-second');
    throw new Error('doc setup failure');
  }
}

@Injectable()
class FirstFailingWorkbookPlugin extends WorkbookPlugin {
  public static readonly symbol = Symbol.for('FirstFailingWorkbookPlugin');
  public initialize(): () => void {
    failureEvents.push('initialize:workbook-first');
    return () => failureEvents.push('dispose:workbook-first');
  }
  public onWorkbookDestroy(): void {
    failureEvents.push('destroy:workbook-first');
  }
}

@Injectable()
class SecondFailingWorkbookPlugin extends WorkbookPlugin {
  public static readonly symbol = Symbol.for('SecondFailingWorkbookPlugin');
  public initialize(): void {
    failureEvents.push('initialize:workbook-second');
    throw new Error('workbook setup failure');
  }
  public onWorkbookDestroy(): void {
    failureEvents.push('destroy:workbook-second');
  }
}

describe('editor initialization failure contract', () => {
  it('releases configured Sheet plugins in reverse order', () => {
    failureEvents = [];
    expect(() =>
      createSheetEditor({
        sheetState: createSheetState(),
        adapters: createAdapters(),
        plugins: [FirstFailingSheetPlugin, SecondFailingSheetPlugin],
      }),
    ).toThrow('sheet setup failure');
    expect(failureEvents).toEqual([
      'initialize:sheet-first',
      'initialize:sheet-second',
      'destroy:sheet-second$',
      'destroy:sheet-first$',
    ]);
  });

  it('releases configured Doc plugins in reverse order', () => {
    failureEvents = [];
    expect(() =>
      createDocEditor({
        defaultPlugins: false,
        documentState: { document: [] },
        plugins: [FirstFailingDocPlugin, SecondFailingDocPlugin],
        adapters: {
          platform: HeadlessPlatform,
          createRenderContext: () => new HeadlessRenderContext(),
          textInput: HeadlessTextInput,
          keyboardRouter: HeadlessKeyboardRouter,
          pointerCapture: HeadlessPointerCapture,
        },
      }),
    ).toThrow('doc setup failure');
    expect(failureEvents).toEqual([
      'initialize:doc-first',
      'initialize:doc-second',
      'destroy:doc-second$',
      'destroy:doc-first$',
    ]);
  });

  it('releases initialized Workbook plugins and all destroy hooks in reverse order', () => {
    failureEvents = [];
    expect(() =>
      createWorkbookEditor({
        documentState: createWorkbookDocumentState({
          id: 'failing-workbook',
          sheets: [{ id: 'sheet-1', name: 'One' }],
          sheetStates: { 'sheet-1': createSheetState() },
        }),
        adapters: createAdapters(),
        plugins: [FirstFailingWorkbookPlugin, SecondFailingWorkbookPlugin],
      }),
    ).toThrow('workbook setup failure');
    expect(failureEvents).toEqual([
      'initialize:workbook-first',
      'initialize:workbook-second',
      'dispose:workbook-first',
      'destroy:workbook-second',
      'destroy:workbook-first',
    ]);
  });
});

let teardownEvents: string[] = [];

class TeardownOrderPlatform extends HeadlessPlatform {
  public destroy(): void {
    teardownEvents.push('container');
  }
}

class TeardownOrderRenderContext extends HeadlessRenderContext {
  public override addEventListener(type: string, callback: (event: EventWithOffset) => void): () => void {
    const dispose = super.addEventListener(type, callback);
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      dispose();
      teardownEvents.push('host-listener');
    };
  }
}

@Injectable()
class TeardownOrderEventRegistrar extends HeadlessEventRegistrar {
  public override registeredEvents = ['mouseDown'];
}

function createTeardownAdapters(): SheetEditorAdapters {
  return {
    ...createAdapters(),
    platform: TeardownOrderPlatform,
    eventRegistrar: TeardownOrderEventRegistrar,
    createRenderContexts: () => ({
      renderContext: new TeardownOrderRenderContext(),
      offScreenRenderContext: new HeadlessRenderContext(),
      hitRenderContext: new HeadlessRenderContext(),
    }),
  };
}

describe.each([
  {
    name: 'SheetEditor',
    create: () => createSheetEditor({ sheetState: createSheetState(), adapters: createTeardownAdapters() }),
  },
  {
    name: 'DocEditor',
    create: () =>
      createDocEditor({
        documentState: { document: [] },
        adapters: {
          platform: TeardownOrderPlatform,
          createRenderContext: () => new TeardownOrderRenderContext(),
          eventRegistrar: TeardownOrderEventRegistrar,
          textInput: HeadlessTextInput,
          keyboardRouter: HeadlessKeyboardRouter,
          pointerCapture: HeadlessPointerCapture,
        },
      }),
  },
  {
    name: 'WorkbookEditor',
    create: () =>
      createWorkbookEditor({
        documentState: createWorkbookDocumentState({
          id: 'teardown-workbook',
          sheets: [{ id: 'sheet-1', name: 'One' }],
          sheetStates: { 'sheet-1': createSheetState() },
        }),
        adapters: createTeardownAdapters(),
      }),
  },
])('$name host resource ordering contract', ({ create }) => {
  it('releases host event listeners before resetting editor-local DI resources', () => {
    teardownEvents = [];
    const editor = create();
    editor.destroy();
    expect(teardownEvents).toContain('host-listener');
    expect(teardownEvents).toContain('container');
    expect(teardownEvents.indexOf('host-listener')).toBeLessThan(teardownEvents.indexOf('container'));
  });
});
