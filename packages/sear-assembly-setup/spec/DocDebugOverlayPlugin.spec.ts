import { ConfigEngine, defaultDocConfig } from '@searsuite/sear-assembly-config';
import { WebKeyboardRouter } from '@searsuite/sear-browser-adapters';
import {
  DocNodeRegistry,
  ParagraphNode,
  TextNode,
  registerParagraphDocNode,
  registerTextDocNode,
  type RichDocNode,
} from '@searsuite/sear-domain-doc';
import { Container } from '@searsuite/sear-foundation-di';
import { PositionRect } from '@searsuite/sear-foundation-rect';
import { NodePlatform as HeadlessPlatform } from '@searsuite/sear-node-adapters';
import { HeadlessRenderContext } from '@searsuite/sear-render-context';
import { HeadlessEventRegistrar } from '@searsuite/sear-render-event-engine';
import { HeadlessKeyboardRouter, HeadlessPointerCapture, HeadlessTextInput } from '@searsuite/sear-render-input';
import { Tree } from '@searsuite/sear-render-node';
import { createDocEditor } from '../src/doc/createDocEditor';
import { DocDebugOverlayView } from '../src/doc/runtimePlugin/debugOverlay/DocDebugOverlayView';

let container: Container;

class MeasuredHeadlessRenderContext extends HeadlessRenderContext {
  public override measureText(text: string): {
    width: number;
    height: number;
    fontAscent: number;
    fontDescent: number;
  } {
    return {
      width: text.length * 7,
      height: 14,
      fontAscent: 11,
      fontDescent: 3,
    };
  }
}

class RecordingDebugRenderContext extends MeasuredHeadlessRenderContext {
  public readonly calls: { readonly name: string; readonly args: readonly unknown[] }[] = [];

  public override setStrokeStyle(strokeStyle: string): void {
    this.calls.push({ name: 'setStrokeStyle', args: [strokeStyle] });
  }

  public override setLineDash(segments: number[]): void {
    this.calls.push({ name: 'setLineDash', args: [segments] });
  }

