import { DocLayoutEngine, type LayoutSnapshot } from '../src';
import {
  DocNodeRegistry,
  ParagraphNode,
  RichTextBlockFlowRegistry,
  createDefaultRichTextBlockFlowContribution,
  TextNode,
  type RichTextBlockLayoutProvider,
  registerParagraphDocNode,
  registerTextDocNode,
} from '@searsuite/sear-domain-doc';

beforeAll(function registerDocLayoutEngineSpecDocNodes() {
  const registry = new DocNodeRegistry();
  registerParagraphDocNode(registry);
  registerTextDocNode(registry);
});

function snapshot(): LayoutSnapshot {
  return {
    lines: [
      {
        textNodePath: [0, 0],
        charStartOffset: 0,
        chars: [
          { char: 'a', width: 5, height: 12, fontAscent: 10 },
          { char: 'b', width: 7, height: 12, fontAscent: 10 },
        ],
        x: 4,
        y: 16,
        height: 14,
        fontAscent: 10,
      },
      {
        textNodePath: [0, 0],
        charStartOffset: 2,
        chars: [{ char: 'c', width: 6, height: 12, fontAscent: 10 }],
        x: 4,
        y: 36,
        height: 14,
        fontAscent: 10,
      },
      {
        textNodePath: [1, 0],
        charStartOffset: 0,
        chars: [{ char: 'd', width: 8, height: 12, fontAscent: 10 }],
        x: 4,
        y: 56,
        height: 14,
        fontAscent: 10,
      },
    ],
  };
}

function createDoc(count: number) {
  return Array.from({ length: count }, (_unused, index) =>
    DocNodeRegistry.create({
      type: ParagraphNode.nodeType,
      attrs: {},
      content: [{ type: TextNode.nodeType, attrs: {}, content: [], text: `P${index}` }],
    }),
  );
}

