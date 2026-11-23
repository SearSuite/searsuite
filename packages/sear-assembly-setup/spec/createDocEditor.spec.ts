import { createDocEditor } from '../src/doc/createDocEditor';
import { DocCaretState } from '../src/doc/DocCaretState';
import { DocInputAdapterLifecycle } from '../src/doc/DocInputAdapterLifecycle';
import { DocRenderCoordinator } from '../src/doc/DocRenderCoordinator';
import { DocViewportEnvironment } from '../src/doc/DocViewportEnvironment';
import {
  DocPlugin,
  DocRuntimeCapability,
  defineDocRuntimeCapability,
  type DocPluginRuntime,
  type DocPluginRuntimeContext,
  type DocPluginSetupContext,
} from '@searsuite/sear-assembly-doc';
import { type DocInteractionRuntime } from '../src/doc/DocInteractionRuntime';
import { DocPluginRuntimeCapability, type DocInputBindingRegistryCapability } from '@searsuite/sear-assembly-doc';
import {
  DeleteDocBackwardCommand,
  ClearDocCompositionCommand,
  InsertDocTextCommand,
  LoadDocumentCommand,
  MoveDocCursorCommand,
  RenderDocCommand,
  SelectAllDocCommand,
  SetDocCompositionCommand,
  SetDocSelectionCommand,
} from '@searsuite/sear-assembly-doc';
import { DocCompositionManager, DocCursorManager, DocInputPlugin, Pipeline, SearCoreDoc } from '@searsuite/sear-assembly-core';
import {
  CommandExecutionPhase,
  DocCommandBus,
  defineDocCommand,
  type DocCommandResult,
} from '@searsuite/sear-assembly-commands';
import {
  PluginKey,
  PluginManager,
  SessionStateRegistry,
  SessionStateRestorePhase,
  defineSessionState,
  readSessionState,
} from '@searsuite/sear-assembly-plugin';
import { NodePlatform as HeadlessPlatform } from '@searsuite/sear-node-adapters';
import { defineStateObservation } from '@searsuite/sear-foundation-subscription';
import { HeadlessRenderContext } from '@searsuite/sear-render-context';
import { EventEngine, EventRegistrar, type EventWithOffset } from '@searsuite/sear-render-event-engine';
import { HeadlessKeyboardRouter, HeadlessPointerCapture, HeadlessTextInput, type KeyboardRouterHandlers } from '@searsuite/sear-render-input';
import { WebKeyboardRouter } from '@searsuite/sear-browser-adapters';
import { DocRenderEngine, RenderEngine } from '@searsuite/sear-render-engine';
import { HitRenderStrategy, IncrementalRenderDecisionReason } from '@searsuite/sear-render-strategy';
import { Scroller, ScrollManager, type ScrollPublisher, type ScrollManagerState } from '@searsuite/sear-render-scroll';
import { Container, Injectable } from '@searsuite/sear-foundation-di';
import { PositionRect } from '@searsuite/sear-foundation-rect';
import { type HexColor } from '@searsuite/sear-foundation-utils';
import {
  ViewportOverlayNode,
  SceneGraph,
  Tree,
  type RichTextRenderNodeProperties,
  type Node,
  type NodeProperties,
} from '@searsuite/sear-render-node';
import {
  DocNodeRegistry,
  ParagraphNode,
  TableNode,
  TextNode,
  registerParagraphDocNode,
  registerTextDocNode,
  updateInlineTextStyleAttrs,
  type RichTextInlineStyleRegistry,
  type RichDocNode,
} from '@searsuite/sear-domain-doc';
import { DocTransactionRenderOperationType, RepaintDocTransaction } from '@searsuite/sear-domain-commands';
import { createTransaction, type Transaction } from '@searsuite/sear-domain-transaction';
import {
  DocContentRenderPlugin,
  DocDebugOverlayPlugin,
  SelectionPlugin,
  DocHistoryStatusObservation,
  HistoryPlugin,
  DocSelectionObservation,
  DocSelectionSessionStateDefinition,
  SetDocFontFamilyCommand,
  SetDocFontSizeCommand,
  SetDocTextColorCommand,
  SetDocBoldCommand,
  ToggleDocBoldCommand,
  SetDocItalicCommand,
  ToggleDocItalicCommand,
  SetDocUnderlineCommand,
  ToggleDocUnderlineCommand,
  SetDocStrikethroughCommand,
  ToggleDocStrikethroughCommand,
  SetDocLineSpacingCommand,
  SetDocParagraphSpacingAfterCommand,
  InsertDocTableCommand,
  RedoDocCommand,
  UndoDocCommand,
} from '../src/doc/DefaultDocFeaturePlugins';
import { DocContentRenderPluginKey, DocCaretPluginKey, DocSelectionPluginKey } from '@searsuite/sear-assembly-doc';
import {
  ApplyDocViewportScrollCommand,
  DocViewportObservation,
  DocViewportSessionStateDefinition,
  RenderDocViewportCommand,
  ResizeDocViewportCommand,
  ScrollDocViewportToCommand,
} from '../src/doc/DocViewportCommands';
import { DocRenderLayoutService } from '../src/doc/DocRenderLayoutService';
import { DocVirtualLayoutStore } from '../src/doc/DocVirtualLayoutStore';
import { DocDocumentObservation } from '../src/doc/DocStateObservations';
import { DocInlineStyleObservation, type DocInlineStyleState } from '../src/doc/DocInlineStyleObservations';
import { CaptureDocSessionStateCommand } from '../src/doc/DocSessionStateCommands';
import { ExportDocStateCommand } from '../src/doc/DocStateSnapshotCommands';
import { UpdateDocDefaultConfigCommand } from '../src/doc/DocConfigCommands';

let container = new Container();

class MeasuredHeadlessRenderContext extends HeadlessRenderContext {
  public override measureText(text: string): {
    width: number;
    height: number;
    fontAscent: number;
    fontDescent: number;
  } {
    return {
      width: text.length,
      height: 10,
      fontAscent: 8,
      fontDescent: 2,
    };
  }
}

let capturedDocKeyboardHandlers: KeyboardRouterHandlers | null = null;

class RecordingDocKeyboardRouter extends HeadlessKeyboardRouter {
  public override subscribe(handlers: KeyboardRouterHandlers): void {
    capturedDocKeyboardHandlers = handlers;
  }
}

class RecordingDocRenderContext extends MeasuredHeadlessRenderContext {
  public readonly calls: { readonly name: string; readonly args: readonly unknown[] }[] = [];

  public override cloneNode(): RecordingDocRenderContext {
    return new RecordingDocRenderContext();
  }

  public override clearRect(x: number, y: number, width: number, height: number): void {
    this.calls.push({ name: 'clearRect', args: [x, y, width, height] });
  }

  public override drawImage(...args: unknown[]): void {
    this.calls.push({ name: 'drawImage', args });
  }

  public override fillText(text: string, x: number, y: number): void {
    this.calls.push({ name: 'fillText', args: [text, x, y] });
  }

  public override setFillStyle(fillStyle: string): void {
    this.calls.push({ name: 'setFillStyle', args: [fillStyle] });
  }

  public override setFont(font: string): void {
    this.calls.push({ name: 'setFont', args: [font] });
  }

  public override measureText(text: string): {
    width: number;
    height: number;
    fontAscent: number;
    fontDescent: number;
  } {
    this.calls.push({ name: 'measureText', args: [text] });
    return super.measureText(text);
  }
}

class FontAwareRecordingDocRenderContext extends RecordingDocRenderContext {
  private activeFont = '16px sans-serif';

  public override setFont(font: string): void {
    this.activeFont = font;
    super.setFont(font);
  }

  public override measureText(text: string): {
    width: number;
    height: number;
    fontAscent: number;
    fontDescent: number;
  } {
    this.calls.push({ name: 'measureText', args: [text] });
    const fontSize = readFontSize(this.activeFont);
    return {
      width: text.length * (fontSize / 10),
      height: fontSize,
      fontAscent: fontSize * 0.8,
      fontDescent: fontSize * 0.2,
    };
  }
}

class EventfulDocRenderContext extends RecordingDocRenderContext {
  public readonly listeners = new Map<string, (event: EventWithOffset) => void>();

  public override addEventListener(type: string, callback: (event: EventWithOffset) => void): () => void {
    this.listeners.set(type, callback);
    return (): void => {
      if (this.listeners.get(type) === callback) this.listeners.delete(type);
    };
  }
}

let capturedDocResize: ((size: { width: number; height: number }) => void) | null = null;

@Injectable()
class ResizableDocPlatform extends HeadlessPlatform {
  public override observeResize(
    _target: unknown,
    callback: (size: { width: number; height: number }) => void,
  ): () => void {
    capturedDocResize = callback;
    return function clearCapturedDocResize(): void {
      capturedDocResize = null;
    };
  }
}

let publishDocScroll: ((state: ScrollManagerState) => void) | null = null;

@Injectable()
class PublishingDocScroller extends Scroller {
  public getPublisher(): ScrollPublisher {
    return function publishDocScrollUpdates(_manager, updateState): () => void {
      publishDocScroll = updateState;
      return function clearPublishDocScroll(): void {
        publishDocScroll = null;
      };
    };
  }
}

@Injectable()
class MouseDownDocEventRegistrar extends EventRegistrar {
  public override registeredEvents = ['mouseDown'];
}

function createRichDocument(...paragraphs: string[]): RichDocNode[] {
  registerSpecTextDocNodes();
  return paragraphs.map((text) =>
    DocNodeRegistry.create({
      type: ParagraphNode.nodeType,
      attrs: {},
      content: [{ type: TextNode.nodeType, attrs: {}, content: [], text }],
    }),
  );
}

function createRichParagraph(...runs: [text: string, textStyle?: Record<string, unknown>][]): RichDocNode[] {
  registerSpecTextDocNodes();
  return [
    DocNodeRegistry.create({
      type: ParagraphNode.nodeType,
      attrs: {},
      content: runs.map(([text, textStyle]) => ({
        type: TextNode.nodeType,
        attrs: textStyle ? { textStyle } : {},
        content: [],
        text,
      })) as never,
    }),
  ];
}

function registerSpecTextDocNodes(): void {
  const registry = new DocNodeRegistry();
  registerParagraphDocNode(registry);
  registerTextDocNode(registry);
}

