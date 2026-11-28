import { DocKernel } from '@searsuite/sear-assembly-doc-kernel';
import {
  Pipeline,
  PipelineStepExecutorRegistry,
  PipelineStepKind,
  Plugin,
  PluginKey,
  PluginManager,
} from '@searsuite/sear-assembly-plugin';
import { RichTextBlockFlowRegistry } from '@searsuite/sear-domain-doc';
import type { Schema } from '@searsuite/sear-domain-doc-schema';
import { DocLayoutEngine } from '@searsuite/sear-domain-editor';
import { createTransaction } from '@searsuite/sear-domain-transaction';
import { ViewExtensionBase, ViewExtensionRegistry } from '@searsuite/sear-render-event-engine';
import { type Node, type NodeProperties } from '@searsuite/sear-render-node';
import { SearCoreDoc } from '../src/SearCoreDoc';

class TestDocPlugin extends Plugin<number> {
  constructor(public readonly testKey = new PluginKey('test-doc-plugin')) {
    super({ key: testKey, state: 1 });
  }

  apply(state: number): number {
    return state + 1;
  }

  registerState() {
    return { key: this.key, state: this.getState() };
  }
}

function createRenderContext() {
  return {
    measureText: jest.fn((text: string) => ({
      width: text.length,
      height: 10,
      fontAscent: 8,
      fontDescent: 2,
    })),
  };
}

function createCore() {
  const textShaper = {
    shape: jest.fn(() => ({ glyphs: [], clusters: [], caretStops: [{ textOffset: 0, x: 0 }], width: 0, height: 10 })),
  };
  const calculateLayoutPerParagraph = jest.fn(() => [
    [
      {
        chars: [{ char: 'A', width: 5, height: 10, fontAscent: 8, textNodeIndex: 0, textNodeOffset: 0 }],
        width: 5,
        height: 10,
        fontAscent: 8,
      },
    ],
  ]);
  const blockManager = {
    add: jest.fn(),
    calculateLayoutPerParagraph,
    clear: jest.fn(),
    maxWidth: 60,
    createDetached: jest.fn(() => ({
      add: jest.fn(),
      calculateLayoutPerParagraph,
      clear: jest.fn(),
      setBaseFont: jest.fn(),
      maxWidth: 60,
    })),
  };
  const cursor = {
    setCursor: jest.fn(),
    setSelectionRects: jest.fn(),
  };
  const composition = {
    measure: jest.fn(() => ({ active: false, text: '', textWidth: 0, caretPixelOffset: 0 })),
  };
  const core = new SearCoreDoc(
    blockManager as never,
    cursor as never,
    composition as never,
    new DocLayoutEngine(new RichTextBlockFlowRegistry()),
    new DocKernel(new PluginManager(), new PipelineStepExecutorRegistry()),
    {},
    new ViewExtensionRegistry(),
  );

  return { blockManager, composition, core, cursor };
}