describe('DocLayoutEngine', () => {
  const engine = new DocLayoutEngine(new RichTextBlockFlowRegistry());

  it('maps wrapped cursor positions to points and points to nearest boundaries', () => {
    const layout = snapshot();

    expect(engine.cursorToPoint({ path: [0, 0], offset: 1 }, layout)).toEqual({
      x: 9,
      y: 16,
      height: 14,
    });
    expect(engine.cursorToPoint({ path: [0, 0], offset: 3 }, layout)).toEqual({
      x: 10,
      y: 36,
      height: 14,
    });
    expect(engine.pointToCursor(8, 15, layout)).toEqual({
      path: [0, 0],
      offset: 1,
    });
    expect(engine.pointToCursor(99, 35, layout)).toEqual({
      path: [0, 0],
      offset: 3,
    });
    expect(engine.pointToCursor(0, 0, { lines: [] })).toEqual({
      path: [0, 0],
      offset: 0,
    });

    // Out of bounds offset uses last line with matching path
    expect(engine.cursorToPoint({ path: [0, 0], offset: 5 }, layout)).toEqual({
      x: 10,
      y: 36,
      height: 14,
    });

    // Test different path lengths and empty snapshot for fallback branches
    expect(engine.cursorToPoint({ path: [0], offset: 0 }, layout)).toEqual({
      x: 4,
      y: 16,
      height: 14,
    });
    expect(engine.cursorToPoint({ path: [0, 0], offset: 0 }, { lines: [] })).toEqual({
      x: 0,
      y: 0,
      height: 14,
    });
  });

  it('finds lines and emits bounded selection rectangles across wraps and paragraphs', () => {
    const layout = snapshot();

    expect(engine.findLineIndex({ path: [0, 0], offset: 3 }, layout)).toBe(1);
    expect(engine.findLineIndex({ path: [9, 0], offset: 0 }, layout)).toBe(0);
    expect(
      engine.getSelectionRects(
        {
          anchor: { path: [1, 0], offset: 1 },
          head: { path: [0, 0], offset: 1 },
        },
        layout,
        100,
        200,
      ),
    ).toEqual([
      { x: 109, y: 206, width: 7, height: 14 },
      { x: 104, y: 226, width: 6, height: 14 },
      { x: 104, y: 246, width: 8, height: 14 },
    ]);
    expect(
      engine.getSelectionRects(
        {
          anchor: { path: [0, 0], offset: 1 },
          head: { path: [0, 0], offset: 1 },
        },
        layout,
        0,
        0,
      ),
    ).toEqual([]);

    expect(
      engine.getSelectionRects(
        {
          anchor: { path: [0, 0], offset: 0 },
          head: { path: [0, 0], offset: 1 },
        },
        layout,
        10,
        20,
      ),
    ).toEqual([{ x: 14, y: 26, width: 5, height: 14 }]);

    // Test line skip (end pos before start)
    expect(
      engine.getSelectionRects(
        {
          anchor: { path: [1, 0], offset: 0 },
          head: { path: [1, 0], offset: 1 },
        },
        layout,
        10,
        20,
      ),
    ).toEqual([{ x: 14, y: 66, width: 8, height: 14 }]);
  });

  it('builds layout snapshot from block manager', () => {
    const mockBlockManager = {
      calculateLayoutPerParagraph: () => [
        [{ chars: [{ char: 'a', width: 5, height: 12, fontAscent: 10 }], width: 5, height: 12, fontAscent: 10 }],
        [
          {
            chars: [{ char: 'b', width: 6, height: 14, fontAscent: 11, textNodeIndex: 0, textNodeOffset: 0 }],
            width: 6,
            height: 14,
            fontAscent: 11,
          },
          {
            chars: [{ char: 'c', width: 7, height: 14, fontAscent: 11, textNodeIndex: 0, textNodeOffset: 1 }],
            width: 7,
            height: 14,
            fontAscent: 11,
          },
        ],
      ],
    } as unknown as RichTextBlockLayoutProvider;

    const snapshot = engine.buildSnapshot([], mockBlockManager, 100, 200, 4);
    const snapshotDefaults = engine.buildSnapshot([], mockBlockManager, 100, 200);

    expect(snapshot.lines).toHaveLength(3);
    expect(snapshotDefaults.lines).toHaveLength(3);

    expect(snapshot.lines[0]).toEqual(
      expect.objectContaining({
        textNodePath: [0, 0],
        charStartOffset: 0,
        x: 4,
      }),
    );

    expect(snapshot.lines[1]).toEqual(
      expect.objectContaining({
        textNodePath: [1, 0],
        charStartOffset: 0,
        x: 4,
      }),
    );

    expect(snapshot.lines[2]).toEqual(
      expect.objectContaining({
        textNodePath: [1, 0],
        charStartOffset: 1, // second line of paragraph 1 has offset 1
        x: 4,
      }),
    );
  });

  it('preserves rich-text run paths in layout snapshot', () => {
    const mockBlockManager = {
      calculateLayoutPerParagraph: () => [
        [
          {
            chars: [
              { char: 'R', width: 5, height: 12, fontAscent: 10, textNodeIndex: 0, textNodeOffset: 0 },
              { char: 'T', width: 6, height: 12, fontAscent: 10, textNodeIndex: 1, textNodeOffset: 0 },
            ],
            width: 11,
            height: 12,
            fontAscent: 10,
          },
        ],
      ],
    } as unknown as RichTextBlockLayoutProvider;

    const snapshot = engine.buildSnapshot([], mockBlockManager, 100, 200, 4);

    expect(snapshot.lines).toEqual([
      expect.objectContaining({ textNodePath: [0, 0], charStartOffset: 0, x: 4 }),
      expect.objectContaining({ textNodePath: [0, 1], charStartOffset: 0, x: 9 }),
    ]);

    expect(engine.pointToCursor(11, 14, snapshot)).toEqual({ path: [0, 1], offset: 0 });
    expect(engine.pointToCursor(14, 14, snapshot)).toEqual({ path: [0, 1], offset: 1 });
  });

  it('uses typographic line boxes for block flow height', () => {
    const mockBlockManager = {
      calculateLayoutPerParagraph: () => [
        [{ chars: [{ char: 'a', width: 5, height: 10, fontAscent: 8 }], width: 5, height: 10, fontAscent: 8 }],
        [{ chars: [{ char: 'b', width: 5, height: 10, fontAscent: 8 }], width: 5, height: 10, fontAscent: 8 }],
      ],
    } as unknown as RichTextBlockLayoutProvider;

    const layout = engine.buildSnapshotForBlocks(createDoc(2), mockBlockManager, [0, 1], [0, 10], 100, 0);

    expect(layout.blocks[0].rect.height).toBe(10);
    expect(layout.blocks[0].flowHeight).toBe(10);
    expect(layout.blocks[1].rect.y).toBe(10);
  });

  it('keeps paragraph spacing in flow height while excluding it from the visual rect', () => {
    const flowRegistry = new RichTextBlockFlowRegistry(8);
    flowRegistry.register(createDefaultRichTextBlockFlowContribution());
    const flowEngine = new DocLayoutEngine(flowRegistry);
    const document = createDoc(2);
    document[0].attrs['spacingAfter'] = 12;
    const mockBlockManager = {
      calculateLayoutPerParagraph: () => [
        [{ chars: [{ char: 'a', width: 5, height: 10, fontAscent: 8 }], width: 5, height: 10, fontAscent: 8 }],
        [{ chars: [{ char: 'b', width: 5, height: 10, fontAscent: 8 }], width: 5, height: 10, fontAscent: 8 }],
      ],
    } as unknown as RichTextBlockLayoutProvider;

    const layout = flowEngine.buildSnapshotForBlocks(document, mockBlockManager, [0, 1], [0, 22], 100, 0);

    expect(layout.blocks[0].rect.height).toBe(10);
    expect(layout.blocks[0].flowHeight).toBe(22);
    expect(layout.blocks[1].rect.y).toBe(22);
  });

  it('uses measured run prefix boundaries for cursor positions', () => {
    const mockBlockManager = {
      calculateLayoutPerParagraph: () => [
        [
          {
            chars: [
              { char: 'T', width: 3, height: 12, fontAscent: 10, textNodeIndex: 0, textNodeOffset: 0 },
              { char: 'e', width: 3, height: 12, fontAscent: 10, textNodeIndex: 0, textNodeOffset: 1 },
              { char: 'a', width: 3, height: 12, fontAscent: 10, textNodeIndex: 0, textNodeOffset: 2 },
            ],
            width: 9,
            height: 12,
            fontAscent: 10,
          },
        ],
      ],
    } as unknown as RichTextBlockLayoutProvider;
    const layout = engine.buildSnapshot([], mockBlockManager, 100, 40, 4, 'top');

    expect(layout.lines[0].cursorXOffsets).toEqual([0, 3, 6, 9]);
    expect(engine.cursorToPoint({ path: [0, 0], offset: 2 }, layout)).toEqual({
      x: 10,
      y: 14,
      height: 12,
    });
    expect(engine.pointToCursor(11, 14, layout)).toEqual({ path: [0, 0], offset: 2 });
    expect(engine.pointToCursor(14, 14, layout)).toEqual({ path: [0, 0], offset: 3 });
  });
});