function readFontSize(font: string): number {
  return Number(font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? 16);
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function noopPreventDefault(): void {
  return void 0;
}

function isDocBlockNode(node: Node<RichTextRenderNodeProperties>): boolean {
  return node.properties.renderRole === 'block';
}

function compareDocBlockNodes(
  left: Node<RichTextRenderNodeProperties>,
  right: Node<RichTextRenderNodeProperties>,
): number {
  return (left.properties.blockIndex ?? 0) - (right.properties.blockIndex ?? 0);
}

const PluginEchoCommand = defineDocCommand<{ readonly label: string }>('doc.test.pluginEcho');
const ThirdPartyInsertDocCommand = defineDocCommand<void>('doc.test.thirdPartyInsert');
const FailingThirdPartyInsertDocCommand = defineDocCommand<void>('doc.test.failingThirdPartyInsert');

function createPluginEchoCommand(): {
  readonly id: string;
  execute(): DocCommandResult;
} {
  return {
    id: PluginEchoCommand.id,
    execute(): DocCommandResult {
      return {
        pipeline: new Pipeline(PluginEchoCommand.id),
      };
    },
  };
}

function noopViewportOverlayDraw(): void {}

function createDefaultDocAdapters(registerEnvironment?: (editorContainer: Container) => void) {
  return {
    platform: HeadlessPlatform,
    createRenderContext() {
      return new MeasuredHeadlessRenderContext();
    },
    textInput: HeadlessTextInput,
    keyboardRouter: HeadlessKeyboardRouter,
    pointerCapture: HeadlessPointerCapture,
    registerEnvironment(editorContainer: Container) {
      registerEnvironment?.(editorContainer);
      editorContainer.registerInstance(WebKeyboardRouter.eventTargetSymbol, new EventTarget());
    },
  };
}

function createRecordingDocEditor(input: {
  readonly viewport: { readonly width: number; readonly height: number };
  readonly paragraphs: readonly string[];
  readonly document?: RichDocNode[];
  readonly renderContext?: RecordingDocRenderContext;
  readonly incrementalRenderPolicyLimits?: Parameters<typeof createDocEditor>[0]['incrementalRenderPolicyLimits'];
}) {
  const renderContext = input.renderContext ?? new RecordingDocRenderContext();
  const editor = createDocEditor({
    viewport: input.viewport,
    documentState: { document: input.document ?? createRichDocument(...input.paragraphs) },
    ...(input.incrementalRenderPolicyLimits
      ? { incrementalRenderPolicyLimits: input.incrementalRenderPolicyLimits }
      : {}),
    adapters: {
      platform: HeadlessPlatform,
      createRenderContext() {
        return renderContext;
      },
      textInput: HeadlessTextInput,
      keyboardRouter: HeadlessKeyboardRouter,
      pointerCapture: HeadlessPointerCapture,
      registerEnvironment(editorContainer: Container) {
        container = editorContainer;
        editorContainer.registerInstance(WebKeyboardRouter.eventTargetSymbol, new EventTarget());
      },
    },
  });
  return { editor, renderContext };
}

function setCollapsedDocSelection(commands: DocCommandBus, index: number, offset: number): void {
  commands.run(SetDocSelectionCommand, {
    selection: {
      anchor: { path: [index, 0], offset },
      head: { path: [index, 0], offset },
    },
  });
}

describe('createDocEditor', () => {
  it('keeps retained Doc plugin teardown under editor ownership', () => {
    let selection: SelectionPlugin | undefined;
    @Injectable()
    class RetainSelectionPlugin extends DocPlugin<null> {
      public static readonly symbol = Symbol('RetainSelectionPlugin');
      public constructor() { super({ key: new PluginKey('RetainSelectionPlugin'), state: null }); }
      public configure(context: DocPluginSetupContext): void {
        selection = context.container.resolve<SelectionPlugin>(SelectionPlugin.symbol);
      }
      public registerState() { return { key: this.key, state: null }; }
      public apply(): null { return null; }
      public getPluginConfig(): null { return null; }
      public render(): null { return null; }
    }

    const editor = createDocEditor({
      viewport: { width: 320, height: 180 },
      documentState: { document: createRichDocument('Alpha') },
      plugins: [RetainSelectionPlugin],
      adapters: createDefaultDocAdapters(),
    });
    try {
      expect(() => selection!.onEditorDestroy()).toThrow('editor.commands.run');
      expect(() => SelectionPlugin.prototype.onEditorDestroy.call(selection)).toThrow('editor.commands.run');
      expect(() => Object.defineProperty(selection, 'onEditorDestroy', { value: () => void 0 }))
        .toThrow();
      expect(() => Object.defineProperty(selection, 'assertRuntimeWriteAllowed', { value: () => void 0 }))
        .toThrow();
      expect(editor.getText()).toBe('Alpha');
    } finally {
      editor.destroy();
    }
  });
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(function ignoreDocPluginPriorityWarning() {});
    capturedDocResize = null;
    publishDocScroll = null;
    capturedDocKeyboardHandlers = null;
  });

  afterEach(() => {
    warnSpy.mockRestore();
    container.reset();
  });

  it('requires a command to change assembled document defaults', () => {
    const { editor } = createRecordingDocEditor({ viewport: { width: 320, height: 200 }, paragraphs: ['one'] });
    try {
      const config = editor.services.require(DocRuntimeCapability.Config);
      expect(() => config.updateDefaultConfigOverrides({ docFontSize: 20 })).toThrow('editor.commands.run');
      expect(() => {
        (config.getDefaultConfig().incrementalRenderPolicyLimits as { maxCopyCount: number }).maxCopyCount = 1;
      }).toThrow();
      editor.commands.run(UpdateDocDefaultConfigCommand, { docFontSize: 20 });
      expect(config.getDefaultConfig().docFontSize).toBe(20);
    } finally {
      editor.destroy();
    }
  });

  it('assembles a standalone document editor with a narrow public API', () => {
    const changes: string[] = [];
    const editor = createDocEditor({
      viewport: { width: 320, height: 180 },
      documentState: { document: createRichDocument('Alpha', 'Beta') },
      adapters: {
        platform: HeadlessPlatform,
        createRenderContext() {
          return new HeadlessRenderContext();
        },
        textInput: HeadlessTextInput,
        keyboardRouter: HeadlessKeyboardRouter,
        pointerCapture: HeadlessPointerCapture,
        registerEnvironment(editorContainer: Container) {
          container = editorContainer;
          editorContainer.registerInstance(WebKeyboardRouter.eventTargetSymbol, new EventTarget());
        },
      },
      contentRect(viewport) {
        return {
          x: 8,
          y: 12,
          width: viewport.width - 16,
          height: viewport.height - 24,
        };
      },
    });
    editor.observations.subscribe(DocDocumentObservation, (change) => changes.push(change.text));

    expect(editor.getText()).toBe('Alpha\nBeta');
    expect(editor.getDocument()).not.toBe(editor.getDocument());
    expect(editor.commands.getRegisteredCommandIds()).toEqual(
      expect.arrayContaining([
        ApplyDocViewportScrollCommand.id,
        ClearDocCompositionCommand.id,
        DeleteDocBackwardCommand.id,
        InsertDocTextCommand.id,
        LoadDocumentCommand.id,
        MoveDocCursorCommand.id,
        RenderDocViewportCommand.id,
        RenderDocCommand.id,
        ResizeDocViewportCommand.id,
        SelectAllDocCommand.id,
        SetDocCompositionCommand.id,
      ]),
    );

    editor.loadDocument(createRichDocument('Gamma'));

    expect(editor.getText()).toBe('Gamma');
    expect(changes).toEqual(['Alpha\nBeta', 'Gamma']);
    expect(() => editor.focus()).not.toThrow();
    expect(() => editor.render()).not.toThrow();
    expect(() => editor.destroy()).not.toThrow();
    expect(() => editor.destroy()).not.toThrow();
  });

  it('observes inline style availability and activation through contribution readers', () => {
    const editor = createRecordingDocEditor({
      viewport: { width: 320, height: 120 },
      paragraphs: [],
      document: createRichParagraph(['bold', { bold: true }], ['plain']),
    }).editor;
    const states: DocInlineStyleState[] = [];
    editor.observations.subscribe(DocInlineStyleObservation, (state) => states.push(state));

    expect(states.at(-1)).toMatchObject({
      bold: { enabled: false, active: false },
      italic: { enabled: false, active: false },
      underline: { enabled: false, active: false },
      strikethrough: { enabled: false, active: false },
    });

    editor.commands.run(SetDocSelectionCommand, {
      selection: {
        anchor: { path: [0, 0], offset: 0 },
        head: { path: [0, 0], offset: 4 },
      },
    });
    expect(states.at(-1)?.['bold']).toEqual({ enabled: true, active: true, value: true });
    expect(states.at(-1)?.['italic']).toEqual({ enabled: true, active: false, value: null });

    editor.commands.run(SetDocBoldCommand, { bold: null });
    expect(states.at(-1)?.['bold']).toEqual({ enabled: true, active: false, value: null });

    editor.commands.run(SetDocSelectionCommand, {
      selection: {
        anchor: { path: [0, 0], offset: 0 },
        head: { path: [0, 1], offset: 5 },
      },
    });
    expect(states.at(-1)?.['bold']).toEqual({ enabled: true, active: false, value: null });

    editor.destroy();
  });

  it('observes the common selected font size through the inline-style observation', () => {
    const editor = createRecordingDocEditor({
      viewport: { width: 320, height: 120 },
      paragraphs: ['font size'],
    }).editor;
    const states: DocInlineStyleState[] = [];
    editor.observations.subscribe(DocInlineStyleObservation, (state) => states.push(state));

    expect(states.at(-1)?.['fontSize']).toEqual({ enabled: false, active: false, value: null });

    editor.commands.run(SelectAllDocCommand, void 0);
    expect(states.at(-1)?.['fontSize']).toEqual({ enabled: true, active: false, value: null });

    editor.commands.run(SetDocFontSizeCommand, { fontSize: 24 });
    expect(states.at(-1)?.['fontSize']).toEqual({ enabled: true, active: false, value: 24 });

    editor.commands.run(SetDocFontSizeCommand, { fontSize: null });
    expect(states.at(-1)?.['fontSize']).toEqual({ enabled: true, active: false, value: null });

    editor.destroy();
  });

  it('observes the common selected font family through the inline-style observation', () => {
    const editor = createRecordingDocEditor({
      viewport: { width: 320, height: 120 },
      paragraphs: ['font family'],
    }).editor;
    const states: DocInlineStyleState[] = [];
    editor.observations.subscribe(DocInlineStyleObservation, (state) => states.push(state));

    expect(states.at(-1)?.['fontFamily']).toEqual({ enabled: false, active: false, value: null });

    editor.commands.run(SelectAllDocCommand, void 0);
    expect(states.at(-1)?.['fontFamily']).toEqual({ enabled: true, active: false, value: null });

    editor.commands.run(SetDocFontFamilyCommand, { fontFamily: 'Noto Sans' });
    expect(states.at(-1)?.['fontFamily']).toEqual({ enabled: true, active: false, value: 'Noto Sans' });

    editor.commands.run(SetDocFontFamilyCommand, { fontFamily: null });
    expect(states.at(-1)?.['fontFamily']).toEqual({ enabled: true, active: false, value: null });

    editor.destroy();
  });

  it('observes and mutates the common selected text color through the inline-style observation', () => {
    const editor = createRecordingDocEditor({
      viewport: { width: 320, height: 120 },
      paragraphs: ['text color'],
    }).editor;
    const states: DocInlineStyleState[] = [];
    editor.observations.subscribe(DocInlineStyleObservation, (state) => states.push(state));

    expect(states.at(-1)?.['color']).toEqual({ enabled: false, active: false, value: null });

    editor.commands.run(SelectAllDocCommand, void 0);
    expect(states.at(-1)?.['color']).toEqual({ enabled: true, active: false, value: null });

    editor.commands.run(SetDocTextColorCommand, { color: '#256cfb' });
    expect(states.at(-1)?.['color']).toEqual({ enabled: true, active: false, value: '#256cfb' });

    editor.commands.run(SetDocTextColorCommand, { color: null });
    expect(states.at(-1)?.['color']).toEqual({ enabled: true, active: false, value: null });

    editor.destroy();
  });

  it('applies paragraph line spacing and after-spacing through reflow commands', () => {
    const editor = createRecordingDocEditor({
      viewport: { width: 320, height: 180 },
      paragraphs: ['first', 'second'],
    }).editor;

    editor.commands.run(SetDocSelectionCommand, {
      selection: {
        anchor: { path: [0, 0], offset: 0 },
        head: { path: [1, 0], offset: 6 },
      },
    });
    editor.commands.run(SetDocLineSpacingCommand, { lineSpacing: { mode: 'multiple', value: 1.5 } });
    editor.commands.run(SetDocParagraphSpacingAfterCommand, { spacingAfter: 12 });

    expect(editor.getDocument().map((node) => node.attrs)).toEqual([
      { lineSpacing: { mode: 'multiple', value: 1.5 }, spacingAfter: 12 },
      { lineSpacing: { mode: 'multiple', value: 1.5 }, spacingAfter: 12 },
    ]);

    editor.commands.run(SetDocLineSpacingCommand, { lineSpacing: null });
    editor.commands.run(SetDocParagraphSpacingAfterCommand, { spacingAfter: null });
    expect(editor.getDocument().map((node) => node.attrs)).toEqual([{}, {}]);
    editor.destroy();
  });

  it('binds document Core and runtime to one plugin manager', () => {
    const editor = createDocEditor({
      viewport: { width: 320, height: 180 },
      documentState: { document: createRichDocument('Alpha') },
      adapters: {
        platform: HeadlessPlatform,
        createRenderContext() {
          return new HeadlessRenderContext();
        },
        textInput: HeadlessTextInput,
        keyboardRouter: HeadlessKeyboardRouter,
        pointerCapture: HeadlessPointerCapture,
        registerEnvironment(editorContainer: Container) {
          container = editorContainer;
          editorContainer.registerInstance(WebKeyboardRouter.eventTargetSymbol, new EventTarget());
        },
      },
    });

    const core = container.resolve<SearCoreDoc>(SearCoreDoc.symbol);
    const manager = container.resolve<PluginManager<SearCoreDoc, RichTextRenderNodeProperties>>(PluginManager.symbol);
    const renderEngine = container.resolve<DocRenderEngine>(DocRenderEngine.symbol);

    expect(core.pluginManager).toBe(manager);
    expect(container.resolve(RenderEngine.symbol)).toBe(renderEngine);
    const pluginKeys = manager.getAllPlugins().map((plugin) => plugin.key.key);
    expect(pluginKeys.some((key) => key.startsWith('DocInput'))).toBe(true);
    expect(pluginKeys.some((key) => key.startsWith('DocParagraph'))).toBe(true);
    expect(pluginKeys.some((key) => key.startsWith('DocContentRender'))).toBe(true);

    editor.destroy();
  });

  it('routes viewport resize and scroll through document commands', async () => {
    const commandEvents: string[] = [];
    const editor = createDocEditor({
      viewport: { width: 320, height: 180 },
      documentState: { document: createRichDocument('Alpha') },
      adapters: {
        platform: ResizableDocPlatform,
        scroller: PublishingDocScroller,
        createRenderContext() {
          return new MeasuredHeadlessRenderContext();
        },
        textInput: HeadlessTextInput,
        keyboardRouter: HeadlessKeyboardRouter,
        pointerCapture: HeadlessPointerCapture,
        registerEnvironment(editorContainer: Container) {
          container = editorContainer;
          editorContainer.registerInstance(WebKeyboardRouter.eventTargetSymbol, new EventTarget());
        },
      },
    });
    editor.commands.subscribe(function recordCompletedDocViewportCommand(event): void {
      if (event.phase === CommandExecutionPhase.Completed) commandEvents.push(event.id);
    });

    capturedDocResize?.({ width: 400, height: 240 });
    publishDocScroll?.({ x: 0, y: 0, deltaX: 0, deltaY: -24 });
    await nextAnimationFrame();

    expect(commandEvents).toEqual(
      expect.arrayContaining([
        ResizeDocViewportCommand.id,
        ApplyDocViewportScrollCommand.id,
        RenderDocViewportCommand.id,
      ]),
    );

    editor.destroy();
  });

  it('rejects direct Doc viewport writes without leaving partial state', () => {
    let editorContainer: Container | null = null;
    const editor = createDocEditor({
      viewport: { width: 320, height: 180 },
      documentState: { document: createRichDocument('Alpha') },
      adapters: {
        ...createDefaultDocAdapters(),
        registerEnvironment: (value) => { editorContainer = value; },
      },
    });
    try {
      const viewport = editorContainer!.resolve<DocViewportEnvironment>(DocViewportEnvironment.symbol);
      const before = viewport.getViewport();
      Object.assign(viewport, {
        commands: { isExecuting: () => true },
        currentViewport: { width: 1, height: 1 },
      });
      expect(() => viewport.applyViewportResize({ width: 400, height: 240 }))
        .toThrow('editor.commands.run');
      expect(viewport.getViewport()).toEqual(before);
      viewport.getViewport().width = 1;
      viewport.getContentRect().width = 1;
      expect(viewport.getViewport()).toEqual(before);
      expect(viewport.getContentRect().width).toBe(before.width);
      editor.commands.run(ResizeDocViewportCommand, { width: 400, height: 240 });
      expect(viewport.getViewport()).toEqual({ width: 400, height: 240 });
    } finally {
      editor.destroy();
    }
  });

  it('routes IME composition updates through document commands', () => {
    const commandEvents: string[] = [];
    const editor = createDocEditor({
      viewport: { width: 320, height: 180 },
      documentState: { document: createRichDocument('Alpha') },
      adapters: {
        platform: HeadlessPlatform,
        createRenderContext() {
          return new MeasuredHeadlessRenderContext();
        },
        textInput: HeadlessTextInput,
        keyboardRouter: HeadlessKeyboardRouter,
        pointerCapture: HeadlessPointerCapture,
        registerEnvironment(editorContainer: Container) {
          container = editorContainer;
          editorContainer.registerInstance(WebKeyboardRouter.eventTargetSymbol, new EventTarget());
        },
      },
    });
    editor.commands.subscribe(function recordCompletedDocCompositionCommand(event): void {
      if (event.phase === CommandExecutionPhase.Completed) commandEvents.push(event.id);
    });

    editor.commands.run(SetDocCompositionCommand, { text: '\u62fc', caretOffset: 1 });
    editor.commands.run(ClearDocCompositionCommand, void 0);

    expect(commandEvents).toEqual(expect.arrayContaining([SetDocCompositionCommand.id, ClearDocCompositionCommand.id]));

    editor.destroy();
  });

  it('applies the host document font through ConfigEngine defaults', () => {
    const renderContext = new RecordingDocRenderContext();
    const editor = createDocEditor({
      viewport: { width: 320, height: 180 },
      documentState: { document: createRichDocument('Alpha') },
      fontSize: 13,
      fontFamily: 'Test Sans',
      adapters: {
        platform: HeadlessPlatform,
        createRenderContext() {
          return renderContext;
        },
        textInput: HeadlessTextInput,
        keyboardRouter: HeadlessKeyboardRouter,
        pointerCapture: HeadlessPointerCapture,
        registerEnvironment(editorContainer: Container) {
          container = editorContainer;
          editorContainer.registerInstance(WebKeyboardRouter.eventTargetSymbol, new EventTarget());
        },
      },
    });

    expect(renderContext.calls).toContainEqual({ name: 'setFont', args: ['13px Test Sans'] });

    editor.destroy();
  });

  it('assembles document event and hit-test runtime layers', () => {
    let runtimeEventEngine!: EventEngine<NodeProperties>;
    let runtimeEventRegistrar!: EventRegistrar;

    @Injectable()
    class EventProbePlugin extends DocPlugin<null> {
      public static readonly symbol = Symbol.for('EventProbePlugin');

      public constructor() {
        super({ key: new PluginKey('EventProbePlugin'), state: null });
      }

      public registerState() {
        return { key: this.key, state: null };
      }

      public apply(_state: null, _transaction: Transaction): null {
        return null;
      }

      public getPluginConfig(): null {
        return null;
      }

      public render(): null {
        return null;
      }

      public initialize(context: DocPluginRuntimeContext): void {
        runtimeEventEngine = context.runtime.extensions.require(DocRuntimeCapability.Events).engine;
        runtimeEventRegistrar = context.runtime.extensions.require(DocRuntimeCapability.Events).registrar;
      }
    }

    const editor = createDocEditor({
      viewport: { width: 320, height: 180 },
      documentState: { document: createRichDocument('Alpha') },
      adapters: {
        platform: HeadlessPlatform,
        createRenderContext() {
          return new HeadlessRenderContext();
        },
        textInput: HeadlessTextInput,
        keyboardRouter: HeadlessKeyboardRouter,
        pointerCapture: HeadlessPointerCapture,
        registerEnvironment(editorContainer: Container) {
          container = editorContainer;
          editorContainer.registerInstance(WebKeyboardRouter.eventTargetSymbol, new EventTarget());
        },
      },
      plugins: [EventProbePlugin],
    });

    const core = container.resolve<SearCoreDoc>(SearCoreDoc.symbol);
    const eventEngine = container.resolve<EventEngine<NodeProperties>>(EventEngine.symbol);
    const eventRegistrar = container.resolve<EventRegistrar>(EventRegistrar.symbol);
    const hitRenderStrategy = container.resolve<HitRenderStrategy<NodeProperties>>(HitRenderStrategy.symbol);

    expect(core.eventEngine).toBe(eventEngine);
    expect(eventEngine.hitRenderStrategy).toBe(hitRenderStrategy);
    expect(runtimeEventEngine).toBe(eventEngine);
    expect(runtimeEventRegistrar).toBe(eventRegistrar);

    editor.destroy();
  });

  it('routes registered document pointer events to DocPlugin handlers through EventEngine', () => {
    const eventContext = new EventfulDocRenderContext();
    const onMouseDown = jest.fn();

    @Injectable()
    class PointerProbePlugin extends DocPlugin<null> {
      public static readonly symbol = Symbol.for('PointerProbePlugin');

      public constructor() {
        super({ key: new PluginKey('PointerProbePlugin'), state: null });
      }

      public registerState() {
        return { key: this.key, state: null };
      }

      public apply(_state: null, _transaction: Transaction): null {
        return null;
      }

      public getPluginConfig(): null {
        return null;
      }

      public render(): null {
        return null;
      }

      public onMouseDown(core: SearCoreDoc, event: unknown): void {
        onMouseDown(core, event);
      }
    }

    const editor = createDocEditor({
      viewport: { width: 320, height: 180 },
      documentState: { document: createRichDocument('Alpha') },
      adapters: {
        platform: HeadlessPlatform,
        createRenderContext() {
          return eventContext;
        },
        eventRegistrar: MouseDownDocEventRegistrar,
        textInput: HeadlessTextInput,
        keyboardRouter: HeadlessKeyboardRouter,
        pointerCapture: HeadlessPointerCapture,
        registerEnvironment(editorContainer: Container) {
          container = editorContainer;
          editorContainer.registerInstance(WebKeyboardRouter.eventTargetSymbol, new EventTarget());
        },
      },
      plugins: [PointerProbePlugin],
    });

    eventContext.listeners.get('mousedown')?.(new MouseEvent('mousedown') as EventWithOffset);

    expect(onMouseDown).toHaveBeenCalledTimes(1);
    expect(onMouseDown.mock.calls[0]?.[0]).toBe(container.resolve<SearCoreDoc>(SearCoreDoc.symbol));
    expect(onMouseDown.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        origin: expect.any(MouseEvent),
        target: null,
      }),
    );

    editor.destroy();
  });

  it('refreshes standalone document content nodes for the visible SceneGraph slice', () => {
    const paragraphs = Array.from({ length: 40 }, (_, index) => `Paragraph ${index}`);
    const editor = createDocEditor({
      viewport: { width: 240, height: 90 },
      documentState: { document: createRichDocument(...paragraphs) },
      adapters: {
        platform: HeadlessPlatform,
        createRenderContext() {
          return new RecordingDocRenderContext();
        },
        textInput: HeadlessTextInput,
        keyboardRouter: HeadlessKeyboardRouter,
        pointerCapture: HeadlessPointerCapture,
        registerEnvironment(editorContainer: Container) {
          container = editorContainer;
          editorContainer.registerInstance(WebKeyboardRouter.eventTargetSymbol, new EventTarget());
        },
      },
    });

    const sceneGraph = container.resolve<SceneGraph<RichTextRenderNodeProperties>>(SceneGraph.symbol);
    const sceneTree = container.resolve<Tree<PositionRect<HexColor>>>(Tree.symbol);
    const visibleNodes = sceneGraph.query(new PositionRect<HexColor>(0, 0, 240, 90));
    const allNodes = sceneGraph.query(new PositionRect<HexColor>(0, 0, 240, Number.MAX_SAFE_INTEGER));
    const blockNodes = allNodes.filter((node) => node.properties.renderRole === 'block');
    const visibleBlockNodes = visibleNodes.filter((node) => node.properties.renderRole === 'block');
    const visibleBlocks = new Set(visibleBlockNodes.map((node) => node.properties.blockIndex));
    const sceneBoundary = sceneTree.getBoundary();

    expect(sceneBoundary.width).toBe(240);
    expect(sceneBoundary.height).toBeGreaterThan(90);
    expect(blockNodes.length).toBeGreaterThan(0);
    expect(blockNodes.length).toBeLessThan(paragraphs.length);
    expect(sceneGraph.childKeys.length).toBeGreaterThanOrEqual(blockNodes.length);
    expect(visibleNodes.length).toBeGreaterThan(0);
    expect(visibleBlockNodes.every((node) => node.nodeKey === node.properties.blockId)).toBe(true);
    expect(visibleBlocks.size).toBeLessThan(paragraphs.length);

    editor.destroy();
  });

  it('does not materialize every document block during initial standalone render', () => {
    const visibleContext = new RecordingDocRenderContext();
    const paragraphs = Array.from({ length: 1000 }, (_, index) => `Paragraph ${index}`);
    const editor = createDocEditor({
      viewport: { width: 240, height: 90 },
      documentState: { document: createRichDocument(...paragraphs) },
      adapters: {
        platform: HeadlessPlatform,
        createRenderContext() {
          return visibleContext;
        },
        textInput: HeadlessTextInput,
        keyboardRouter: HeadlessKeyboardRouter,
        pointerCapture: HeadlessPointerCapture,
        registerEnvironment(editorContainer: Container) {
          container = editorContainer;
          editorContainer.registerInstance(WebKeyboardRouter.eventTargetSymbol, new EventTarget());
        },
      },
    });

    const sceneGraph = container.resolve<SceneGraph<RichTextRenderNodeProperties>>(SceneGraph.symbol);
    const allNodes = sceneGraph.query(new PositionRect<HexColor>(0, 0, 240, Number.MAX_SAFE_INTEGER));
    const blockNodes = allNodes.filter((node) => node.properties.renderRole === 'block');
    const measureCalls = visibleContext.calls.filter((call) => call.name === 'measureText');

    expect(blockNodes.length).toBeGreaterThan(0);
    expect(blockNodes.length).toBeLessThan(50);
    expect(measureCalls.length).toBeLessThan(paragraphs.length);

    editor.destroy();
  });

  it('keeps materialized document blocks contiguous after lazy height measurement', () => {
    const paragraphs = Array.from({ length: 80 }, function createWrappedParagraph(_, index) {
      return `Paragraph ${index} abcdefghijklmnopqrstuvwxyz`;
    });
    const editor = createDocEditor({
      viewport: { width: 20, height: 60 },
      documentState: { document: createRichDocument(...paragraphs) },
      adapters: {
        platform: HeadlessPlatform,
        createRenderContext() {
          return new MeasuredHeadlessRenderContext();
        },
        textInput: HeadlessTextInput,
        keyboardRouter: HeadlessKeyboardRouter,
        pointerCapture: HeadlessPointerCapture,
        registerEnvironment(editorContainer: Container) {
          container = editorContainer;
          editorContainer.registerInstance(WebKeyboardRouter.eventTargetSymbol, new EventTarget());
        },
      },
    });

    const sceneGraph = container.resolve<SceneGraph<RichTextRenderNodeProperties>>(SceneGraph.symbol);
    const blockNodes = sceneGraph
      .query(new PositionRect<HexColor>(0, 0, 20, Number.MAX_SAFE_INTEGER))
      .filter(isDocBlockNode)
      .sort(compareDocBlockNodes);

    expect(blockNodes.length).toBeGreaterThan(1);
    for (let index = 1; index < blockNodes.length; index++) {
      const previous = blockNodes[index - 1];
      expect(blockNodes[index].y).toBeCloseTo(previous.y + previous.height);
    }

    editor.destroy();
  });

  it('uses cached scene pixels when standalone document scrolls', async () => {
    const visibleContext = new RecordingDocRenderContext();
    const paragraphs = Array.from({ length: 80 }, (_, index) => `Paragraph ${index}`);
    const editor = createDocEditor({
      viewport: { width: 240, height: 90 },
      documentState: { document: createRichDocument(...paragraphs) },
      adapters: {
        platform: HeadlessPlatform,
        createRenderContext() {
          return visibleContext;
        },
        textInput: HeadlessTextInput,
        keyboardRouter: HeadlessKeyboardRouter,
        pointerCapture: HeadlessPointerCapture,
        registerEnvironment(editorContainer: Container) {
          container = editorContainer;
          editorContainer.registerInstance(WebKeyboardRouter.eventTargetSymbol, new EventTarget());
        },
      },
    });
    const sceneGraph = container.resolve<SceneGraph<RichTextRenderNodeProperties>>(SceneGraph.symbol);
    const querySpy = jest.spyOn(sceneGraph, 'query');
    const beforeScrollBlocks = sceneGraph
      .query(new PositionRect<HexColor>(0, 0, 240, Number.MAX_SAFE_INTEGER))
      .filter((node) => node.properties.renderRole === 'block');
    const beforeScrollBlocksByKey = new Map(beforeScrollBlocks.map((node) => [node.nodeKey, node]));
    const reconcilePluginNodesSpy = jest.spyOn(sceneGraph, 'reconcilePluginNodes');
    querySpy.mockClear();
    reconcilePluginNodesSpy.mockClear();
    visibleContext.calls.length = 0;

    editor.commands.run(ScrollDocViewportToCommand, { x: 0, y: 48 });
    await nextAnimationFrame();

    const exposedStripQuery = querySpy.mock.calls
      .map((call) => call[0])
      .find((rect) => rect.x === 0 && rect.y === 90 && rect.width === 240 && rect.height === 48);
    const visibleClears = visibleContext.calls.filter((call) => call.name === 'clearRect');
    const visibleCopies = visibleContext.calls.filter((call) => call.name === 'drawImage');
    const afterScrollBlocks = sceneGraph
      .query(new PositionRect<HexColor>(0, 0, 240, Number.MAX_SAFE_INTEGER))
      .filter((node) => node.properties.renderRole === 'block')
      .sort(compareDocBlockNodes);
    const retainedBlocks = afterScrollBlocks.filter((node) => beforeScrollBlocksByKey.get(node.nodeKey) === node);
    expect(exposedStripQuery).toBeDefined();
    expect(visibleClears).toEqual([{ name: 'clearRect', args: [0, 0, 240, 90] }]);
    expect(visibleCopies).toHaveLength(1);
    expect(visibleCopies[0].args.slice(1)).toEqual([0, 0, 240, 90, 0, 48, 240, 90]);
    expect(reconcilePluginNodesSpy).toHaveBeenCalledWith(DocContentRenderPluginKey.key, expect.any(Array), {
      markDirty: false,
      retainExisting: true,
      updateRetainedGeometry: true,
      replaceRetainedGeometryChanged: true,
    });
    expect(retainedBlocks.length).toBeGreaterThan(0);
    expect(afterScrollBlocks.length).toBeLessThan(paragraphs.length);

    editor.destroy();
  });

  it('exposes block layout shifts after a paragraph height change', () => {
    const visibleContext = new RecordingDocRenderContext();
    const editor = createDocEditor({
      viewport: { width: 10, height: 120 },
      documentState: { document: createRichDocument('abc', 'second', 'third') },
      adapters: {
        platform: HeadlessPlatform,
        createRenderContext() {
          return visibleContext;
        },
        textInput: HeadlessTextInput,
        keyboardRouter: HeadlessKeyboardRouter,
        pointerCapture: HeadlessPointerCapture,
        registerEnvironment(editorContainer: Container) {
          container = editorContainer;
          editorContainer.registerInstance(WebKeyboardRouter.eventTargetSymbol, new EventTarget());
        },
      },
    });
    const core = container.resolve<SearCoreDoc>(SearCoreDoc.symbol);
    visibleContext.calls.length = 0;

    editor.commands.run(SetDocSelectionCommand, {
      selection: {
        anchor: { path: [0, 0], offset: 3 },
        head: { path: [0, 0], offset: 3 },
      },
    });
    editor.commands.run(InsertDocTextCommand, { text: ' defghijklmnopqrstuvwxyz defghijklmnopqrstuvwxyz' });

    const diff = core.getDocRenderLayoutState()?.blockLayoutDiff;
    expect(diff?.getChangedEntries().map((entry) => entry.current?.index ?? entry.previous?.index)).toContain(0);
    expect(diff?.getShiftedEntries().map((entry) => entry.index)).toEqual(expect.arrayContaining([1, 2]));
    expect(diff?.getReusableRasterCopies().map((copy) => copy.index)).toEqual(expect.arrayContaining([1, 2]));
    expect(visibleContext.calls.filter((call) => call.name === 'drawImage')).not.toEqual([]);

    editor.destroy();
  });

  it('reuses the prepared document layout when standalone document scrolls', async () => {
    const editor = createDocEditor({
      viewport: { width: 240, height: 90 },
      documentState: {
        document: createRichDocument(...Array.from({ length: 80 }, (_, index) => `Paragraph ${index}`)),
      },
      adapters: {
        platform: HeadlessPlatform,
        createRenderContext() {
          return new MeasuredHeadlessRenderContext();
        },
        textInput: HeadlessTextInput,
        keyboardRouter: HeadlessKeyboardRouter,
        pointerCapture: HeadlessPointerCapture,
        registerEnvironment(editorContainer: Container) {
          container = editorContainer;
          editorContainer.registerInstance(WebKeyboardRouter.eventTargetSymbol, new EventTarget());
        },
      },
    });
    const core = container.resolve<SearCoreDoc>(SearCoreDoc.symbol);
    const prepareLayoutSpy = jest.spyOn(core, 'prepareEditorRenderLayout');
    prepareLayoutSpy.mockClear();

    editor.commands.run(ScrollDocViewportToCommand, { x: 0, y: 48 });
    await nextAnimationFrame();

    expect(prepareLayoutSpy).not.toHaveBeenCalled();

    editor.destroy();
    prepareLayoutSpy.mockRestore();
  });

  it('routes standalone document edits through plugin-owned render output', () => {
    const editor = createDocEditor({
      viewport: { width: 320, height: 180 },
      documentState: { document: createRichDocument('Alpha') },
      adapters: {
        platform: HeadlessPlatform,
        createRenderContext() {
          return new MeasuredHeadlessRenderContext();
        },
        textInput: HeadlessTextInput,
        keyboardRouter: HeadlessKeyboardRouter,
        pointerCapture: HeadlessPointerCapture,
        registerEnvironment(editorContainer: Container) {
          container = editorContainer;
          editorContainer.registerInstance(WebKeyboardRouter.eventTargetSymbol, new EventTarget());
        },
      },
    });

    const core = container.resolve<SearCoreDoc>(SearCoreDoc.symbol);
    core.clearDocRenderRequests();

    editor.commands.run(InsertDocTextCommand, { text: '!' });
    editor.commands.run(SelectAllDocCommand, void 0);

    expect(editor.getText()).toBe('!Alpha');
    expect(core.getDocRenderRequests().map((request) => request.renderPluginKey?.key)).toEqual([
      DocContentRenderPluginKey.key,
      DocSelectionPluginKey.key,
      DocCaretPluginKey.key,
    ]);

    editor.destroy();
  });

  it('keeps standalone document data as rich-text nodes instead of plain text', () => {
    const editor = createDocEditor({
      viewport: { width: 360, height: 180 },
      documentState: {
        document: [
          DocNodeRegistry.create({
            type: ParagraphNode.nodeType,
            attrs: {},
            content: [
              {
                type: TextNode.nodeType,
                attrs: { textStyle: { color: '#0f766e' } },
                content: [],
                text: 'Rich',
              },
              {
                type: TextNode.nodeType,
                attrs: {},
                content: [],
                text: ' text',
              },
            ],
          }),
        ],
      },
      adapters: {
        platform: HeadlessPlatform,
        createRenderContext() {
          return new HeadlessRenderContext();
        },
        textInput: HeadlessTextInput,
        keyboardRouter: HeadlessKeyboardRouter,
        pointerCapture: HeadlessPointerCapture,
        registerEnvironment(editorContainer: Container) {
          container = editorContainer;
          editorContainer.registerInstance(WebKeyboardRouter.eventTargetSymbol, new EventTarget());
        },
      },
    });

    expect(editor.getText()).toBe('Rich text');
    expect(editor.getDocument()[0].content).toEqual([
      {
        type: TextNode.nodeType,
        attrs: { textStyle: { color: '#0f766e' } },
        content: [],
        text: 'Rich',
      },
      {
        type: TextNode.nodeType,
        attrs: {},
        content: [],
        text: ' text',
      },
    ]);

    editor.commands.run(SelectAllDocCommand, void 0);

    const requestKeys = container
      .resolve<SearCoreDoc>(SearCoreDoc.symbol)
      .getDocRenderRequests()
      .slice(-2)
      .map((request) => request.renderPluginKey?.key);
    expect(requestKeys).toEqual([DocSelectionPluginKey.key, DocCaretPluginKey.key]);

    editor.destroy();
  });

  it('renders inline text styles through document style plugins', () => {
    const renderContext = new RecordingDocRenderContext();
    const editor = createDocEditor({
      viewport: { width: 360, height: 180 },
      documentState: {
        document: [
          DocNodeRegistry.create({
            type: ParagraphNode.nodeType,
            attrs: {},
            content: [
              {
                type: TextNode.nodeType,
                attrs: { textStyle: { color: '#0f766e', fontFamily: 'Noto Sans' } },
                content: [],
                text: 'Styled',
              },
            ],
          }),
        ],
      },
      adapters: {
        platform: HeadlessPlatform,
        createRenderContext() {
          return renderContext;
        },
        textInput: HeadlessTextInput,
        keyboardRouter: HeadlessKeyboardRouter,
        pointerCapture: HeadlessPointerCapture,
        registerEnvironment(editorContainer: Container) {
          container = editorContainer;
          editorContainer.registerInstance(WebKeyboardRouter.eventTargetSymbol, new EventTarget());
        },
      },
    });

    expect(renderContext.calls).toContainEqual({ name: 'setFillStyle', args: ['#0f766e'] });
    expect(renderContext.calls.some((call) => call.name === 'setFont' && call.args[0] === '16px Noto Sans')).toBe(true);
    editor.destroy();
  });

  it('assembles plugin-owned inline style mutations during document editor creation', () => {
    const SetHighlightCommand = defineDocCommand<{ readonly color: string | null }>('doc.test.setHighlight');

    @Injectable()
    class HighlightTextStylePlugin extends DocPlugin<null> {
      public static readonly symbol = Symbol.for('HighlightTextStylePlugin');
      private runtime: DocPluginRuntime | null = null;

      public constructor() {
        super({ key: new PluginKey('HighlightTextStylePlugin'), state: null });
      }

      public registerInlineStyles(registry: RichTextInlineStyleRegistry): void {
        registry.register({
          key: 'text.highlight',
          mutations: [
            {
              styleKey: 'highlight',
              apply(input) {
                const nextAttrs = { ...input.attrs };
                const textStyle = updateInlineTextStyleAttrs(input.attrs['textStyle'], 'highlight', input.value);
                if (Object.keys(textStyle).length > 0) nextAttrs['textStyle'] = textStyle;
                else delete nextAttrs['textStyle'];
                return nextAttrs;
              },
            },
          ],
        });
      }

      public configure(context: DocPluginSetupContext): void {
        this.runtime = context.runtime;
      }

      public registerCommands(commands: DocCommandBus): void {
        commands.register(SetHighlightCommand, (input) => this.createSetHighlightCommand(input));
      }

      public registerState() {
        return { key: this.key, state: null };
      }

      public apply(): null {
        return null;
      }

      public getPluginConfig(): null {
        return null;
      }

      public render(): null {
        return null;
      }

      private createSetHighlightCommand(input: { readonly color: string | null }) {
        const runtime = this.runtime;
        if (!runtime) throw new Error('HighlightTextStylePlugin is not configured.');
        const mutation = runtime.document.inlineStyles.requireMutation('highlight');
        return {
          id: SetHighlightCommand.id,
          execute(): DocCommandResult {
            const pipeline = new Pipeline(SetHighlightCommand.id);
            pipeline.addTransaction(
              SetHighlightCommand.id,
              runtime.document.input.createTransaction(
                (transaction, state) =>
                  transaction.setInlineTextStyle(
                    state.pendingDoc,
                    state.docSelection,
                    'highlight',
                    input.color,
                    (attrs) => mutation.apply({ attrs, value: input.color }),
                  ),
                new RepaintDocTransaction(),
              ),
            );
            pipeline.addRender(`${SetHighlightCommand.id}:render`, DocContentRenderPluginKey);
            return { pipeline };
          },
        };
      }
    }

    const editor = createDocEditor({
      viewport: { width: 360, height: 180 },
      documentState: { document: createRichDocument('Marked') },
      plugins: [HighlightTextStylePlugin],
      adapters: createDefaultDocAdapters((editorContainer) => {
        container = editorContainer;
      }),
    });

    editor.commands.run(SelectAllDocCommand, void 0);
    expect(editor.observations.getSnapshot(DocInlineStyleObservation)['highlight']).toEqual({
      enabled: true,
      active: false,
      value: null,
    });
    const core = container.resolve<SearCoreDoc>(SearCoreDoc.symbol);
    const renderLayouts = container.resolve<DocRenderLayoutService>(DocRenderLayoutService.symbol);
    const virtualLayouts = container.resolve<DocVirtualLayoutStore>(DocVirtualLayoutStore.symbol);
    core.clearDocRenderRequests();
    editor.commands.run(SetHighlightCommand, { color: '#fde047' });

    const latestRequest = core.getDocRenderRequests().at(-1);
    const latestSummary = renderLayouts.getLatestVirtualLayoutSummary();
    const blockRender = core.getDocRenderLayoutState()?.blockRender;
    expect(() => renderLayouts.reset()).toThrow('editor.commands.run');
    expect(() => virtualLayouts.reset()).toThrow('editor.commands.run');
    expect(() => virtualLayouts.prepare({} as never)).toThrow('editor.commands.run');
    expect((virtualLayouts as unknown as Record<string, unknown>)['records']).toBeUndefined();
    expect(() => { (latestSummary!.timings as unknown as { renderPrepareMs: number }).renderPrepareMs = 999; }).toThrow();
    expect(renderLayouts.getLatestVirtualLayoutSummary()?.timings.renderPrepareMs).not.toBe(999);
    expect(editor.getDocument()[0].content[0].attrs).toEqual({ textStyle: { highlight: '#fde047' } });
    expect(latestRequest?.renderOperations?.map((operation) => operation.type)).toEqual([
      DocTransactionRenderOperationType.Repaint,
    ]);
    expect(latestSummary?.cacheMisses).toBe(0);
    expect(blockRender?.changedBlocks).toHaveLength(1);
    editor.destroy();
  });

  it('routes paragraph height changes to content plugin render output', () => {
    const editor = createDocEditor({
      viewport: { width: 10, height: 120 },
      documentState: { document: createRichDocument('abc', 'second', 'third') },
      adapters: {
        platform: HeadlessPlatform,
        createRenderContext() {
          return new MeasuredHeadlessRenderContext();
        },
        textInput: HeadlessTextInput,
        keyboardRouter: HeadlessKeyboardRouter,
        pointerCapture: HeadlessPointerCapture,
        registerEnvironment(editorContainer: Container) {
          container = editorContainer;
          editorContainer.registerInstance(WebKeyboardRouter.eventTargetSymbol, new EventTarget());
        },
      },
    });

    const core = container.resolve<SearCoreDoc>(SearCoreDoc.symbol);
    core.clearDocRenderRequests();

    editor.commands.run(SetDocSelectionCommand, {
      selection: {
        anchor: { path: [0, 0], offset: 3 },
        head: { path: [0, 0], offset: 3 },
      },
    });
    editor.commands.run(InsertDocTextCommand, { text: 'defghijklmnopqrstuvwxyz' });

    const request = core.getDocRenderRequests().at(-1);
    expect(request?.renderPluginKey?.key).toBe(DocContentRenderPluginKey.key);

    editor.destroy();
  });

  it('uses block raster copies when the first block grows and shifts following blocks', () => {
    const { editor, renderContext } = createRecordingDocEditor({
      viewport: { width: 10, height: 120 },
      paragraphs: ['abc', 'second', 'third'],
    });
    renderContext.calls.length = 0;

    setCollapsedDocSelection(editor.commands, 0, 3);
    editor.commands.run(InsertDocTextCommand, { text: 'defghijklmnopqrstuvwxyz' });

    const blockRender = container.resolve<SearCoreDoc>(SearCoreDoc.symbol).getDocRenderLayoutState()?.blockRender;
    expect(blockRender?.frameMode).toBe('block-copy');
    expect(blockRender?.changedBlocks).toHaveLength(1);
    expect(blockRender?.shiftedBlocks.length).toBeGreaterThanOrEqual(2);
    expect(blockRender?.rasterCopies.length).toBeGreaterThan(0);
    expect(blockRender?.copiedPixelArea).toBeGreaterThan(0);
    expect(blockRender?.incrementalRenderCandidate).toMatchObject({
      copyCount: expect.any(Number),
      invalidRectCount: 1,
      copiedPixelArea: expect.any(Number),
      invalidPixelArea: expect.any(Number),
      copiedAreaRatio: expect.any(Number),
      invalidAreaRatio: expect.any(Number),
    });
    expect(renderContext.calls.some((call) => call.name === 'drawImage')).toBe(true);

    editor.destroy();
  });

  it('replaces a retained block when an inline font changes without shifting block layout', () => {
    const { editor, renderContext } = createRecordingDocEditor({
      viewport: { width: 320, height: 120 },
      paragraphs: ['first', 'second'],
    });
    const sceneGraph = container.resolve<SceneGraph<RichTextRenderNodeProperties>>(SceneGraph.symbol);
    const before = sceneGraph
      .query(new PositionRect<HexColor>(0, 0, 320, 120))
      .filter(isDocBlockNode)
      .find((node) => node.properties.blockIndex === 0);

    editor.commands.run(SetDocSelectionCommand, {
      selection: {
        anchor: { path: [0, 0], offset: 0 },
        head: { path: [0, 0], offset: 5 },
      },
    });
    renderContext.calls.length = 0;
    editor.commands.run(SetDocFontFamilyCommand, { fontFamily: 'Noto Sans' });

    const after = sceneGraph
      .query(new PositionRect<HexColor>(0, 0, 320, 120))
      .filter(isDocBlockNode)
      .find((node) => node.properties.blockIndex === 0);
    const blockRender = container.resolve<SearCoreDoc>(SearCoreDoc.symbol).getDocRenderLayoutState()?.blockRender;
    expect(blockRender?.frameMode).toBe('full');
    expect(blockRender?.changedBlocks).toHaveLength(1);
    expect(after).toBeDefined();
    expect(after).not.toBe(before);
    expect(renderContext.calls.some((call) => call.name === 'setFont' && call.args[0] === '16px Noto Sans')).toBe(true);

    editor.destroy();
  });

  it('applies an inline font size to the selected document text', () => {
    const { editor, renderContext } = createRecordingDocEditor({
      viewport: { width: 320, height: 120 },
      paragraphs: ['first'],
    });

    editor.commands.run(SetDocSelectionCommand, {
      selection: {
        anchor: { path: [0, 0], offset: 0 },
        head: { path: [0, 0], offset: 5 },
      },
    });
    renderContext.calls.length = 0;
    editor.commands.run(SetDocFontFamilyCommand, { fontFamily: 'Noto Sans' });
    editor.commands.run(SetDocFontSizeCommand, { fontSize: 24 });

    expect(editor.getDocument()[0].content[0].attrs).toEqual({
      textStyle: { fontFamily: 'Noto Sans', fontSize: 24 },
    });
    expect(renderContext.calls.some((call) => call.name === 'setFont' && call.args[0] === '24px Noto Sans')).toBe(true);

    editor.destroy();
  });

  it('applies and toggles bold on the selected document text', () => {
    const { editor, renderContext } = createRecordingDocEditor({
      viewport: { width: 320, height: 120 },
      paragraphs: ['first'],
    });

    editor.commands.run(SetDocSelectionCommand, {
      selection: {
        anchor: { path: [0, 0], offset: 0 },
        head: { path: [0, 0], offset: 5 },
      },
    });
    renderContext.calls.length = 0;
    editor.commands.run(SetDocBoldCommand, { bold: true });

    expect(editor.getDocument()[0].content[0].attrs).toEqual({ textStyle: { bold: true } });
    expect(
      renderContext.calls.some(
        (call) => call.name === 'setFont' && typeof call.args[0] === 'string' && call.args[0].startsWith('bold 16px '),
      ),
    ).toBe(true);

    editor.commands.run(ToggleDocBoldCommand, void 0);
    expect(editor.getDocument()[0].content[0].attrs).toEqual({});
    editor.destroy();
  });

  it('invalidates layout cache for reflow font-size operations', () => {
    const renderContext = new FontAwareRecordingDocRenderContext();
    const editor = createDocEditor({
      viewport: { width: 320, height: 120 },
      documentState: { document: createRichDocument('first', 'second') },
      adapters: {
        platform: HeadlessPlatform,
        createRenderContext() {
          return renderContext;
        },
        textInput: HeadlessTextInput,
        keyboardRouter: HeadlessKeyboardRouter,
        pointerCapture: HeadlessPointerCapture,
        registerEnvironment(editorContainer: Container) {
          container = editorContainer;
          editorContainer.registerInstance(WebKeyboardRouter.eventTargetSymbol, new EventTarget());
        },
      },
    });
    const core = container.resolve<SearCoreDoc>(SearCoreDoc.symbol);
    const initialBlock = core.getDocRenderLayoutState()?.layoutCache.getBlockByIndex(0);
    core.clearDocRenderRequests();

    editor.commands.run(SetDocSelectionCommand, {
      selection: {
        anchor: { path: [0, 0], offset: 0 },
        head: { path: [0, 0], offset: 5 },
      },
    });
    editor.commands.run(SetDocFontSizeCommand, { fontSize: 48 });

    const latestRequest = core.getDocRenderRequests().at(-1);
    const updatedBlock = core.getDocRenderLayoutState()?.layoutCache.getBlockByIndex(0);
    expect(initialBlock).toBeDefined();
    expect(latestRequest?.renderOperations?.map((operation) => operation.type)).toEqual([
      DocTransactionRenderOperationType.Reflow,
    ]);
    expect(updatedBlock?.flowHeight).toBeGreaterThan(initialBlock?.flowHeight ?? 0);

    const expandedHeight = updatedBlock?.flowHeight ?? 0;
    setCollapsedDocSelection(editor.commands, 0, 1);
    const afterClickBlock = core.getDocRenderLayoutState()?.layoutCache.getBlockByIndex(0);
    expect(afterClickBlock?.flowHeight).toBe(expandedHeight);
    const lastFillTextY = new Map<string, number>();
    for (const call of renderContext.calls) {
      if (call.name !== 'fillText') continue;
      const [text, , y] = call.args;
      if (typeof text === 'string' && typeof y === 'number') lastFillTextY.set(text, y);
    }
    expect(lastFillTextY.get('second')).toBeGreaterThan(lastFillTextY.get('first') ?? 0);
    editor.render();
    const afterExplicitRenderBlock = core.getDocRenderLayoutState()?.layoutCache.getBlockByIndex(0);
    expect(afterExplicitRenderBlock?.flowHeight).toBe(expandedHeight);

    editor.destroy();
  });

  it('uses line boxes to measure wrapped paragraphs with mixed font sizes', () => {
    const renderContext = new FontAwareRecordingDocRenderContext();
    const editor = createDocEditor({
      viewport: { width: 84, height: 120 },
      documentState: {
        document: createRichParagraph(
          ['abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz'],
          ['BIG', { fontSize: 36 }],
        ),
      },
      adapters: {
        platform: HeadlessPlatform,
        createRenderContext() {
          return renderContext;
        },
        textInput: HeadlessTextInput,
        keyboardRouter: HeadlessKeyboardRouter,
        pointerCapture: HeadlessPointerCapture,
        registerEnvironment(editorContainer: Container) {
          container = editorContainer;
          editorContainer.registerInstance(WebKeyboardRouter.eventTargetSymbol, new EventTarget());
        },
      },
    });

    const layoutState = container.resolve<SearCoreDoc>(SearCoreDoc.symbol).getDocRenderLayoutState();
    const block = layoutState?.layoutCache.getBlockByIndex(0);
    const snapshot = layoutState?.layoutCache.snapshot;
    expect(snapshot?.lines).toHaveLength(2);
    expect(block?.flowHeight).toBeCloseTo((16 + 36) * 1.15);

    editor.destroy();
  });

  it('keeps blocks before a middle height change out of the reusable raster copy set', () => {
    const { editor } = createRecordingDocEditor({
      viewport: { width: 10, height: 160 },
      paragraphs: ['first', 'mid', 'third', 'fourth'],
    });

    setCollapsedDocSelection(editor.commands, 1, 3);
    editor.commands.run(InsertDocTextCommand, { text: 'defghijklmnopqrstuvwxyz' });

    const blockRender = container.resolve<SearCoreDoc>(SearCoreDoc.symbol).getDocRenderLayoutState()?.blockRender;
    expect(blockRender?.frameMode).toBe('block-copy');
    expect(blockRender?.changedBlocks).toHaveLength(1);
    expect(blockRender?.changedBlocks[0].y).toBeGreaterThan(0);
    expect(blockRender?.shiftedBlocks.every((rect) => rect.y > blockRender.changedBlocks[0].y)).toBe(true);

    editor.destroy();
  });

  it('uses upward block raster copies when a block shrinks', () => {
    const longParagraph = 'abcdefghijklmnopqrstuvwxyz';
    const { editor } = createRecordingDocEditor({
      viewport: { width: 10, height: 160 },
      paragraphs: [longParagraph, 'second', 'third'],
    });

    editor.commands.run(SetDocSelectionCommand, {
      selection: {
        anchor: { path: [0, 0], offset: 3 },
        head: { path: [0, 0], offset: longParagraph.length },
      },
    });
    editor.commands.run(DeleteDocBackwardCommand, void 0);

    const blockRender = container.resolve<SearCoreDoc>(SearCoreDoc.symbol).getDocRenderLayoutState()?.blockRender;
    expect(blockRender?.frameMode).toBe('block-copy');
    expect(blockRender?.rasterCopies.length).toBeGreaterThan(0);
    expect(blockRender?.rasterCopies[0].destination.y).toBeLessThan(blockRender?.rasterCopies[0].source.y ?? 0);

    editor.destroy();
  });

  it('falls back to a safe non-copy path when block structure is replaced', () => {
    const { editor } = createRecordingDocEditor({
      viewport: { width: 80, height: 120 },
      paragraphs: ['first', 'second'],
    });
    const core = container.resolve<SearCoreDoc>(SearCoreDoc.symbol);
    core.clearDocRenderRequests();

    editor.commands.run(LoadDocumentCommand, { document: createRichDocument('inserted', 'first', 'second') });

    const latestRequest = core.getDocRenderRequests().at(-1);
    const blockRender = core.getDocRenderLayoutState()?.blockRender;
    expect(latestRequest?.renderOperations).not.toBeNull();
    expect(blockRender?.rasterCopies).toEqual([]);
    expect(blockRender?.copiedPixelArea).toBe(0);

    editor.destroy();
  });

  it('clips block raster copies to the visible viewport after an offscreen height change', () => {
    const { editor } = createRecordingDocEditor({
      viewport: { width: 10, height: 36 },
      paragraphs: ['abc', ...Array.from({ length: 8 }, (_, index) => `block ${index}`)],
    });
    editor.commands.run(ScrollDocViewportToCommand, { x: 0, y: 12 });

    setCollapsedDocSelection(editor.commands, 0, 3);
    editor.commands.run(InsertDocTextCommand, { text: 'defghijklmnopqrstuvwxyz' });

    const rasterCopies =
      container.resolve<SearCoreDoc>(SearCoreDoc.symbol).getDocRenderLayoutState()?.blockRender?.rasterCopies ?? [];
    expect(rasterCopies.length).toBeGreaterThan(0);
    expect(
      rasterCopies.every((copy) => copy.destination.y >= 0 && copy.destination.y + copy.destination.height <= 36),
    ).toBe(true);

    editor.destroy();
  });

  it('uses configured incremental render policy limits to reject block raster copies', () => {
    const { editor, renderContext } = createRecordingDocEditor({
      viewport: { width: 10, height: 120 },
      paragraphs: ['abc', 'second', 'third'],
      incrementalRenderPolicyLimits: {
        maxCopiedAreaRatio: 1.5,
        maxInvalidAreaRatio: 1,
        maxCopyCount: 0,
        maxInvalidRectCount: 16,
      },
    });
    renderContext.calls.length = 0;

    setCollapsedDocSelection(editor.commands, 0, 3);
    editor.commands.run(InsertDocTextCommand, { text: ' defghijklmnopqrstuvwxyz defghijklmnopqrstuvwxyz' });

    const blockRender = container.resolve<SearCoreDoc>(SearCoreDoc.symbol).getDocRenderLayoutState()?.blockRender;
    expect(blockRender?.frameMode).toBe('full');
    expect(blockRender?.incrementalRenderAccepted).toBe(false);
    expect(blockRender?.incrementalRenderReason).toBe(IncrementalRenderDecisionReason.ExcessiveCopyCount);
    expect(blockRender?.incrementalRenderCandidate?.copyCount).toBeGreaterThan(0);
    expect(blockRender?.rasterCopies).toEqual([]);
    expect(renderContext.calls.some((call) => call.name === 'drawImage')).toBe(false);

    editor.destroy();
  });

  it('updates document scroll boundaries from layout height and renders scroll outside document requests', async () => {
    const editor = createDocEditor({
      viewport: { width: 20, height: 24 },
      documentState: { document: createRichDocument('abcdefghijklmnopqrstuvwxyz', 'second wrapped paragraph') },
      adapters: {
        platform: HeadlessPlatform,
        createRenderContext() {
          return new MeasuredHeadlessRenderContext();
        },
        textInput: HeadlessTextInput,
        keyboardRouter: HeadlessKeyboardRouter,
        pointerCapture: HeadlessPointerCapture,
        registerEnvironment(editorContainer: Container) {
          container = editorContainer;
          editorContainer.registerInstance(WebKeyboardRouter.eventTargetSymbol, new EventTarget());
        },
      },
    });
    const scrollManager = container.resolve<ScrollManager>(ScrollManager.symbol);
    const core = container.resolve<SearCoreDoc>(SearCoreDoc.symbol);

    expect(scrollManager.getContentBoundary()[1]).toBeGreaterThan(0);

    core.clearDocRenderRequests();
    editor.commands.run(ScrollDocViewportToCommand, { x: 0, y: 16 });
    await nextAnimationFrame();

    expect(scrollManager.getState().y).toBeGreaterThan(0);
    expect(core.getDocRenderRequests()).toEqual([]);

    editor.destroy();
  });

  it('resolves pointer positions in document coordinates after scrolling', () => {
    let interaction!: DocInteractionRuntime;

    @Injectable()
    class InteractionProbePlugin extends DocPlugin<null> {
      public static readonly symbol = Symbol.for('InteractionProbePlugin');

      public constructor() {
        super({ key: new PluginKey('InteractionProbePlugin'), state: null });
      }

      public registerState() {
        return { key: this.key, state: null };
      }

      public apply(_state: null, _transaction: Transaction): null {
        return null;
      }

      public getPluginConfig(): null {
        return null;
      }

      public render(): null {
        return null;
      }

      public initialize(context: DocPluginRuntimeContext): void {
        interaction = context.runtime.extensions.require(DocPluginRuntimeCapability.Interaction);
      }
    }

    const editor = createDocEditor({
      viewport: { width: 20, height: 24 },
      documentState: { document: createRichDocument('abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz') },
      adapters: {
        platform: HeadlessPlatform,
        createRenderContext() {
          return new MeasuredHeadlessRenderContext();
        },
        textInput: HeadlessTextInput,
        keyboardRouter: HeadlessKeyboardRouter,
        pointerCapture: HeadlessPointerCapture,
        registerEnvironment(editorContainer: Container) {
          container = editorContainer;
          editorContainer.registerInstance(WebKeyboardRouter.eventTargetSymbol, new EventTarget());
        },
      },
      plugins: [InteractionProbePlugin],
    });
    const scrollManager = container.resolve<ScrollManager>(ScrollManager.symbol);

    editor.commands.run(ScrollDocViewportToCommand, { x: 0, y: 14 });
    const cursor = interaction.resolveCursorFromPointer({
      viewX: 6,
      viewY: 8,
      preventDefault: noopPreventDefault,
    });
    expect(cursor).toEqual({ path: [0, 0], offset: 26 });

    editor.destroy();
  });

  it('runs selection refreshes through the unified document render path', () => {
    const visibleContext = new RecordingDocRenderContext();
    const editor = createDocEditor({
      viewport: { width: 320, height: 180 },
      documentState: { document: createRichDocument('Alpha', 'Beta') },
      adapters: {
        platform: HeadlessPlatform,
        createRenderContext() {
          return visibleContext;
        },
        textInput: HeadlessTextInput,
        keyboardRouter: HeadlessKeyboardRouter,
        pointerCapture: HeadlessPointerCapture,
        registerEnvironment(editorContainer: Container) {
          container = editorContainer;
          editorContainer.registerInstance(WebKeyboardRouter.eventTargetSymbol, new EventTarget());
        },
      },
    });

    const core = container.resolve<SearCoreDoc>(SearCoreDoc.symbol);
    const prepareLayoutSpy = jest.spyOn(DocRenderLayoutService.prototype, 'prepareRenderLayout');
    core.clearDocRenderRequests();
    visibleContext.calls.length = 0;

    editor.commands.run(SelectAllDocCommand, void 0);

    const requestKeys = core
      .getDocRenderRequests()
      .slice(-2)
      .map((request) => request.renderPluginKey?.key);
    expect(requestKeys).toEqual([DocSelectionPluginKey.key, DocCaretPluginKey.key]);
    expect(core.getDocRenderLayoutState()?.visibleBlocks.length).toBeGreaterThan(0);
    expect(prepareLayoutSpy).not.toHaveBeenCalled();

    editor.destroy();
    prepareLayoutSpy.mockRestore();
  });

  it('runs caret refreshes through the unified document render path', () => {
    const visibleContext = new RecordingDocRenderContext();
    const hitRender = jest.spyOn(HitRenderStrategy.prototype, 'renderOnNextFrame');
    const editor = createDocEditor({
      viewport: { width: 320, height: 180 },
      documentState: { document: createRichDocument('Alpha', 'Beta') },
      adapters: {
        platform: HeadlessPlatform,
        createRenderContext() {
          return visibleContext;
        },
        textInput: HeadlessTextInput,
        keyboardRouter: HeadlessKeyboardRouter,
        pointerCapture: HeadlessPointerCapture,
        registerEnvironment(editorContainer: Container) {
          container = editorContainer;
          editorContainer.registerInstance(WebKeyboardRouter.eventTargetSymbol, new EventTarget());
        },
      },
    });

    const core = container.resolve<SearCoreDoc>(SearCoreDoc.symbol);
    visibleContext.calls.length = 0;
    hitRender.mockClear();

    expect(() => core.requestDocRender(DocCaretPluginKey)).toThrow('editor.commands.run');
    editor.commands.run(SetDocSelectionCommand, {
      selection: {
        anchor: { path: [0, 0], offset: 0 },
        head: { path: [0, 0], offset: 0 },
      },
    });

    expect(core.getDocRenderRequests().at(-1)?.renderPluginKey?.key).toBe(DocCaretPluginKey.key);
    expect(core.getDocRenderLayoutState()?.visibleBlocks.length).toBeGreaterThan(0);
    expect(visibleContext.calls.some((call) => call.name === 'fillText')).toBe(true);
    expect(hitRender).toHaveBeenCalled();

    editor.destroy();
    hitRender.mockRestore();
  });

  it('scroll-copy rendering uses the full host viewport so document margins scroll with content', async () => {
    const visibleContext = new RecordingDocRenderContext();
    const editor = createDocEditor({
      viewport: { width: 120, height: 80 },
      documentState: {
        document: createRichDocument(...Array.from({ length: 20 }, (_, index) => `Paragraph ${index}`)),
      },
      adapters: {
        platform: HeadlessPlatform,
        createRenderContext() {
          return visibleContext;
        },
        textInput: HeadlessTextInput,
        keyboardRouter: HeadlessKeyboardRouter,
        pointerCapture: HeadlessPointerCapture,
        registerEnvironment(editorContainer: Container) {
          container = editorContainer;
          editorContainer.registerInstance(WebKeyboardRouter.eventTargetSymbol, new EventTarget());
        },
      },
      contentRect() {
        return { x: 10, y: 20, width: 90, height: 40 };
      },
    });
    visibleContext.calls.length = 0;

    editor.commands.run(ScrollDocViewportToCommand, { x: 0, y: 24 });
    await nextAnimationFrame();

    expect(visibleContext.calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'drawImage',
          args: expect.arrayContaining([0, 0, 120, 80]),
        }),
      ]),
    );
    expect(
      visibleContext.calls.some(
        (call) => call.name === 'drawImage' && call.args.slice(1, 5).join(',') === '10,20,90,40',
      ),
    ).toBe(false);

    editor.destroy();
  });

  it('registers commands and render nodes returned by document plugins', () => {
    const commandInputs: string[] = [];
    const renderedBlockCounts: number[] = [];

    @Injectable()
    class RenderNodePlugin extends DocPlugin<null> {
      public static readonly symbol = Symbol.for('RenderNodePlugin');

      public constructor() {
        super({ key: new PluginKey('RenderNodePlugin'), state: null });
      }

      public apply(_state: null, _transaction: Transaction): null {
        return null;
      }

      public registerState() {
        return { key: this.key, state: null };
      }

      public getPluginConfig(): null {
        return null;
      }

      public render(core: SearCoreDoc): Node<RichTextRenderNodeProperties>[] | null {
        const layout = core.getDocRenderLayoutState();
        if (!layout) return null;
        renderedBlockCounts.push(layout.visibleBlocks.length);
        return [
          new ViewportOverlayNode({
            nodeKey: `${this.key.key}:overlay`,
            rect: {
              x: layout.scroll.x,
              y: layout.scroll.y,
              width: layout.viewport.width,
              height: layout.viewport.height,
            },
            drawOverlay: () => void 0,
          }),
        ];
      }

      public registerCommands(commands: import('@searsuite/sear-assembly-commands').DocCommandBus): void {
        commands.register(PluginEchoCommand, (input: { readonly label: string }) => ({
          id: PluginEchoCommand.id,
          execute(): DocCommandResult {
            return {
              pipeline: new Pipeline(PluginEchoCommand.id).addLocalAction(
                PluginEchoCommand.id,
                function recordPluginEchoCommand(): void {
                  commandInputs.push(input.label);
                },
              ),
            };
          },
        }));
      }
    }

    const editor = createDocEditor({
      viewport: { width: 320, height: 180 },
      documentState: { document: createRichDocument('Alpha') },
      plugins: [RenderNodePlugin],
      adapters: {
        platform: HeadlessPlatform,
        createRenderContext() {
          return new MeasuredHeadlessRenderContext();
        },
        textInput: HeadlessTextInput,
        keyboardRouter: HeadlessKeyboardRouter,
        pointerCapture: HeadlessPointerCapture,
        registerEnvironment(editorContainer: Container) {
          container = editorContainer;
          editorContainer.registerInstance(WebKeyboardRouter.eventTargetSymbol, new EventTarget());
        },
      },
    });

    expect(editor.commands.getRegisteredCommandIds()).toContain(PluginEchoCommand.id);
    editor.commands.run(PluginEchoCommand, { label: 'from-plugin' });

    expect(commandInputs).toEqual(['from-plugin']);
    expect(renderedBlockCounts).toContain(1);

    editor.destroy();
  });

  it('rolls back document command registrations when a plugin registers a duplicate command id', () => {
    @Injectable()
    class FirstCommandPlugin extends DocPlugin<null> {
      public static readonly symbol = Symbol.for('FirstCommandPlugin');

      public constructor() {
        super({ key: new PluginKey('FirstCommandPlugin'), state: null });
      }

      public apply(): null {
        return null;
      }

      public registerState() {
        return { key: this.key, state: null };
      }

      public getPluginConfig(): null {
        return null;
      }

      public render(): null {
        return null;
      }

      public registerCommands(commands: DocCommandBus): void {
        commands.register(PluginEchoCommand, createPluginEchoCommand);
      }
    }

    @Injectable()
    class DuplicateCommandPlugin extends DocPlugin<null> {
      public static readonly symbol = Symbol.for('DuplicateCommandPlugin');

      public constructor() {
        super({ key: new PluginKey('DuplicateCommandPlugin'), state: null });
      }

      public apply(): null {
        return null;
      }

      public registerState() {
        return { key: this.key, state: null };
      }

      public getPluginConfig(): null {
        return null;
      }

      public render(): null {
        return null;
      }

      public registerCommands(commands: DocCommandBus): void {
        commands.register(PluginEchoCommand, createPluginEchoCommand);
      }
    }

    expect(() =>
      createDocEditor({
        viewport: { width: 320, height: 180 },
        defaultPlugins: false,
        documentState: { document: createRichDocument('Alpha') },
        plugins: [FirstCommandPlugin, DuplicateCommandPlugin],
        adapters: {
          platform: HeadlessPlatform,
          createRenderContext() {
            return new MeasuredHeadlessRenderContext();
          },
          textInput: HeadlessTextInput,
          keyboardRouter: HeadlessKeyboardRouter,
          pointerCapture: HeadlessPointerCapture,
          registerEnvironment(editorContainer: Container) {
            container = editorContainer;
            editorContainer.registerInstance(WebKeyboardRouter.eventTargetSymbol, new EventTarget());
          },
        },
      }),
    ).toThrow(`DocCommandBus already has a command registered for ${PluginEchoCommand.id}.`);

    expect(() => container.resolve<DocCommandBus>(DocCommandBus.symbol)).toThrow(
      'No binding found for identifier Symbol(DocCommandBus)',
    );
  });

  it('warns when document plugins share the same priority depth', () => {
    createDocEditor({
      viewport: { width: 320, height: 180 },
      defaultPlugins: false,
      documentState: { document: createRichDocument('Alpha') },
      plugins: [DocContentRenderPlugin, DocDebugOverlayPlugin],
      adapters: {
        platform: HeadlessPlatform,
        createRenderContext() {
          return new MeasuredHeadlessRenderContext();
        },
        textInput: HeadlessTextInput,
        keyboardRouter: HeadlessKeyboardRouter,
        pointerCapture: HeadlessPointerCapture,
        registerEnvironment(editorContainer: Container) {
          container = editorContainer;
          editorContainer.registerInstance(WebKeyboardRouter.eventTargetSymbol, new EventTarget());
        },
      },
    }).destroy();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('runtime order will follow registration order'));
  });

  it('unregisters document plugin state, retained nodes, and event handlers', () => {
    const onMouseDown = jest.fn();
    let pluginKey!: PluginKey;
    let core!: SearCoreDoc;
    const RemoveRemovablePluginCommand = defineDocCommand<void>('doc.test.removeRemovablePlugin');

    @Injectable()
    class RemovablePlugin extends DocPlugin<{ readonly value: number }> {
      public static readonly symbol = Symbol.for('RemovablePlugin');

      public constructor() {
        super({ key: new PluginKey('RemovablePlugin'), state: { value: 0 } });
        pluginKey = this.key;
      }

      public apply(state: { readonly value: number }): { readonly value: number } {
        return state;
      }

      public registerState() {
        return { key: this.key, state: { value: 1 } };
      }

      public getPluginConfig(): null {
        return null;
      }

      public render(): Node<RichTextRenderNodeProperties> {
        return new ViewportOverlayNode({
          nodeKey: `${this.key.key}:overlay`,
          rect: { x: 0, y: 0, width: 10, height: 10 },
          drawOverlay: noopViewportOverlayDraw,
        });
      }

      public onMouseDown(): void {
        onMouseDown();
      }

      public registerCommands(commands: DocCommandBus): void {
        commands.register(RemoveRemovablePluginCommand, () => ({
          id: RemoveRemovablePluginCommand.id,
          execute(): DocCommandResult {
            return {
              pipeline: new Pipeline(RemoveRemovablePluginCommand.id).addLocalAction(
                RemoveRemovablePluginCommand.id,
                () => core.unregisterPlugin(pluginKey),
              ),
            };
          },
        }));
      }
    }

    const eventContext = new EventfulDocRenderContext();
    const editor = createDocEditor({
      viewport: { width: 320, height: 180 },
      defaultPlugins: false,
      documentState: { document: createRichDocument('Alpha') },
      plugins: [RemovablePlugin],
      adapters: {
        platform: HeadlessPlatform,
        createRenderContext() {
          return eventContext;
        },
        eventRegistrar: MouseDownDocEventRegistrar,
        textInput: HeadlessTextInput,
        keyboardRouter: HeadlessKeyboardRouter,
        pointerCapture: HeadlessPointerCapture,
        registerEnvironment(editorContainer: Container) {
          container = editorContainer;
          editorContainer.registerInstance(WebKeyboardRouter.eventTargetSymbol, new EventTarget());
        },
      },
    });

    core = container.resolve<SearCoreDoc>(SearCoreDoc.symbol);
    const sceneGraph = container.resolve<SceneGraph<RichTextRenderNodeProperties>>(SceneGraph.symbol);

    expect(core.getPlugin(pluginKey)).toEqual({ value: 1 });
    expect(sceneGraph.childKeys).toContain(`${pluginKey.key}:overlay`);

    expect(() => core.unregisterPlugin(pluginKey)).toThrow('editor.commands.run');
    editor.commands.run(RemoveRemovablePluginCommand, void 0);
    eventContext.listeners.get('mousedown')?.(new MouseEvent('mousedown') as EventWithOffset);

    expect(core.getPlugin(pluginKey)).toBe(void 0);
    expect(sceneGraph.childKeys).not.toContain(`${pluginKey.key}:overlay`);
    expect(onMouseDown).not.toHaveBeenCalled();

    editor.destroy();
  });

  it('contributes text style, table, and history commands through document plugins', () => {
    const renderContext = new RecordingDocRenderContext();
    const editor = createDocEditor({
      viewport: { width: 320, height: 180 },
      documentState: { document: createRichDocument('Alpha') },
      adapters: {
        platform: HeadlessPlatform,
        createRenderContext() {
          return renderContext;
        },
        textInput: HeadlessTextInput,
        keyboardRouter: RecordingDocKeyboardRouter,
        pointerCapture: HeadlessPointerCapture,
        registerEnvironment(editorContainer: Container) {
          container = editorContainer;
          editorContainer.registerInstance(WebKeyboardRouter.eventTargetSymbol, new EventTarget());
        },
      },
    });

    expect(editor.commands.getRegisteredCommandIds()).toEqual(
      expect.arrayContaining([
        SetDocFontFamilyCommand.id,
        SetDocFontSizeCommand.id,
        SetDocBoldCommand.id,
        ToggleDocBoldCommand.id,
        SetDocItalicCommand.id,
        ToggleDocItalicCommand.id,
        SetDocUnderlineCommand.id,
        ToggleDocUnderlineCommand.id,
        SetDocStrikethroughCommand.id,
        ToggleDocStrikethroughCommand.id,
        InsertDocTableCommand.id,
        UndoDocCommand.id,
        RedoDocCommand.id,
      ]),
    );

    let fontPipeline: Pipeline | undefined;
    const disposeCommandListener = editor.commands.subscribe((event) => {
      if (event.phase === CommandExecutionPhase.Completed && event.id === SetDocFontFamilyCommand.id) {
        fontPipeline = event.result?.pipeline;
      }
    });
    editor.commands.run(SelectAllDocCommand, void 0);
    editor.commands.run(SetDocFontFamilyCommand, { fontFamily: 'Noto Sans' });
    expect(renderContext.calls.some((call) => call.name === 'setFont' && call.args[0] === '16px Noto Sans')).toBe(true);
    const fontTransaction = fontPipeline?.steps.find((step) => step.transaction)?.transaction;
    expect(fontTransaction?.operations).toEqual([
      {
        p: [0, 0, 'textStyle'],
        ua: { value: { fontFamily: 'Noto Sans' }, prev: void 0 },
      },
    ]);
    expect(fontTransaction?.getMeta('docInput.replaceDocument')).toBeUndefined();
    disposeCommandListener();
    expect(editor.getDocument()[0].content[0].attrs).toEqual({ textStyle: { fontFamily: 'Noto Sans' } });

    capturedDocKeyboardHandlers?.onUndo?.();
    expect(editor.getDocument()[0].content[0].attrs).toEqual({});
    capturedDocKeyboardHandlers?.onRedo?.();
    expect(editor.getDocument()[0].content[0].attrs).toEqual({ textStyle: { fontFamily: 'Noto Sans' } });

    editor.commands.run(SelectAllDocCommand, void 0);
    capturedDocKeyboardHandlers?.onToggleBold?.();
    expect(editor.getDocument()[0].content[0].attrs).toEqual({
      textStyle: { fontFamily: 'Noto Sans', bold: true },
    });
    capturedDocKeyboardHandlers?.onToggleBold?.();
    expect(editor.getDocument()[0].content[0].attrs).toEqual({ textStyle: { fontFamily: 'Noto Sans' } });

    capturedDocKeyboardHandlers?.onToggleItalic?.();
    capturedDocKeyboardHandlers?.onToggleUnderline?.();
    capturedDocKeyboardHandlers?.onToggleStrikethrough?.();
    expect(editor.getDocument()[0].content[0].attrs).toEqual({
      textStyle: { fontFamily: 'Noto Sans', italic: true, underline: true, strikethrough: true },
    });
    capturedDocKeyboardHandlers?.onToggleItalic?.();
    capturedDocKeyboardHandlers?.onToggleUnderline?.();
    capturedDocKeyboardHandlers?.onToggleStrikethrough?.();
    expect(editor.getDocument()[0].content[0].attrs).toEqual({ textStyle: { fontFamily: 'Noto Sans' } });

    editor.commands.run(InsertDocTableCommand, { rows: 2, columns: 3 });
    expect(editor.getDocument()[1].type).toBe(TableNode.nodeType);
    expect(editor.getDocument()[1].content).toHaveLength(2);

    editor.commands.run(InsertDocTextCommand, { text: '!' });
    expect(editor.getText().startsWith('!')).toBe(true);
    editor.commands.run(UndoDocCommand, void 0);
    expect(editor.getText().startsWith('!')).toBe(false);
    editor.commands.run(RedoDocCommand, void 0);
    expect(editor.getText().startsWith('!')).toBe(true);

    editor.destroy();
  });

  it('allows default document feature plugins to be removed from one editor instance', () => {
    const editor = createDocEditor({
      viewport: { width: 320, height: 180 },
      defaultPlugins: false,
      documentState: { document: createRichDocument('Alpha') },
      adapters: {
        platform: HeadlessPlatform,
        createRenderContext() {
          return new MeasuredHeadlessRenderContext();
        },
        textInput: HeadlessTextInput,
        keyboardRouter: HeadlessKeyboardRouter,
        pointerCapture: HeadlessPointerCapture,
        registerEnvironment(editorContainer: Container) {
          container = editorContainer;
          editorContainer.registerInstance(WebKeyboardRouter.eventTargetSymbol, new EventTarget());
        },
      },
    });

    expect(editor.getText()).toBe('Alpha');
    expect(editor.commands.getRegisteredCommandIds()).not.toContain(InsertDocTextCommand.id);

    editor.destroy();
  });

  it('isolates two live document editors and destroys them independently', () => {
    let firstContainer: Container | undefined;
    let secondContainer: Container | undefined;
    const first = createDocEditor({
      viewport: { width: 320, height: 180 },
      documentState: { document: createRichDocument('First') },
      adapters: createDefaultDocAdapters((editorContainer) => {
        firstContainer = editorContainer;
      }),
    });
    const second = createDocEditor({
      viewport: { width: 320, height: 180 },
      documentState: { document: createRichDocument('Second') },
      adapters: createDefaultDocAdapters((editorContainer) => {
        secondContainer = editorContainer;
      }),
    });

    expect(firstContainer).toBeDefined();
    expect(secondContainer).toBeDefined();
    expect(firstContainer).not.toBe(secondContainer);
    expect(firstContainer!.resolve(SearCoreDoc.symbol)).not.toBe(secondContainer!.resolve(SearCoreDoc.symbol));
    expect(firstContainer!.resolve(DocCommandBus.symbol)).not.toBe(secondContainer!.resolve(DocCommandBus.symbol));
    expect(firstContainer!.resolve(SessionStateRegistry.symbol)).not.toBe(
      secondContainer!.resolve(SessionStateRegistry.symbol),
    );
    expect(first.services.require(DocRuntimeCapability.LayoutService)).toBe(
      firstContainer!.resolve(DocRenderLayoutService.symbol),
    );
    expect(first.services.require(DocRuntimeCapability.LayoutService)).not.toBe(
      second.services.require(DocRuntimeCapability.LayoutService),
    );

    first.commands.run(InsertDocTextCommand, { text: '1' });
    expect(first.getText()).toBe('1First');
    expect(second.getText()).toBe('Second');

    first.destroy();
    expect(() => first.services.require(DocRuntimeCapability.LayoutService)).toThrow(
      'Runtime capability registry for DocEditor has been destroyed.',
    );
    second.commands.run(InsertDocTextCommand, { text: '2' });
    second.render();

    expect(second.getText()).toBe('2Second');
    expect(second.commands.run(CaptureDocSessionStateCommand, void 0).sessionState['doc.history']).toBeDefined();
    second.destroy();
  });

  it('restores document and session state across remounts with undo and redo semantics intact', () => {
    let firstContainer: Container | undefined;
    const initialDocument = createRichDocument(...Array.from({ length: 40 }, (_, index) => `Paragraph ${index}`));
    const first = createDocEditor({
      viewport: { width: 120, height: 60 },
      documentState: { document: initialDocument },
      adapters: createDefaultDocAdapters((editorContainer) => {
        firstContainer = editorContainer;
      }),
    });

    setCollapsedDocSelection(first.commands, 2, 2);
    const beforeEdit = first.commands.run(ExportDocStateCommand, void 0).documentState;
    first.commands.run(InsertDocTextCommand, { text: '!' });
    first.commands.run(ScrollDocViewportToCommand, { x: 0, y: 24 });
    const documentState = first.commands.run(ExportDocStateCommand, void 0).documentState;
    const sessionState = first.commands.run(CaptureDocSessionStateCommand, void 0).sessionState;
    const capturedSelection = readSessionState(sessionState, DocSelectionSessionStateDefinition);
    const capturedViewport = readSessionState(sessionState, DocViewportSessionStateDefinition);
    first.destroy();

    const other = createDocEditor({
      viewport: { width: 120, height: 60 },
      documentState: { document: createRichDocument('Other') },
      adapters: createDefaultDocAdapters(),
    });
    expect(other.observations.getSnapshot(DocHistoryStatusObservation)).toEqual({
      canUndo: false,
      canRedo: false,
    });
    other.destroy();

    const remounted = createDocEditor({
      viewport: { width: 120, height: 60 },
      documentState,
      sessionState,
      adapters: createDefaultDocAdapters(),
    });

    expect(remounted.getDocument()).toEqual(documentState.document);
    expect(remounted.observations.getSnapshot(DocSelectionObservation)).toEqual(capturedSelection);
    expect(remounted.observations.getSnapshot(DocViewportObservation)).toEqual(capturedViewport);
    expect(remounted.observations.getSnapshot(DocHistoryStatusObservation)).toEqual({
      canUndo: true,
      canRedo: false,
    });

    remounted.commands.run(UndoDocCommand, void 0);
    expect(remounted.getDocument()).toEqual(beforeEdit.document);
    expect(remounted.observations.getSnapshot(DocHistoryStatusObservation)).toEqual({
      canUndo: false,
      canRedo: true,
    });
    remounted.commands.run(RedoDocCommand, void 0);
    expect(remounted.getDocument()).toEqual(documentState.document);
    remounted.destroy();
  });

  it('captures third-party session contributors, preserves unknown entries, and honors restore dependencies', () => {
    const earlyState = defineSessionState<{ readonly value: string }>('doc.test.session.early');
    const lateState = defineSessionState<{ readonly value: string }>('doc.test.session.late');
    const restoreOrder: string[] = [];

    @Injectable()
    class SessionContributorPlugin extends DocPlugin<null> {
      public static readonly symbol = Symbol.for('SessionContributorPlugin');
      private early = { value: 'default-early' };
      private late = { value: 'default-late' };

      public constructor() {
        super({ key: new PluginKey('SessionContributorPlugin'), state: null });
      }

      public registerSessionState(registry: SessionStateRegistry): void {
        registry.register(lateState, {
          restorePhase: SessionStateRestorePhase.BeforeInitialize,
          restoreAfter: [earlyState],
          capture: () => ({ ...this.late }),
          restore: (state) => {
            this.late = { ...state };
            restoreOrder.push('late');
          },
        });
        registry.register(earlyState, {
          restorePhase: SessionStateRestorePhase.BeforeInitialize,
          capture: () => ({ ...this.early }),
          restore: (state) => {
            this.early = { ...state };
            restoreOrder.push('early');
          },
        });
      }

      public registerState() {
        return { key: this.key, state: null };
      }

      public apply(): null {
        return null;
      }

      public getPluginConfig(): null {
        return null;
      }

      public render(): null {
        return null;
      }
    }

    const editor = createDocEditor({
      viewport: { width: 320, height: 180 },
      documentState: { document: createRichDocument('Alpha') },
      sessionState: {
        [lateState.id]: { value: 'restored-late' },
        [earlyState.id]: { value: 'restored-early' },
        'doc.test.session.unclaimed': { retained: true },
      },
      plugins: [SessionContributorPlugin],
      adapters: createDefaultDocAdapters(),
    });
    const captured = editor.commands.run(CaptureDocSessionStateCommand, void 0).sessionState;

    expect(restoreOrder).toEqual(['early', 'late']);
    expect(readSessionState(captured, earlyState)).toEqual({ value: 'restored-early' });
    expect(readSessionState(captured, lateState)).toEqual({ value: 'restored-late' });
    expect(captured['doc.test.session.unclaimed']).toEqual({ retained: true });
    editor.destroy();
  });

  it('records committed third-party document transactions and ignores failed pipelines', () => {
    @Injectable()
    class ThirdPartyMutationPlugin extends DocPlugin<null> {
      public static readonly symbol = Symbol.for('ThirdPartyMutationPlugin');
      private runtime: DocPluginRuntime | null = null;

      public constructor() {
        super({ key: new PluginKey('ThirdPartyMutationPlugin'), state: null });
      }

      public configure(context: DocPluginSetupContext): void {
        this.runtime = context.runtime;
      }

      public registerCommands(commands: DocCommandBus): void {
        commands.register(ThirdPartyInsertDocCommand, () => this.createInsertCommand(false));
        commands.register(FailingThirdPartyInsertDocCommand, () => this.createInsertCommand(true));
      }

      public registerState() {
        return { key: this.key, state: null };
      }

      public apply(): null {
        return null;
      }

      public getPluginConfig(): null {
        return null;
      }

      public render(): null {
        return null;
      }

      private createInsertCommand(failAfterStaging: boolean) {
        const runtime = this.runtime;
        if (!runtime) throw new Error('ThirdPartyMutationPlugin is not configured.');
        const id = failAfterStaging ? FailingThirdPartyInsertDocCommand.id : ThirdPartyInsertDocCommand.id;
        return {
          id,
          execute(): DocCommandResult {
            const pipeline = new Pipeline(id);
            pipeline.addTransaction(id, runtime.document.input.createInputTransaction(failAfterStaging ? '?' : '!'));
            if (failAfterStaging) {
              pipeline.addLocalAction(`${id}:fail`, function failThirdPartyPipeline(): void {
                throw new Error('third-party pipeline failed');
              });
            }
            return { pipeline };
          },
        };
      }
    }

    const editor = createDocEditor({
      viewport: { width: 320, height: 180 },
      documentState: { document: createRichDocument('Alpha') },
      plugins: [ThirdPartyMutationPlugin],
      adapters: createDefaultDocAdapters(),
    });

    editor.commands.run(ThirdPartyInsertDocCommand, void 0);
    expect(editor.getText()).toBe('!Alpha');
    expect(editor.observations.getSnapshot(DocHistoryStatusObservation)).toEqual({
      canUndo: true,
      canRedo: false,
    });

    expect(() => editor.commands.run(FailingThirdPartyInsertDocCommand, void 0)).toThrow('third-party pipeline failed');
    expect(editor.getText()).toBe('!Alpha');
    expect(editor.observations.getSnapshot(DocHistoryStatusObservation)).toEqual({
      canUndo: true,
      canRedo: false,
    });

    editor.commands.run(UndoDocCommand, void 0);
    expect(editor.getText()).toBe('Alpha');
    editor.destroy();
  });

  it('rejects retained Doc input state writes outside the owning command bus', () => {
    let input: DocInputPlugin | null = null;
    let cursor: DocCursorManager | null = null;
    let history: HistoryPlugin | null = null;
    let historyContext: DocPluginSetupContext | null = null;
    const retainedHistorySession = new SessionStateRegistry();
    @Injectable()
    class RetainedInputPlugin extends DocPlugin<null> {
      public static readonly symbol = Symbol('RetainedInputPlugin');
      public constructor() {
        super({ key: new PluginKey('RetainedInputPlugin'), state: null });
      }
      public configure(context: DocPluginSetupContext): void {
        input = context.runtime.document.input;
        cursor = context.runtime.document.cursor;
        history = context.container.resolve<HistoryPlugin>(HistoryPlugin.symbol);
        historyContext = context;
        history.registerSessionState(retainedHistorySession);
      }
      public registerState() { return { key: this.key, state: null }; }
      public apply(): null { return null; }
      public getPluginConfig(): null { return null; }
      public render(): null { return null; }
    }
    const resetBypass = defineDocCommand<void>('test.resetDocSessionBypass');
    let unregisterResetBypass: (() => void) | undefined;
    const editor = createDocEditor({
      viewport: { width: 320, height: 180 },
      documentState: { document: createRichDocument('Alpha') },
      plugins: [RetainedInputPlugin],
      adapters: createDefaultDocAdapters(),
      onCreated: ({ commands }) => {
        unregisterResetBypass = commands.register(resetBypass, () => ({
          id: resetBypass.id,
          execute: () => ({
            pipeline: new Pipeline(resetBypass.id).addLocalAction(resetBypass.id, () => input!.resetSession([])),
          }),
        }));
      },
    });
    try {
      const retainedState = input!.session;
      expect(() => { (retainedState.pendingDoc[0]!.content[0] as TextNode).text = 'changed'; }).toThrow();
      expect(() => { retainedState.docSelection.anchor.offset = 4; }).toThrow();
      expect(() => input!.resetSession([])).toThrow('editor.commands.run');
      expect(() => input!.setLastSnapshot({ lines: [] })).toThrow('editor.commands.run');
      expect(() => input!.restoreSelection(retainedState.docSelection)).toThrow('editor.commands.run');
      expect(() => input!.handleInput('?')).toThrow('command pipeline');
      expect(() => input!.setState(retainedState)).toThrow();
      expect((input as unknown as Record<string, unknown>)['replaceSessionState']).toBeUndefined();
      expect(() => editor.commands.register(defineDocCommand<void>('test.lateDocCommand'), () => ({
        id: 'test.lateDocCommand', execute: () => ({ pipeline: new Pipeline('test.lateDocCommand') }),
      }))).toThrow('editor.commands.run');
      expect(() => unregisterResetBypass!()).toThrow('editor.commands.run');
      expect(() => editor.commands.destroy()).toThrow('editor.commands.run');
      expect(() => editor.commands.run(resetBypass, void 0)).toThrow('RichDocOT transaction');
      editor.render();
      const retainedLayout = input!.getLastSnapshot();
      expect(retainedLayout?.lines.length).toBeGreaterThan(0);
      expect(() => { retainedLayout!.lines[0].x = 999; }).toThrow();
      expect(() => { retainedLayout!.lines[0].textNodePath[0] = 99; }).toThrow();
      expect(() => cursor!.setCursor({ x: 5, y: 5, height: 10, visible: true }))
        .toThrow('editor.commands.run');
      expect(() => cursor!.getSelectionRects().push({ x: 0, y: 0, width: 1, height: 1 })).toThrow();
      expect(editor.getText()).toBe('Alpha');

      const documentBeforeSelection = input!.session.pendingDoc;
      const historyListenerAuthority: boolean[] = [];
      history!.subscribe(() => {
        historyListenerAuthority.push(editor.commands.isExecuting());
        throw new Error('listener failed');
      });
      editor.commands.run(SetDocSelectionCommand, {
        selection: {
          anchor: { path: [0, 0], offset: 0 },
          head: { path: [0, 0], offset: 0 },
        },
      });
      expect(input!.session.pendingDoc).toBe(documentBeforeSelection);
      editor.commands.run(InsertDocTextCommand, { text: '!' });
      expect(editor.getText()).toBe('!Alpha');
      expect(historyListenerAuthority).toContain(false);
      expect(() => { (input!.session.pendingDoc[0]!.content[0] as TextNode).text = 'changed'; }).toThrow();
      expect(history!.getState()).toBeNull();
      expect(history!.getStatus().canUndo).toBe(true);
      expect(() => history!.configure(historyContext!)).toThrow('already configured');
      expect(() => history!.registerSessionState(new SessionStateRegistry())).toThrow('restoration is closed');
      retainedHistorySession.loadSnapshot({ 'doc.history': { undoStack: [], redoStack: [] } });
      expect(() => retainedHistorySession.restorePhase(SessionStateRestorePhase.BeforeInitialize))
        .toThrow('restoration is closed');
      Object.assign(history!, { runtime: { commands: { isExecuting: () => true } } });
      expect(() => history!.onTransactionCommitted(createTransaction(DocInputPlugin.pluginKey)))
        .toThrow('editor.commands.run');
      expect(history!.getStatus().canUndo).toBe(true);
    } finally {
      editor.destroy();
    }
  });

  it('rejects retained Doc Core snapshot loading outside the command bus', () => {
    let core: SearCoreDoc | null = null;
    @Injectable()
    class RetainedCorePlugin extends DocPlugin<null> {
      public static readonly symbol = Symbol('RetainedCorePlugin');
      public constructor() {
        super({ key: new PluginKey('RetainedCorePlugin'), state: null });
      }
      public configure(context: DocPluginSetupContext): void {
        core = context.runtime.document.core;
      }
      public registerState() { return { key: this.key, state: null }; }
      public apply(): null { return null; }
      public getPluginConfig(): null { return null; }
      public render(): null { return null; }
    }
    const bypassCommand = defineDocCommand<void>('test.loadDocSnapshotBypass');
    const editor = createDocEditor({
      viewport: { width: 320, height: 180 },
      documentState: { document: createRichDocument('Alpha') },
      plugins: [RetainedCorePlugin],
      adapters: createDefaultDocAdapters(),
      onCreated: ({ commands }) => commands.register(bypassCommand, () => ({
        id: bypassCommand.id,
        execute: () => {
          const pipeline = new Pipeline(bypassCommand.id);
          pipeline.addLocalAction(bypassCommand.id, () => { core!.loadSnapshot(createRichDocument('Bypass')); });
          return { pipeline };
        },
      })),
    });
    try {
      const before = core!.exportSnapshot();
      expect(() => core!.loadSnapshot(createRichDocument('Bypass'))).toThrow('RichDocOT command transaction');
      expect(() => core!.requestDocRender(DocCaretPluginKey)).toThrow('editor.commands.run');
      expect(() => core!.setDocRenderLayoutState(null)).toThrow('editor.commands.run');
      expect(() => core!.destroy()).toThrow('editor owner');
      expect(() => { (core as unknown as { blockManager: unknown }).blockManager = {}; }).toThrow();
      expect(() => { (core as unknown as { eventEngine: unknown }).eventEngine = {}; }).toThrow();
      const retainedPlugin = core!.getPluginInstance(new PluginKey('RetainedCorePlugin'))!;
      expect(() => { (retainedPlugin as unknown as { apply: unknown }).apply = () => null; }).toThrow();
      expect(() => core!.blockManager.clear()).toThrow('editor.commands.run');
      expect(() => core!.blockManager.setBaseFont('20px sans-serif')).toThrow('editor.commands.run');
      expect((core as unknown as Record<string, unknown>)['document']).toBeUndefined();
      editor.render();
      const retainedLayout = core!.getDocRenderLayoutState();
      expect(retainedLayout).not.toBeNull();
      expect(() => { (retainedLayout!.viewport as { width: number }).width = 1; }).toThrow();
      expect(() => { retainedLayout!.layoutCache.snapshot.lines[0].x = 999; }).toThrow();
      expect(() => { (retainedLayout!.visibleBlocks as unknown[]).push({}); }).toThrow();
      expect(() => editor.commands.run(bypassCommand, void 0)).toThrow('RichDocOT command transaction');
      expect(core!.exportSnapshot()).toEqual(before);
      const materialized = core!.materializeSnapshot(createRichDocument('Detached'));
      expect(core!.exportSnapshot(materialized)).toEqual(createRichDocument('Detached'));
      expect(core!.exportSnapshot()).toEqual(before);
      expect(editor.getText()).toBe('Alpha');
    } finally {
      editor.destroy();
    }
  });

  it('rejects retained Doc caret state writes outside the owning command bus', () => {
    let caret: DocCaretState | null = null;
    @Injectable()
    class RetainedCaretPlugin extends DocPlugin<null> {
      public static readonly symbol = Symbol('RetainedCaretPlugin');
      public constructor() {
        super({ key: new PluginKey('RetainedCaretPlugin'), state: null });
      }
      public configure(context: DocPluginSetupContext): void {
        caret = context.container.resolve<DocCaretState>(DocCaretState.symbol);
      }
      public registerState() { return { key: this.key, state: null }; }
      public apply(): null { return null; }
      public getPluginConfig(): null { return null; }
      public render(): null { return null; }
    }
    const editor = createDocEditor({
      viewport: { width: 320, height: 180 },
      documentState: { document: createRichDocument('Alpha') },
      plugins: [RetainedCaretPlugin],
      adapters: createDefaultDocAdapters(),
    });
    try {
      expect(caret!.isVisible()).toBe(true);
      expect(() => caret!.setVisible(false)).toThrow('editor.commands.run');
      expect(() => caret!.toggle()).toThrow('editor.commands.run');
      expect(() => caret!.reset()).toThrow('editor.commands.run');
      expect(caret!.isVisible()).toBe(true);
    } finally {
      editor.destroy();
    }
  });

  it('rejects retained Doc composition writes outside the owning command bus', () => {
    let composition: DocCompositionManager | null = null;
    @Injectable()
    class RetainedCompositionPlugin extends DocPlugin<null> {
      public static readonly symbol = Symbol('RetainedCompositionPlugin');
      public constructor() {
        super({ key: new PluginKey('RetainedCompositionPlugin'), state: null });
      }
      public configure(context: DocPluginSetupContext): void {
        composition = context.container.resolve<DocCompositionManager>(DocCompositionManager.symbol);
      }
      public registerState() { return { key: this.key, state: null }; }
      public apply(): null { return null; }
      public getPluginConfig(): null { return null; }
      public render(): null { return null; }
    }
    const editor = createDocEditor({
      viewport: { width: 320, height: 180 },
      documentState: { document: createRichDocument('Alpha') },
      plugins: [RetainedCompositionPlugin],
      adapters: createDefaultDocAdapters(),
    });
    try {
      expect(() => composition!.setText('bypass')).toThrow('editor.commands.run');
      expect(composition!.getText()).toBe('');
      editor.commands.run(SetDocCompositionCommand, { text: 'typed', caretOffset: 5 });
      expect(composition!.getText()).toBe('typed');
      expect(() => composition!.clear()).toThrow('editor.commands.run');
      expect(composition!.getText()).toBe('typed');
      editor.commands.run(ClearDocCompositionCommand, void 0);
      expect(composition!.getText()).toBe('');
    } finally {
      editor.destroy();
    }
  });

  it('rejects retained Doc observation and capability registry writes', () => {
    const observation = defineStateObservation<number>('test.doc.registryGuard');
    const capability = defineDocRuntimeCapability<number>('test.doc.registryGuard');
    let extensions: DocPluginSetupContext['runtime']['extensions'] | null = null;
    @Injectable()
    class RetainedRegistriesPlugin extends DocPlugin<null> {
      public static readonly symbol = Symbol('RetainedRegistriesPlugin');
      public constructor() { super({ key: new PluginKey('RetainedRegistriesPlugin'), state: null }); }
      public configure(context: DocPluginSetupContext): void { extensions = context.runtime.extensions; }
      public registerState() { return { key: this.key, state: null }; }
      public apply(): null { return null; }
      public getPluginConfig(): null { return null; }
      public render(): null { return null; }
    }
    const editor = createDocEditor({
      viewport: { width: 320, height: 180 },
      documentState: { document: createRichDocument('Alpha') },
      plugins: [RetainedRegistriesPlugin],
      adapters: createDefaultDocAdapters(),
    });
    try {
      expect(() => editor.observations.register(observation, {
        getSnapshot: () => 1, subscribe: () => () => void 0,
      })).toThrow('editor.commands.run');
      expect(() => extensions!.register(capability, 1)).toThrow('editor.commands.run');
      expect(() => editor.observations.destroy()).toThrow('editor.commands.run');
      expect(() => extensions!.destroy()).toThrow('editor.commands.run');
      expect(editor.getText()).toBe('Alpha');
    } finally {
      editor.destroy();
    }
  });

  it('rejects retained Doc input binding writes after editor startup', () => {
    let bindings: DocInputBindingRegistryCapability | undefined;
    let dispose: (() => void) | null = null;
    @Injectable()
    class RetainedInputBindingsPlugin extends DocPlugin<null> {
      public static readonly symbol = Symbol('RetainedInputBindingsPlugin');
      public constructor() { super({ key: new PluginKey('RetainedInputBindingsPlugin'), state: null }); }
      public configure(context: DocPluginSetupContext): void {
        bindings = context.runtime.extensions.get(DocPluginRuntimeCapability.InputBindings);
        dispose = bindings!.registerTextHandlers({ onDelete: () => void 0 });
      }
      public registerState() { return { key: this.key, state: null }; }
      public apply(): null { return null; }
      public getPluginConfig(): null { return null; }
      public render(): null { return null; }
    }
    const editor = createDocEditor({
      viewport: { width: 320, height: 180 },
      documentState: { document: createRichDocument('Alpha') },
      plugins: [RetainedInputBindingsPlugin],
      adapters: createDefaultDocAdapters(),
    });
    try {
      expect(() => bindings!.registerTextHandlers({ onDelete: () => void 0 })).toThrow('editor.commands.run');
      expect(() => dispose!()).toThrow('editor.commands.run');
      expect(editor.getText()).toBe('Alpha');
    } finally {
      editor.destroy();
    }
  });

  it('keeps Doc input listeners under editor lifecycle ownership', () => {
    let inputLifecycle: DocInputAdapterLifecycle | undefined;
    let viewportEnvironment: DocViewportEnvironment | undefined;
    let renderCoordinator: DocRenderCoordinator | undefined;
    let scrollManager: ScrollManager | undefined;
    let eventEngine: EventEngine<RichTextRenderNodeProperties> | undefined;

    @Injectable()
    class RetainInputLifecyclePlugin extends DocPlugin<null> {
      public static readonly symbol = Symbol('RetainInputLifecyclePlugin');
      public constructor() { super({ key: new PluginKey('RetainInputLifecyclePlugin'), state: null }); }
      public configure(context: DocPluginSetupContext): void {
        inputLifecycle = context.container.resolve<DocInputAdapterLifecycle>(DocInputAdapterLifecycle.symbol);
        viewportEnvironment = context.container.resolve<DocViewportEnvironment>(DocViewportEnvironment.symbol);
        renderCoordinator = context.container.resolve<DocRenderCoordinator>(DocRenderCoordinator.symbol);
        scrollManager = context.container.resolve<ScrollManager>(ScrollManager.symbol);
        eventEngine = context.runtime.events.engine;
      }
      public registerState() { return { key: this.key, state: null }; }
      public apply(): null { return null; }
      public getPluginConfig(): null { return null; }
      public render(): null { return null; }
    }

    const editor = createDocEditor({
      viewport: { width: 320, height: 180 },
      documentState: { document: createRichDocument('Alpha') },
      plugins: [RetainInputLifecyclePlugin],
      adapters: createDefaultDocAdapters(),
    });
    expect(() => inputLifecycle!.destroy()).toThrow('editor owner');
    expect(() => viewportEnvironment!.destroy()).toThrow('editor owner');
    expect(() => renderCoordinator!.destroy()).toThrow('editor owner');
    expect(() => scrollManager!.destroy()).toThrow('editor owner');
    expect(() => eventEngine!.off()).toThrow('editor.commands.run');
    expect(() => eventEngine!.destroy()).toThrow('editor owner');
    expect(() => renderCoordinator!.renderViewportScrollFrame()).toThrow('editor.commands.run');
    expect(editor.getText()).toBe('Alpha');
    editor.destroy();
    expect(() => inputLifecycle!.start()).toThrow('destroyed');
    expect(() => viewportEnvironment!.start()).toThrow('destroyed');
    expect(() => renderCoordinator!.bind()).toThrow('destroyed');
  });
});
