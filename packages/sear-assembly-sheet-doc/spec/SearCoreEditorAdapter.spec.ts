import { HeadlessRenderContext } from '@searsuite/sear-render-context';
import { defineStateObservation } from '@searsuite/sear-foundation-subscription';
import {
  BoldTextStyleKey,
  ItalicTextStyleKey,
  UnderlineTextStyleKey,
  StrikethroughTextStyleKey,
} from '@searsuite/sear-assembly-doc';
import { createSheetEmbeddedSearCoreEditor } from '../src';
import type { SheetEmbeddedEditorPlugin, SheetEmbeddedEditorPluginContext } from '@searsuite/sear-assembly-doc';
import type { SheetEmbeddedEditorView } from '../src';
import { SearCoreEditorRuntime } from '../src/SearCoreEditorRuntime';
import {
  SheetEmbeddedEditHistoryObservation,
  SheetEmbeddedInlineStyleObservation,
  type SheetDocument,
  type SheetEmbeddedEditorContext,
  type SheetEmbeddedInlineStyleState,
} from '@searsuite/sear-sheet-editor-contract';

class RecordingRenderContext extends HeadlessRenderContext {
  public readonly fonts: string[] = [];
  public readonly text: string[] = [];
  public strokes = 0;

  public override setFont(font: string): void {
    this.fonts.push(font);
  }

  public override fillText(value: string, _x: number, _y: number): void {
    this.text.push(value);
  }

  public override stroke(): void {
    this.strokes += 1;
  }
}

function createContext(
  renderContext: RecordingRenderContext,
  document: SheetDocument,
  commit: (document: SheetDocument) => void = jest.fn(),
  defaultFontSize?: number,
  defaultFontFamily?: string,
): SheetEmbeddedEditorContext {
  return {
    renderContext,
    defaultFontSize,
    defaultFontFamily,
    geometry: {
      cellRect: { x: 10, y: 20, width: 120, height: 30 },
      clipRect: { x: 10, y: 20, width: 120, height: 30 },
      toLocalPoint: (point) => ({ x: point.x - 10, y: point.y - 20 }),
      toSheetPoint: (point) => ({ x: point.x + 10, y: point.y + 20 }),
    },
    documentAccessor: { read: () => document, commit },
  };
}

const document: SheetDocument = [
  {
    type: 'paragraph',
    content: [{ type: 'text', text: 'Sheet', attrs: { textStyle: { fontFamily: 'Georgia' } } }],
  },
];