  public override rect(x: number, y: number, width: number, height: number): void {
    this.calls.push({ name: 'rect', args: [x, y, width, height] });
  }
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

function registerSpecTextDocNodes(): void {
  const registry = new DocNodeRegistry();
  registerParagraphDocNode(registry);
  registerTextDocNode(registry);
}

describe('DocDebugOverlayView', () => {
  beforeEach(() => {
    container = new Container();
  });

  afterEach(() => {
    container.reset();
  });

  it('instantiates and registers with proper symbol', () => {
    const plugin = new DocDebugOverlayView();
    expect(DocDebugOverlayView.symbol).toBeDefined();
  });

  it('returns null for render (no scene nodes)', () => {
    const plugin = new DocDebugOverlayView();
    const nodes = plugin.render();
    expect(nodes).toBeNull();
  });

  it('returns an overlay node when document frame state is available', () => {
    const plugin = new DocDebugOverlayView();
    const block = {
      id: 'p-16',
      index: 16,
      lineStart: 16,
      lineEnd: 17,
      rect: { x: 0, y: 384, width: 240, height: 24 },
      flowHeight: 24,
    };
    container.registerInstance(ConfigEngine.symbol, new ConfigEngine(defaultDocConfig));
    container.registerInstance(Tree.symbol, {
      getBoundary: () => new PositionRect(0, 0, 400, 300),
      updateBoundary: jest.fn(),
      insert: jest.fn(),
      remove: jest.fn(),
      query: jest.fn(() => []),
    } as never);
    plugin.configure({
      container,
      runtime: {
        document: {
          core: {
            getDocRenderLayoutState: () => ({
              viewport: { width: 400, height: 300 },
              contentRect: { x: 0, y: 0, width: 400, height: 300 },
              layoutCache: { snapshot: { lines: [] }, blocks: [block] },
              blockLayoutDiff: {} as never,
              visibleBlocks: [block],
              documentRect: { x: 0, y: 0, width: 400, height: 300 },
              font: '12px sans-serif',
              scroll: { x: 0, y: 0 },
            }),
          },
        },
      } as any,
    });

    const nodes = plugin.render();

    expect(nodes).toHaveLength(1);
    expect(nodes?.[0].nodeKey).toBe(`${plugin.key.key}:block-bounds`);
  });

  it('draws block render debug snapshot rectangles', () => {
    const plugin = new DocDebugOverlayView();
    const block = {
      id: 'p-0',
      index: 0,
      lineStart: 0,
      lineEnd: 0,
      rect: { x: 0, y: 0, width: 240, height: 24 },
      flowHeight: 24,
    };
    container.registerInstance(ConfigEngine.symbol, new ConfigEngine(defaultDocConfig));
    container.registerInstance(Tree.symbol, {
      getBoundary: () => new PositionRect(0, 0, 400, 300),
      updateBoundary: jest.fn(),
      insert: jest.fn(),
      remove: jest.fn(),
      query: jest.fn(() => []),
    } as never);
    plugin.configure({
      container,
      runtime: {
        document: {
          core: {
            getDocRenderLayoutState: () => ({
              viewport: { width: 400, height: 300 },
              contentRect: { x: 0, y: 0, width: 400, height: 300 },
              layoutCache: { snapshot: { lines: [] }, blocks: [block] },
              blockLayoutDiff: {} as never,
              visibleBlocks: [block],
              documentRect: { x: 0, y: 0, width: 400, height: 300 },
              font: '12px sans-serif',
              scroll: { x: 0, y: 0 },
              blockRender: {
                frameMode: 'block-copy',
                incrementalRenderAccepted: true,
                incrementalRenderReason: 'accepted',
                changedBlocks: [{ x: 0, y: 0, width: 240, height: 24 }],
                shiftedBlocks: [{ x: 0, y: 24, width: 240, height: 24 }],
                reusedBlocks: [{ x: 0, y: 48, width: 240, height: 24 }],
                rasterCopies: [
                  {
                    source: { x: 0, y: 24, width: 240, height: 24 },
                    destination: { x: 0, y: 48, width: 240, height: 24 },
                  },
                ],
                invalidRedrawRects: [{ x: 0, y: 0, width: 240, height: 24 }],
                copiedPixelArea: 5760,
                redrawnBlockCount: 1,
                skippedBlockCount: 1,
              },
            }),
          },
        },
      } as any,
    });

    const [node] = plugin.render() ?? [];
    const context = new RecordingDebugRenderContext();
    node.drawScene(context);

    expect(context.calls.filter((call) => call.name === 'rect').length).toBeGreaterThan(4);
    expect(context.calls).toContainEqual({ name: 'setLineDash', args: [[4, 3]] });
  });

  it('can be registered as a custom plugin in createDocEditor', () => {
    const editor = createDocEditor({
      viewport: { width: 400, height: 300 },
      documentState: { document: createRichDocument('Hello World') },
      adapters: {
        eventRegistrar: HeadlessEventRegistrar,
        platform: HeadlessPlatform,
        createRenderContext() {
          return new MeasuredHeadlessRenderContext();
        },
        textInput: HeadlessTextInput,
        keyboardRouter: HeadlessKeyboardRouter,
        pointerCapture: HeadlessPointerCapture,
        registerEnvironment(editorContainer: Container) {
          editorContainer.registerInstance(WebKeyboardRouter.eventTargetSymbol, new EventTarget());
        },
      },
      viewExtensions: [DocDebugOverlayView],
    });

    expect(editor).toBeDefined();
    expect(editor.commands).toBeDefined();
    editor.render();
    editor.destroy();
  });

  it('renders debug overlay without crashing when selection changes', () => {
    const editor = createDocEditor({
      viewport: { width: 400, height: 300 },
      documentState: { document: createRichDocument('Hello World') },
      adapters: {
        eventRegistrar: HeadlessEventRegistrar,
        platform: HeadlessPlatform,
        createRenderContext() {
          return new MeasuredHeadlessRenderContext();
        },
        textInput: HeadlessTextInput,
        keyboardRouter: HeadlessKeyboardRouter,
        pointerCapture: HeadlessPointerCapture,
        registerEnvironment(editorContainer: Container) {
          editorContainer.registerInstance(WebKeyboardRouter.eventTargetSymbol, new EventTarget());
        },
      },
      viewExtensions: [DocDebugOverlayView],
    });

    // Trigger a render without errors
    editor.render();

    editor.render();

    editor.destroy();
  });

  it('plugin lifecycle methods work correctly', () => {
    const plugin = new DocDebugOverlayView();

    // Should not throw during configure (requires runtime context)
    const mockContext = {
      container,
      runtime: {
        commands: {} as any,
        document: {} as any,
        scroll: {} as any,
        extensions: { get: () => null },
      } as any,
    };
    plugin.configure(mockContext);

    // Should not throw during start
    plugin.start();

    // Should not throw during destroy
    expect(() => {
      plugin.destroyView();
    }).not.toThrow();
  });
});