describe('SearCoreDoc', () => {
  it('requires its own command bus before executing state-changing pipeline steps', () => {
    const { core } = createCore();
    const change = jest.fn();
    let executing = false;
    core.enforceCommandBoundary(() => executing);
    expect(() => core.executePipeline(new Pipeline('outside').addLocalAction('change', change))).toThrow(
      'editor.commands.run',
    );
    expect(change).not.toHaveBeenCalled();
    executing = true;
    core.executePipeline(new Pipeline('inside').addLocalAction('change', change));
    expect(change).toHaveBeenCalledTimes(1);
  });

  it('keeps committed third-party plugin state and registration behind the command boundary', () => {
    class MutableDocPlugin extends Plugin<{ value: number }> {
      constructor() {
        super({ key: new PluginKey('mutable-doc-plugin'), state: { value: 1 } });
      }

      apply(state: { value: number }): { value: number } {
        return { value: state.value + 1 };
      }

      registerState() {
        return { key: this.key, state: this.getState() };
      }
    }

    const { core } = createCore();
    const plugin = new MutableDocPlugin();
    const retained = plugin.getState();
    core.registerPlugin(plugin);
    let executing = false;
    core.enforceCommandBoundary(() => executing);
    core.initialize();

    expect(() => Object.assign(core, { pluginManager: new PluginManager() })).toThrow();
    expect(() => {
      retained.value = 9;
    }).toThrow();
    expect(() => plugin.setState({ value: 9 })).toThrow('command transaction');
    expect(() => core.pluginManager.registerPlugin(new TestDocPlugin())).toThrow('owning runtime');
    expect(() => core.registerPlugin(new TestDocPlugin())).toThrow('editor.commands.run');
    expect(() => core.unregisterPlugin(plugin.key)).toThrow('editor.commands.run');

    executing = true;
    core.executePipeline(Pipeline.fromTransaction('doc.mutable-plugin', createTransaction(plugin.key)));
    expect(core.getPlugin<{ value: number }>(plugin.key)).toEqual({ value: 2 });
    expect(() => {
      plugin.getState().value = 9;
    }).toThrow();
    core.registerPlugin(new TestDocPlugin());
  });

  it('rejects reuse of a state owner across document editors', () => {
    const plugin = new TestDocPlugin();
    const first = createCore().core;
    first.registerPlugin(plugin);
    first.enforceCommandBoundary(() => false);
    first.initialize();

    const second = createCore().core;
    expect(() => second.registerPlugin(plugin)).toThrow('already owned by another editor');
  });

  it('rejects state-changing steps added or changed by pipeline hooks outside command dispatch', () => {
    const { core } = createCore();
    const change = jest.fn();
    core.enforceCommandBoundary(() => false);

    const addedOnStart = new Pipeline('doc-hook-added-step').invalidate('refresh', new PluginKey('refresh'));
    addedOnStart.use({
      onStart: (pipeline) => {
        pipeline.addLocalAction('change', change);
      },
    });
    expect(() => core.executePipeline(addedOnStart)).toThrow('editor.commands.run');

    const changedOnStepStart = new Pipeline('doc-hook-mutated-step').invalidate('refresh', new PluginKey('refresh'));
    changedOnStepStart.use({
      onStepStart: (step) => {
        step.kind = PipelineStepKind.LocalAction;
        step.localAction = change;
      },
    });
    expect(() => core.executePipeline(changedOnStepStart)).toThrow('editor.commands.run');
    expect(change).not.toHaveBeenCalled();
  });

  it('runs post-commit actions after successful staging only', () => {
    const { core } = createCore();
    const published = jest.fn();
    expect(() =>
      core.executePipeline(
        new Pipeline('failed-post-commit').addPostCommit('publish', published).addLocalAction('fail', () => {
          throw new Error('staging failed');
        }),
      ),
    ).toThrow('staging failed');
    expect(published).not.toHaveBeenCalled();

    core.executePipeline(new Pipeline('successful-post-commit').addPostCommit('publish', published));
    expect(published).toHaveBeenCalledTimes(1);
  });

  it('materializes detached layout input without retaining a second document state', () => {
    const { core } = createCore();
    const snapshot: Schema[] = [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'shared', attrs: { textStyle: { fontFamily: 'Georgia' } } }],
      },
    ];

    const runtimeDocument = core.materializeSnapshot(snapshot);
    snapshot[0]!.content![0]!.text = 'changed outside';
    const exported = JSON.parse(JSON.stringify(runtimeDocument));

    expect(exported[0]?.content?.[0]?.text).toBe('shared');
    expect(exported[0]?.content?.[0]?.attrs).toEqual({ textStyle: { fontFamily: 'Georgia' } });
    exported[0]!.content![0]!.text = 'changed export';
    expect((JSON.parse(JSON.stringify(runtimeDocument)) as Schema[])[0]?.content?.[0]?.text).toBe('shared');
  });

  it('prepares editor render layout through document-owned layout state', () => {
    const { blockManager, core, cursor } = createCore();
    const context = createRenderContext();
    const document = [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'A' }],
      },
    ];
    blockManager.clear.mockClear();
    blockManager.add.mockClear();

    const prepared = core.prepareEditorRenderLayout({
      document: document as never,
      selection: {
        anchor: { path: [0, 0], offset: 1 },
        head: { path: [0, 0], offset: 1 },
      },
      origin: { x: 4, y: 6 },
      minWidth: 20,
      minHeight: 14,
      padding: 2,
      cursorVisible: true,
    });

    expect(blockManager.clear).toHaveBeenCalledTimes(1);
    expect(blockManager.add).toHaveBeenCalledTimes(1);
    expect(prepared.positionRect).toEqual(expect.objectContaining({ x: 4, y: 6, width: 64, height: 14 }));
    expect(prepared.snapshot.lines).toHaveLength(1);
    expect(cursor.setCursor).toHaveBeenCalledWith(expect.objectContaining({ x: expect.any(Number), visible: true }));
    expect(cursor.setSelectionRects).toHaveBeenCalled();
    expect('loadSnapshot' in core).toBe(false);
    expect('exportSnapshot' in core).toBe(false);
  });

  it('keeps read-only layout preparation outside commands from publishing state', () => {
    const { blockManager, core, cursor } = createCore();
    blockManager.clear.mockClear();
    blockManager.add.mockClear();
    core.enforceCommandBoundary(() => false);

    const prepared = core.prepareEditorRenderLayout({
      document: [{ type: 'paragraph', content: [{ type: 'text', text: 'paint only' }] }] as never,
      selection: {
        anchor: { path: [0, 0], offset: 0 },
        head: { path: [0, 0], offset: 0 },
      },
      origin: { x: 0, y: 0 },
      minWidth: 20,
      minHeight: 14,
    });

    expect(prepared.snapshot.lines).toHaveLength(1);
    expect(blockManager.createDetached).toHaveBeenCalledTimes(1);
    expect(blockManager.clear).not.toHaveBeenCalled();
    expect(blockManager.add).not.toHaveBeenCalled();
    expect(core.getLayoutSnapshot()).toBeNull();
    expect('loadSnapshot' in core).toBe(false);
    expect('exportSnapshot' in core).toBe(false);
    expect(cursor.setCursor).not.toHaveBeenCalled();
  });

  it('exposes render layout state for document plugin render nodes', () => {
    const { core } = createCore();
    const layout = {
      viewport: { width: 200, height: 100 },
      contentRect: { x: 0, y: 0, width: 200, height: 100 },
      layoutCache: {} as never,
      blockLayoutDiff: {} as never,
      visibleBlocks: [],
      documentRect: { x: 0, y: 0, width: 200, height: 100 },
      font: '12px sans-serif',
      scroll: { x: 0, y: 0 },
    } as const;

    core.setDocRenderLayoutState(layout);

    expect(core.getDocRenderLayoutState()).toBe(layout);
  });

  it('expands layout width for composing text without host-specific rendering', () => {
    const { composition, core } = createCore();
    const context = createRenderContext();
    composition.measure.mockReturnValue({ active: true, text: 'composing', textWidth: 9, caretPixelOffset: 4 });

    const prepared = core.prepareEditorRenderLayout({
      document: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }] as never,
      selection: {
        anchor: { path: [0, 0], offset: 0 },
        head: { path: [0, 0], offset: 0 },
      },
      origin: { x: 0, y: 0 },
      minWidth: 1,
      minHeight: 10,
      padding: 0,
      fitContentWidth: false,
    });

    expect(prepared.positionRect.width).toBeGreaterThan(1);
    expect(prepared.composingCaretPixelOffset).toBe(4);
  });

  it('delegates plugin state transactions to registered plugin instances', () => {
    const { core } = createCore();
    const plugin = new TestDocPlugin();
    core.registerPlugin(plugin);
    const transaction = {
      pluginKey: plugin.key,
      operations: [],
      meta: {},
      setMeta: jest.fn(),
      getMeta: jest.fn(),
      addOperation: jest.fn(),
    } as never;

    core.executePipeline(Pipeline.fromTransaction('doc.test.plugin-state', transaction));

    expect(core.getPlugin(plugin.key)).toBe(2);
    expect(core.getPluginInstance(plugin.key)).toBe(plugin);
  });

  it('does not commit staged document plugin state when a later pipeline step fails', () => {
    const { core } = createCore();
    const plugin = new TestDocPlugin();
    core.registerPlugin(plugin);
    const transaction = {
      pluginKey: plugin.key,
      operations: [],
      meta: {},
      setMeta: jest.fn(),
      getMeta: jest.fn(),
      addOperation: jest.fn(),
    } as never;

    expect(() => {
      core.executePipeline(
        Pipeline.fromTransaction('doc.test.rollback', transaction).addLocalAction('doc.test.fail', () => {
          throw new Error('boom');
        }),
      );
    }).toThrow('boom');

    expect(core.getPlugin(plugin.key)).toBe(1);
  });

  it('executes document command pipelines with plugin-owned render requests', () => {
    const { core } = createCore();
    const renderFrame = jest.fn();
    const commit = jest.fn();
    const pluginKey = new PluginKey('DocTestRender');

    core.bindDocRenderRequestHandler(renderFrame);
    core.executePipeline(
      new Pipeline('doc.test').addLocalAction('doc.test', commit).invalidate('doc.test:render', pluginKey),
    );

    expect(commit).toHaveBeenCalledTimes(1);
    expect(renderFrame).toHaveBeenCalledWith([{ projectionKey: pluginKey, renderOperations: [] }]);
    expect(core.getDocRenderRequests()).toEqual([{ projectionKey: pluginKey, renderOperations: [] }]);
  });

  it('batches document render steps into one frame after dirty regions are marked', () => {
    const { core } = createCore();
    const renderFrame = jest.fn();
    const firstPluginKey = new PluginKey('DocFirstRender');
    const secondPluginKey = new PluginKey('DocSecondRender');

    core.bindDocRenderRequestHandler(renderFrame);
    core.executePipeline(
      new Pipeline('doc.test.batch')
        .invalidate('doc.first:render', firstPluginKey)
        .invalidate('doc.second:render', secondPluginKey),
    );

    expect(renderFrame).toHaveBeenCalledTimes(1);
    expect(renderFrame).toHaveBeenCalledWith([
      { projectionKey: firstPluginKey, renderOperations: [] },
      { projectionKey: secondPluginKey, renderOperations: [] },
    ]);
  });

  it('adds independently registered view nodes to the configured render stage', () => {
    const { core } = createCore();
    const stage = { addPluginNode: jest.fn() };
    const renderPlugin = new (class extends ViewExtensionBase<SearCoreDoc, NodeProperties> {
      public constructor() {
        super(new PluginKey('test-doc-view'));
      }
      public render = jest.fn<Node<NodeProperties>[], [SearCoreDoc, { x: number; y: number }?]>(() => []);
    })();
    const docCore = new SearCoreDoc(
      { add: jest.fn(), calculateLayoutPerParagraph: jest.fn(), clear: jest.fn(), maxWidth: 0 } as never,
      {
        setCursor: jest.fn(),
        setSelectionRects: jest.fn(),
      } as never,
      { measure: jest.fn(() => ({ active: false, text: '', textWidth: 0, caretPixelOffset: 0 })) } as never,
      new DocLayoutEngine(new RichTextBlockFlowRegistry()),
      new DocKernel(new PluginManager(), new PipelineStepExecutorRegistry()),
      { renderStage: stage as never },
      new ViewExtensionRegistry(),
    );

    docCore.getViewExtensions().register(renderPlugin);
    docCore.initialize();

    expect(renderPlugin.render).toHaveBeenCalledWith(docCore);
    expect(stage.addPluginNode).toHaveBeenCalledWith(renderPlugin.key.key, []);
    expect(core).toBeDefined();
  });
});