describe('SearCoreEditorAdapter', () => {
  it('INT15-015 measures rich text with its inline font styles without changing the document', () => {
    const context = new RecordingRenderContext();
    context.measureText = jest.fn((text) => ({
      width:
        text.length *
        (context.fonts.at(-1)?.includes('20px ') ? 20 : context.fonts.at(-1)?.startsWith('bold ') ? 12 : 10),
      height: 12,
      fontAscent: 10,
      fontDescent: 2,
    }));
    const editor = createSheetEmbeddedSearCoreEditor();
    editor.initialize(createContext(context, document));
    const regular: SheetDocument = [{ type: 'paragraph', content: [{ type: 'text', text: 'MMMM' }] }];
    const bold: SheetDocument = [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'MMMM', attrs: { textStyle: { bold: true } } }],
      },
    ];
    const mixed: SheetDocument = [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'M' },
          { type: 'text', text: 'M', attrs: { textStyle: { bold: true } } },
          { type: 'text', text: 'M', attrs: { textStyle: { fontSize: 20 } } },
        ],
      },
    ];
    try {
      expect(editor.measureUnwrapped(regular, '10px sans-serif').width).toBe(40);
      expect(editor.measureUnwrapped(bold, '10px sans-serif').width).toBe(48);
      expect(editor.measureUnwrapped(mixed, '10px sans-serif').width).toBe(42);
      expect(bold[0]?.content?.[0]?.attrs).toEqual({ textStyle: { bold: true } });
    } finally {
      editor.dispose();
    }
  });

  it('seals embedded plugin and rich-text contribution registration after command binding', () => {
    const runtime = new SearCoreEditorRuntime(
      {
        ...createContext(new RecordingRenderContext(), document),
        isCommandExecuting: () => false,
      },
      {},
    );
    try {
      expect(() => runtime.sheetPlugins.register({ key: 'test.late' })).toThrow('editor.commands.run');
      expect(() => runtime.inlineStyles.register({ key: 'test.late' })).toThrow('editor.commands.run');
      expect(() => runtime.lineBoxes.register({ key: 'test.late', resolve: (input) => input.lineBox })).toThrow(
        'editor.commands.run',
      );
      expect(() => runtime.runRenderRegistry.register({ key: 'test.late' })).toThrow('editor.commands.run');
    } finally {
      runtime.destroy();
    }
  });

  it('installs embedded write boundaries even when retained instances spoof their guard methods', () => {
    const context = createContext(new RecordingRenderContext(), document);
    const runtime = new SearCoreEditorRuntime(context, {});
    const bypass = jest.fn();
    runtime.core.enforceCommandBoundary = bypass;
    runtime.core.pluginManager.enforceWriteBoundary = bypass;
    runtime.sheetPlugins.enforceWriteBoundary = bypass;
    runtime.inlineStyles.enforceWriteBoundary = bypass;
    runtime.runRenderRegistry.enforceWriteBoundary = bypass;
    runtime.lineBoxes.enforceWriteBoundary = bypass;
    runtime.core.blockManager.enforceCommandBoundary = bypass;
    runtime.cursor.enforceCommandBoundary = bypass;
    runtime.composition.enforceCommandBoundary = bypass;

    SearCoreEditorRuntime.prototype.enforceCommandBoundary.call(runtime, () => false);
    try {
      expect(bypass).not.toHaveBeenCalled();
      expect(() => runtime.core.pluginManager.unregisterPlugin(runtime.input.key)).toThrow('owning runtime');
      expect(() => runtime.sheetPlugins.register({ key: 'test.late' })).toThrow('editor.commands.run');
      expect(() => runtime.inlineStyles.register({ key: 'test.late' })).toThrow('editor.commands.run');
      expect(() => runtime.lineBoxes.register({ key: 'test.late', resolve: (input) => input.lineBox })).toThrow(
        'editor.commands.run',
      );
      expect(() => runtime.runRenderRegistry.register({ key: 'test.late' })).toThrow('editor.commands.run');
      expect(() => runtime.core.blockManager.clear()).toThrow('editor.commands.run');
      expect(() => runtime.cursor.setCursor({ x: 0, y: 0, height: 1, visible: true })).toThrow('editor.commands.run');
      expect(() => runtime.composition.setText('forged')).toThrow('editor.commands.run');
      expect(() => runtime.core.destroy()).toThrow('editor owner');
    } finally {
      runtime.destroy();
    }
  });

  it('seals embedded observations even when their guard method is replaced before initialization', () => {
    const editor = createSheetEmbeddedSearCoreEditor();
    const bypass = jest.fn();
    editor.observations.enforceWriteBoundary = bypass;
    editor.initialize({
      ...createContext(new RecordingRenderContext(), document),
      isCommandExecuting: () => false,
    });
    try {
      expect(bypass).not.toHaveBeenCalled();
      expect(() =>
        editor.observations.register(defineStateObservation<number>('test.spoofed'), {
          getSnapshot: () => 0,
          subscribe: () => () => {},
        }),
      ).toThrow('editor.commands.run');
    } finally {
      editor.dispose();
    }
  });

  it('requires Sheet command dispatch for active edit-session mutations', () => {
    let executing = false;
    const context = {
      ...createContext(new RecordingRenderContext(), document),
      isCommandExecuting: () => executing,
    };
    const editor = createSheetEmbeddedSearCoreEditor();
    editor.initialize(context);
    try {
      const extraObservation = defineStateObservation<number>('test.embedded.extra');
      expect(() =>
        editor.observations.register(extraObservation, {
          getSnapshot: () => 0,
          subscribe: () => () => {},
        }),
      ).toThrow('editor.commands.run');
      const renderSession = editor.createRenderSession(context);
      expect((renderSession as unknown as Record<string, unknown>)['runtime']).toBeUndefined();
      renderSession.dispose();
      const unguardedContext = createContext(new RecordingRenderContext(), document);
      expect(() => editor.createEditSession(unguardedContext)).toThrow('creation must run through a command');
      executing = true;
      const session = editor.createEditSession(unguardedContext);
      expect((editor as unknown as Record<string, unknown>)['runtime']).toBeUndefined();
      expect((session as unknown as Record<string, unknown>)['runtime']).toBeUndefined();
      expect((session as unknown as Record<string, unknown>)['history']).toBeUndefined();
      session.setInlineStyle({ attrs: { [BoldTextStyleKey.Bold]: true } });
      const typingStyle = (session as unknown as { getTypingStyle(): Record<string, unknown> }).getTypingStyle();
      typingStyle[BoldTextStyleKey.Bold] = false;
      expect(
        (session as unknown as { getTypingStyle(): Record<string, unknown> }).getTypingStyle()[BoldTextStyleKey.Bold],
      ).toBe(true);
      const inputStyle = { customStyle: { value: 'original' } };
      session.setInlineStyle({ attrs: inputStyle });
      inputStyle.customStyle.value = 'forged';
      expect(
        (session as unknown as { getTypingStyle(): Record<string, unknown> }).getTypingStyle()['customStyle'],
      ).toEqual({
        value: 'original',
      });
      executing = false;
      expect(() => session.handleInput({ type: 'insertText', text: 'x' })).toThrow('must run through a command');
      expect(() =>
        session.setSelection({
          anchor: { path: [0, 0], offset: 0 },
          head: { path: [0, 0], offset: 0 },
        }),
      ).toThrow('must run through a command');
      expect(() => session.setInlineStyle({ attrs: { [BoldTextStyleKey.Bold]: false } })).toThrow(
        'must run through a command',
      );
      expect(() => session.commit()).toThrow('must run through a command');
      expect(() => session.cancel()).toThrow('must run through a command');
      expect(() => session.dispose()).toThrow('editor.commands.run');
      expect(JSON.stringify(session.getDocument())).toContain('Sheet');
    } finally {
      editor.dispose();
    }
  });

  it('requires the owning Sheet to dispose a bound embedded editor', () => {
    const editor = createSheetEmbeddedSearCoreEditor();
    const context = createContext(new RecordingRenderContext(), document);
    editor.initialize(context);
    const teardownToken = {};
    editor.bindTeardownToken(teardownToken);
    (editor as unknown as { disposed: boolean }).disposed = true;
    expect(() => editor.dispose()).toThrow('editor owner');
    expect(() => editor.bindTeardownToken({})).toThrow('already bound');
    editor.dispose(teardownToken);
    expect(() => editor.createRenderSession(context)).toThrow('disposed');
  });

  it('keeps a late-bound command guard across session contexts and reinitialization', () => {
    const context = createContext(new RecordingRenderContext(), document);
    const editor = createSheetEmbeddedSearCoreEditor();
    editor.initialize(context);
    let executing = false;
    const isCommandExecuting = () => executing;
    editor.initialize({ ...context, isCommandExecuting });
    expect(() => editor.createEditSession(context)).toThrow('creation must run through a command');
    expect(() => editor.initialize({ ...context, isCommandExecuting: () => true })).toThrow('already bound');

    executing = true;
    const session = editor.createEditSession(context);
    executing = false;
    expect(() => session.handlePointer({ type: 'pointerDown', point: { x: 12, y: 22 } })).toThrow(
      'must run through a command',
    );
    expect(() => session.commit()).toThrow('must run through a command');
    editor.dispose();
    editor.dispose();
    expect(() => editor.createEditSession(context)).toThrow('disposed');
  });

  it('routes pointer, deletion, and keyboard edits through the active session', () => {
    const context = createContext(new RecordingRenderContext(), document);
    const editor = createSheetEmbeddedSearCoreEditor();
    editor.initialize(context);
    try {
      const session = editor.createEditSession(context);
      session.setSelection({
        anchor: { path: [0, 0], offset: 1 },
        head: { path: [0, 0], offset: 1 },
      });
      session.handleInput({ type: 'deleteContent', direction: 'forward', count: 2 });
      expect(session.getDocument()[0]?.content?.[0]?.text).toBe('Set');

      session.handleInput({ type: 'keyDown', key: 'a', ctrlKey: true });
      expect(session.getSelection()?.anchor.offset).toBe(0);
      session.handleInput({ type: 'keyDown', key: 'ArrowRight', shiftKey: true });
      session.handleInput({ type: 'keyDown', key: 'q' });
      session.handleInput({ type: 'compositionStart' });
      expect(session.getComposition()).toBeNull();
      session.handleInput({ type: 'compositionEnd' });

      session.handlePointer({ type: 'pointerDown', point: { x: 12, y: 22 } });
      session.handlePointer({ type: 'pointerMove', point: { x: 16, y: 22 } });
      session.handlePointer({ type: 'pointerUp', point: { x: 16, y: 22 } });
      expect(session.getSelection()).not.toBeNull();
    } finally {
      editor.dispose();
    }
  });

  it.each([
    ['a\u{1F600}b', 'ab', 3],
    ['ae\u0301b', 'ab', 3],
    ['a\u{1F469}\u200D\u{1F4BB}b', 'ab', 6],
  ])('BUG-075 removes one complete grapheme from %s', (source, expected, offset) => {
    const context = createContext(new RecordingRenderContext(), [
      { type: 'paragraph', content: [{ type: 'text', text: source }] },
    ]);
    const editor = createSheetEmbeddedSearCoreEditor();
    editor.initialize(context);
    try {
      const session = editor.createEditSession(context);
      const caret = { path: [0, 0], offset };
      session.setSelection({ anchor: caret, head: caret });
      session.handleInput({ type: 'keyDown', key: 'Backspace' });
      expect(session.getDocument()[0]?.content?.[0]?.text).toBe(expected);
    } finally {
      editor.dispose();
    }
  });

  it('BUG-977 inserts before a joined emoji after two left arrows in the real embedded editor', () => {
    const context = createContext(new RecordingRenderContext(), [
      { type: 'paragraph', content: [{ type: 'text', text: 'a👩‍💻b' }] },
    ]);
    const editor = createSheetEmbeddedSearCoreEditor();
    editor.initialize(context);
    try {
      const session = editor.createEditSession(context);
      session.handleInput({ type: 'keyDown', key: 'ArrowLeft' });
      session.handleInput({ type: 'keyDown', key: 'ArrowLeft' });
      expect(session.getSelection()?.head.offset).toBe(1);
      session.handleInput({ type: 'insertText', text: 'X' });
      expect(session.getDocument()[0]?.content?.[0]?.text).toBe('aX👩‍💻b');
    } finally {
      editor.dispose();
    }
  });

  it('BUG-004 undoes and redoes only the active edit session input', () => {
    const context = createContext(new RecordingRenderContext(), [
      { type: 'paragraph', content: [{ type: 'text', text: 'abcd' }] },
    ]);
    const editor = createSheetEmbeddedSearCoreEditor();
    editor.initialize(context);
    try {
      const statuses: Array<{ editing: boolean; canUndo: boolean; canRedo: boolean }> = [];
      const disposeStatus = editor.observations.subscribe(SheetEmbeddedEditHistoryObservation, (status) =>
        statuses.push(status),
      );
      const session = editor.createEditSession(context);
      expect(editor.observations.getSnapshot(SheetEmbeddedEditHistoryObservation)).toEqual({
        editing: true,
        canUndo: false,
        canRedo: false,
      });
      const caret = { path: [0, 0], offset: 2 };
      session.setSelection({ anchor: caret, head: caret });
      session.handleInput({ type: 'insertText', text: 'X' });
      expect(JSON.stringify(session.getDocument())).toContain('abXcd');
      expect(statuses.at(-1)).toEqual({ editing: true, canUndo: true, canRedo: false });
      session.handleInput({ type: 'keyDown', key: 'z', metaKey: true });
      expect(JSON.stringify(session.getDocument())).toContain('abcd');
      expect(session.getSelection()?.head.offset).toBe(2);
      expect(statuses.at(-1)).toEqual({ editing: true, canUndo: false, canRedo: true });
      session.handleInput({ type: 'keyDown', key: 'z', metaKey: true, shiftKey: true });
      expect(JSON.stringify(session.getDocument())).toContain('abXcd');
      expect(statuses.at(-1)).toEqual({ editing: true, canUndo: true, canRedo: false });
      session.commit();
      expect(statuses.at(-1)).toEqual({ editing: false, canUndo: false, canRedo: false });
      disposeStatus();
    } finally {
      editor.dispose();
    }
  });

  it('BUG-1132 inserts pasted line breaks as paragraphs and undoes the paste together', () => {
    const context = createContext(new RecordingRenderContext(), [
      { type: 'paragraph', content: [{ type: 'text', text: 'abc' }] },
    ]);
    const editor = createSheetEmbeddedSearCoreEditor();
    editor.initialize(context);
    try {
      const session = editor.createEditSession(context);
      const caret = { path: [0, 0], offset: 1 };
      session.setSelection({ anchor: caret, head: caret });
      session.handleInput({ type: 'insertText', text: 'one\ntwo\nthree' });
      expect(session.getDocument().map((paragraph) => paragraph.content?.map((node) => node.text).join(''))).toEqual([
        'aone',
        'two',
        'threebc',
      ]);
      session.handleInput({ type: 'keyDown', key: 'z', metaKey: true });
      expect(session.getDocument().map((paragraph) => paragraph.content?.map((node) => node.text).join(''))).toEqual([
        'abc',
      ]);
      session.handleInput({ type: 'keyDown', key: 'z', metaKey: true, shiftKey: true });
      expect(session.getDocument().map((paragraph) => paragraph.content?.map((node) => node.text).join(''))).toEqual([
        'aone',
        'two',
        'threebc',
      ]);
    } finally {
      editor.dispose();
    }
  });
  it('loads Sheet-only plugins and routes session lifecycle through the registry', () => {
    const events: string[] = [];
    const plugin: SheetEmbeddedEditorPlugin = {
      key: 'test.sheet-plugin',
      initialize: () => events.push('initialize'),
      transformInput: (input) => {
        events.push(`input:${input.type}`);
        return input;
      },
      transformInlineStyle: (update) => {
        events.push('style');
        return update;
      },
      onCommit: () => events.push('commit'),
      dispose: () => events.push('dispose'),
    };
    const context = createContext(new RecordingRenderContext(), document);
    const editor = createSheetEmbeddedSearCoreEditor({
      plugins: [plugin],
      viewExtensions: [{ key: 'test.view', onRender: () => events.push('render') }],
    });
    editor.initialize(context);
    const renderSession = editor.createRenderSession(context);
    renderSession.render();
    const editSession = editor.createEditSession(context);
    editSession.handleInput({ type: 'insertText', text: '!' });
    editSession.setInlineStyle({ attrs: { fontFamily: 'Georgia' } });
    editSession.commit();
    renderSession.dispose();
    editor.dispose();

    expect(events).toEqual([
      'initialize',
      'render',
      'input:insertText',
      'render',
      'style',
      'render',
      'commit',
      'dispose',
    ]);
  });

  it('keeps a render session document immutable when a view retains its snapshot', () => {
    let retainedDocument: SheetDocument | null = null;
    const view: SheetEmbeddedEditorView = {
      key: 'test.renderSnapshot',
      onRender(_update, context) {
        retainedDocument = context.document;
      },
    };
    const context = createContext(new RecordingRenderContext(), document);
    const editor = createSheetEmbeddedSearCoreEditor({ viewExtensions: [view] });
    editor.initialize(context);
    try {
      const session = editor.createRenderSession(context);
      session.render();
      const snapshot = retainedDocument as SheetDocument | null;
      expect(snapshot).not.toBeNull();
      expect(() => Object.assign((snapshot![0].content as object[])[0], { text: 'forged' })).toThrow();
      session.render();
      expect((retainedDocument![0].content as { text: string }[])[0].text).toBe('Sheet');
      session.dispose();
    } finally {
      editor.dispose();
    }
  });

  it('notifies semantic document changes independently of rendering and adapter views', () => {
    const changes = jest.fn();
    const context = createContext(new RecordingRenderContext(), document);
    const editor = createSheetEmbeddedSearCoreEditor({
      plugins: [{ key: 'test.document-changes', onDocumentChanged: changes }],
      viewExtensions: [],
    });
    editor.initialize(context);
    try {
      const render = editor.createRenderSession(context);
      render.render();
      expect(changes).not.toHaveBeenCalled();
      const edit = editor.createEditSession(context);
      expect(changes).toHaveBeenCalledTimes(1);
      edit.handleInput({ type: 'insertText', text: 'A' });
      expect(changes).toHaveBeenCalledTimes(2);
      const snapshot = changes.mock.calls[1][0];
      expect(Object.keys(snapshot)).toEqual(['document']);
      expect(JSON.stringify(snapshot.document)).toContain('A');
      edit.render();
      render.render();
      expect(changes).toHaveBeenCalledTimes(2);
      render.dispose();
    } finally {
      editor.dispose();
    }
  });

  it('delivers a detached immutable document-only context to embedded policies', () => {
    let initialDocument: SheetDocument | null = null;
    let retainedContext: SheetEmbeddedEditorPluginContext | null = null;
    const plugin: SheetEmbeddedEditorPlugin = {
      key: 'test.initialOwnership',
      initialize(context) {
        retainedContext = context;
        initialDocument = context.document;
      },
    };
    const source: SheetDocument = [{ type: 'paragraph', content: [{ type: 'text', text: 'Original' }] }];
    const context = createContext(new RecordingRenderContext(), source);
    const editor = createSheetEmbeddedSearCoreEditor({ plugins: [plugin] });
    editor.initialize(context);
    try {
      expect(initialDocument).not.toBe(source);
      expect(() => Object.assign((initialDocument![0].content as object[])[0], { text: 'forged' })).toThrow();
      expect(Object.keys(retainedContext!)).toEqual(['document']);
      expect('editor' in retainedContext!).toBe(false);
      expect('renderContext' in retainedContext!).toBe(false);
      expect(() => Object.assign(retainedContext!, { document: [] })).toThrow();
      expect((source[0].content as { text: string }[])[0].text).toBe('Original');
    } finally {
      editor.dispose();
    }
  });

  it('renders through the shared Doc layout and applies inline font-family styles', () => {
    const context = createContext(new RecordingRenderContext(), document);
    const editor = createSheetEmbeddedSearCoreEditor({
      embeddedDocConfig: { fontSize: 16, fontFamily: 'Inter' },
    });
    editor.initialize(context);

    const session = editor.createRenderSession(context);
    const update = session.render();

    expect(update.needsRedraw).toBe(false);
    expect((context.renderContext as RecordingRenderContext).text).toContain('Sheet');
    expect((context.renderContext as RecordingRenderContext).fonts).toContain('16px Georgia');
    expect(session.hitTest({ type: 'pointerDown', point: { x: 12, y: 22 } })?.target).toBe('text');
    session.dispose();
    editor.dispose();
  });

  it('uses the independent embedded Doc font for embedded Doc content', () => {
    const renderContext = new RecordingRenderContext();
    const context = createContext(renderContext, document);
    const editor = createSheetEmbeddedSearCoreEditor();
    editor.initialize(context);

    const session = editor.createRenderSession(context);
    session.render();

    expect(renderContext.fonts).toContain('12px Georgia');
    session.dispose();
    editor.dispose();
  });

  it('allows embedded font size and family to be overridden independently', () => {
    const sizeContext = createContext(new RecordingRenderContext(), document);
    const sizeEditor = createSheetEmbeddedSearCoreEditor({ embeddedDocConfig: { fontSize: 18 } });
    sizeEditor.initialize(sizeContext);
    const sizeSession = sizeEditor.createRenderSession(sizeContext);
    sizeSession.render();
    expect((sizeContext.renderContext as RecordingRenderContext).fonts).toContain('18px Georgia');
    sizeSession.dispose();
    sizeEditor.dispose();

    const familyDocument: SheetDocument = [{ type: 'paragraph', content: [{ type: 'text', text: 'Sheet' }] }];
    const familyContext = createContext(new RecordingRenderContext(), familyDocument);
    const familyEditor = createSheetEmbeddedSearCoreEditor({ embeddedDocConfig: { fontFamily: 'Georgia, serif' } });
    familyEditor.initialize(familyContext);
    const familySession = familyEditor.createRenderSession(familyContext);
    familySession.render();
    expect((familyContext.renderContext as RecordingRenderContext).fonts).toContain('12px Georgia, serif');
    familySession.dispose();
    familyEditor.dispose();
  });

  it('uses the Sheet default font for committed text while editing uses the embedded font', () => {
    const renderContext = new RecordingRenderContext();
    const mixedDocument: SheetDocument = [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'plain' },
          { type: 'text', text: 'large', attrs: { textStyle: { fontSize: 24 } } },
        ],
      },
    ];
    const context = createContext(renderContext, mixedDocument, jest.fn(), 10, 'Inter');
    const editor = createSheetEmbeddedSearCoreEditor({
      embeddedDocConfig: { fontSize: 20, fontFamily: 'Inter' },
    });
    editor.initialize(context);

    const renderSession = editor.createRenderSession(context);
    renderSession.render();
    expect(renderContext.fonts).toContain('10px Inter');
    expect(renderContext.fonts).toContain('24px Inter');

    const editSession = editor.createEditSession(context);
    editSession.render(renderContext);
    expect(renderContext.fonts).toContain('20px Inter');
    expect(renderContext.fonts).toContain('24px Inter');

    editSession.dispose();
    renderSession.dispose();
    editor.dispose();
  });

  it('applies numeric font-size styles through the Sheet edit session', () => {
    const renderContext = new RecordingRenderContext();
    const context = createContext(renderContext, document);
    const editor = createSheetEmbeddedSearCoreEditor({
      embeddedDocConfig: { fontSize: 16, fontFamily: 'Inter' },
    });
    editor.initialize(context);
    const session = editor.createEditSession(context);

    session.setSelection({
      anchor: { path: [0, 0], offset: 1 },
      head: { path: [0, 0], offset: 4 },
    });
    session.setInlineStyle({ attrs: { fontSize: 24 } });
    session.render(renderContext);

    expect(session.getDocument()[0]?.content).toEqual([
      expect.objectContaining({ text: 'S', attrs: { textStyle: { fontFamily: 'Georgia' } } }),
      expect.objectContaining({ text: 'hee', attrs: { textStyle: { fontFamily: 'Georgia', fontSize: 24 } } }),
      expect.objectContaining({ text: 't', attrs: { textStyle: { fontFamily: 'Georgia' } } }),
    ]);
    expect(renderContext.fonts).toContain('24px Georgia');
    session.dispose();
    editor.dispose();
  });

  it('applies bold only to the selected rich-text range while editing a cell', () => {
    const renderContext = new RecordingRenderContext();
    const context = createContext(renderContext, document);
    const editor = createSheetEmbeddedSearCoreEditor({ embeddedDocConfig: { fontSize: 16, fontFamily: 'Inter' } });
    editor.initialize(context);
    const session = editor.createEditSession(context);

    session.setSelection({
      anchor: { path: [0, 0], offset: 1 },
      head: { path: [0, 0], offset: 4 },
    });
    session.setInlineStyle({ attrs: { [BoldTextStyleKey.Bold]: true } });

    expect(session.getDocument()[0]?.content).toEqual([
      expect.objectContaining({ text: 'S', attrs: { textStyle: { fontFamily: 'Georgia' } } }),
      expect.objectContaining({
        text: 'hee',
        attrs: { textStyle: { fontFamily: 'Georgia', [BoldTextStyleKey.Bold]: true } },
      }),
      expect.objectContaining({ text: 't', attrs: { textStyle: { fontFamily: 'Georgia' } } }),
    ]);
    session.render(renderContext);
    expect(renderContext.fonts).toContain('bold 16px Georgia');
    session.dispose();
    editor.dispose();
  });

  it('toggles bold for Ctrl+B while editing a rich-text cell', () => {
    const context = createContext(new RecordingRenderContext(), document);
    const editor = createSheetEmbeddedSearCoreEditor();
    editor.initialize(context);
    const session = editor.createEditSession(context);

    session.setSelection({
      anchor: { path: [0, 0], offset: 1 },
      head: { path: [0, 0], offset: 4 },
    });
    session.handleInput({ type: 'keyDown', key: 'b', ctrlKey: true });
    expect(session.getDocument()[0]?.content?.[1]).toEqual(
      expect.objectContaining({ attrs: { textStyle: { fontFamily: 'Georgia', [BoldTextStyleKey.Bold]: true } } }),
    );
    session.handleInput({ type: 'keyDown', key: 'b', metaKey: true });
    expect(session.getDocument()[0]?.content?.[1]).toEqual(
      expect.objectContaining({ attrs: { textStyle: { fontFamily: 'Georgia' } } }),
    );
    session.dispose();
    editor.dispose();
  });

  it('BUG-069 keeps a collapsed-caret style for the next inserted text', () => {
    const context = createContext(new RecordingRenderContext(), document);
    const editor = createSheetEmbeddedSearCoreEditor();
    editor.initialize(context);
    try {
      const session = editor.createEditSession(context);
      const before = editor.observations.getSnapshot(SheetEmbeddedInlineStyleObservation);
      expect(before[BoldTextStyleKey.Bold].enabled).toBe(true);
      session.handleInput({ type: 'keyDown', key: 'b', metaKey: true });
      const active = editor.observations.getSnapshot(SheetEmbeddedInlineStyleObservation);
      expect(active[BoldTextStyleKey.Bold].active).toBe(true);
      session.handleInput({ type: 'insertText', text: 'X' });
      expect(session.getDocument()[0]?.content).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            text: 'X',
            attrs: { textStyle: expect.objectContaining({ [BoldTextStyleKey.Bold]: true }) },
          }),
        ]),
      );
    } finally {
      editor.dispose();
    }
  });

  it('toggles italic, underline, and strikethrough in rich-text cell editing', () => {
    const context = createContext(new RecordingRenderContext(), document);
    const editor = createSheetEmbeddedSearCoreEditor();
    editor.initialize(context);
    const session = editor.createEditSession(context);

    session.setSelection({
      anchor: { path: [0, 0], offset: 1 },
      head: { path: [0, 0], offset: 4 },
    });
    session.handleInput({ type: 'keyDown', key: 'i', ctrlKey: true });
    session.handleInput({ type: 'keyDown', key: 'u', metaKey: true });
    session.handleInput({ type: 'keyDown', key: 'x', ctrlKey: true, shiftKey: true });
    expect(session.getDocument()[0]?.content?.[1]).toEqual(
      expect.objectContaining({
        attrs: {
          textStyle: {
            fontFamily: 'Georgia',
            [ItalicTextStyleKey.Italic]: true,
            [UnderlineTextStyleKey.Underline]: true,
            [StrikethroughTextStyleKey.Strikethrough]: true,
          },
        },
      }),
    );
    session.dispose();
    editor.dispose();
  });

  it('publishes inline-style availability and activation from the active selection', () => {
    const context = createContext(new RecordingRenderContext(), document);
    const editor = createSheetEmbeddedSearCoreEditor();
    editor.initialize(context);
    const states: SheetEmbeddedInlineStyleState[] = [];
    const dispose = editor.observations.subscribe(SheetEmbeddedInlineStyleObservation, (state) => states.push(state));

    expect(states.at(-1)?.['bold']).toEqual({ enabled: false, active: false, value: null });
    const session = editor.createEditSession(context);
    expect(states.at(-1)?.['bold']).toEqual({ enabled: true, active: false, value: null });

    session.setSelection({
      anchor: { path: [0, 0], offset: 1 },
      head: { path: [0, 0], offset: 4 },
    });
    expect(states.at(-1)?.['bold']).toEqual({ enabled: true, active: false, value: null });

    session.setInlineStyle({ attrs: { [BoldTextStyleKey.Bold]: true } });
    expect(states.at(-1)?.['bold']).toEqual({ enabled: true, active: true, value: true });

    session.dispose();
    expect(states.at(-1)?.['bold']).toEqual({ enabled: false, active: false, value: null });
    dispose();
    editor.dispose();
  });

  it('publishes the common embedded font size through the inline-style observation', () => {
    const context = createContext(new RecordingRenderContext(), document);
    const editor = createSheetEmbeddedSearCoreEditor();
    editor.initialize(context);
    const states: SheetEmbeddedInlineStyleState[] = [];
    const dispose = editor.observations.subscribe(SheetEmbeddedInlineStyleObservation, (state) => states.push(state));
    const session = editor.createEditSession(context);

    session.setSelection({
      anchor: { path: [0, 0], offset: 1 },
      head: { path: [0, 0], offset: 4 },
    });
    expect(states.at(-1)?.['fontSize']).toEqual({ enabled: true, active: false, value: null });

    session.setInlineStyle({ attrs: { fontSize: 24 } });
    expect(states.at(-1)?.['fontSize']).toEqual({ enabled: true, active: false, value: 24 });

    session.setInlineStyle({ attrs: { fontFamily: 'Georgia' } });
    expect(states.at(-1)?.['fontFamily']).toEqual({ enabled: true, active: false, value: 'Georgia' });

    session.setInlineStyle({ attrs: { color: '#256cfb' } });
    expect(states.at(-1)?.['color']).toEqual({ enabled: true, active: false, value: '#256cfb' });

    session.dispose();
    expect(states.at(-1)?.['fontSize']).toEqual({ enabled: false, active: false, value: null });
    dispose();
    editor.dispose();
  });

  it('keeps one active edit session, commits edits, and releases it on dispose', () => {
    const committed: SheetDocument[] = [];
    const context = createContext(new RecordingRenderContext(), document, (next) => {
      committed.push(next);
    });
    const editor = createSheetEmbeddedSearCoreEditor();
    editor.initialize(context);
    const session = editor.createEditSession(context);

    expect(() => editor.createEditSession(context)).toThrow('active edit session');
    session.handleInput({ type: 'insertText', text: '!' });
    session.handleInput({ type: 'compositionUpdate', text: '\u4e2d' });
    expect(session.getComposition()?.text).toBe('\u4e2d');
    session.handleInput({ type: 'compositionEnd' });
    const result = session.commit();

    expect(result[0]?.content?.[0]?.text).toBe('Sheet!');
    expect(committed).toHaveLength(1);
    const next = editor.createEditSession(context);
    next.cancel();
    editor.dispose();
    expect(() => next.getDocument()).toThrow('disposed');
  });

  it('keeps a draft editable when a Sheet-only plugin rejects input, style, or commit', () => {
    const commit = jest.fn();
    const context = createContext(new RecordingRenderContext(), document, commit);
    const editor = createSheetEmbeddedSearCoreEditor({
      plugins: [
        {
          key: 'test.reject-mutations',
          transformInput: () => null,
          transformInlineStyle: () => null,
          transformCommit: () => null,
        },
      ],
    });
    editor.initialize(context);
    const session = editor.createEditSession(context);
    try {
      const originalDraft = session.getDocument();
      session.handleInput({ type: 'insertText', text: 'blocked' });
      session.setInlineStyle({ attrs: { [BoldTextStyleKey.Bold]: true } });
      expect(session.getDocument()).toEqual(originalDraft);
      expect(session.commit()).toEqual(originalDraft);
      expect(commit).not.toHaveBeenCalled();
      expect(() => editor.createEditSession(context)).toThrow('active edit session');
      session.cancel();
      expect(() => editor.createEditSession(context)).not.toThrow();
    } finally {
      editor.dispose();
    }
  });

  it('keeps the caret visible when an edit session renders', () => {
    const renderContext = new RecordingRenderContext();
    const context = createContext(renderContext, document);
    const editor = createSheetEmbeddedSearCoreEditor();
    editor.initialize(context);

    const session = editor.createEditSession(context);
    expect(session.render(renderContext).cursor?.visible).toBe(true);

    expect(renderContext.strokes).toBeGreaterThan(0);
    renderContext.strokes = 0;
    expect(session.render(renderContext, { cursorVisible: false }).cursor?.visible).toBe(false);
    expect(renderContext.strokes).toBe(0);
    session.dispose();
    editor.dispose();
  });
});
