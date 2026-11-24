import {
  DocCompositionManager,
  DocCursorManager,
  DocInputPlugin,
  type DocCompositionProvider,
} from '@searsuite/sear-assembly-core';
import {
  isTextNode,
  RichTextInlineStyleRegistry,
  RichTextLineBoxRegistry,
  RichTextBlockFlowRegistry,
  defaultRichTextParagraphLayoutDefaults,
  resolveDocNodeId,
  type RichDocNode,
  type RichTextParagraphLayoutDefaults,
} from '@searsuite/sear-domain-doc';
import { BlockManager, RichTextRunRenderRegistry } from '@searsuite/sear-render-node';
import {
  DocLayoutCache,
  DocLayoutEngine,
  DocPageMap,
  type DocBlockLayout,
  type LayoutLine,
  type LayoutSnapshot,
} from '@searsuite/sear-domain-editor';
import { Platform } from '@searsuite/sear-foundation-platform';
import { DocCommandBus } from '@searsuite/sear-assembly-commands';
import { SearError } from '@searsuite/sear-foundation-error';
import { TextMeasurementManager, TextShaper } from '@searsuite/sear-render-metrics';
import { ScrollManager } from '@searsuite/sear-render-scroll';
import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import {
  type CachedBlockLayout,
  type DocCursorPos,
  type DocVirtualLayoutInput,
  type DocVirtualLayoutMaterializationStats,
  type DocVirtualLayoutModelStats,
  type DocVirtualLayoutResult,
  type DocVirtualLayoutSummary,
  type VirtualBlockRecord,
  type DocEditorViewport,
  PrefixHeightIndex,
  compareNumericIndex,
  formatMaterializedIndexes,
} from './DocVirtualLayoutSupport';
import { lockDocVirtualLayoutSummary } from './lockDocVirtualLayoutSummary';

export type {
  DocVirtualLayoutInput,
  DocVirtualLayoutRenderPhase,
  DocVirtualLayoutResult,
  DocVirtualLayoutSummary,
  DocVirtualLayoutTimingSummary,
} from './DocVirtualLayoutSupport';
export type {
  DocBlockRenderDebugCopy,
  DocBlockRenderDebugRect,
  DocBlockRenderDebugSnapshot,
} from '@searsuite/sear-domain-editor';

/** Maintains estimated block geometry and lazily materializes visible rich-text lines. */
@Injectable()
export class DocVirtualLayoutStore {
  readonly #layoutEngine: DocLayoutEngine;
  readonly #textShaper: TextShaper;
  readonly #measurements: TextMeasurementManager;
  readonly #inlineStyleRegistry: RichTextInlineStyleRegistry;
  readonly #lineBoxRegistry: RichTextLineBoxRegistry;
  readonly #blockFlowRegistry: RichTextBlockFlowRegistry;
  readonly #runRenderRegistry: RichTextRunRenderRegistry;
  readonly #inputPlugin: DocInputPlugin;
  readonly #cursorManager: DocCursorManager;
  readonly #compositionProvider: DocCompositionProvider;
  readonly #scrollManager: ScrollManager;
  readonly #platform: Platform;
  readonly #commands: DocCommandBus;

  public static readonly symbol = Symbol.for('DocVirtualLayoutStore');

  #document: readonly RichDocNode[] | null = null;
  #contentWidth = -1;
  #records: VirtualBlockRecord[] = [];
  #blockHeights = new PrefixHeightIndex([]);
  #blockLayoutCache = new Map<number, CachedBlockLayout>();
  #defaultBlockHeight = 14;
  #paragraphLayoutDefaults: RichTextParagraphLayoutDefaults = defaultRichTextParagraphLayoutDefaults;
  #latestSummary: DocVirtualLayoutSummary | null = null;

  public constructor(
    @Inject(DocLayoutEngine.symbol)
    layoutEngine: DocLayoutEngine,
    @Inject(TextShaper.symbol)
    textShaper: TextShaper,
    @Inject(TextMeasurementManager.symbol)
    measurements: TextMeasurementManager,
    @Inject(RichTextInlineStyleRegistry.symbol)
    inlineStyleRegistry: RichTextInlineStyleRegistry,
    @Inject(RichTextLineBoxRegistry.symbol)
    lineBoxRegistry: RichTextLineBoxRegistry,
    @Inject(RichTextBlockFlowRegistry.symbol)
    blockFlowRegistry: RichTextBlockFlowRegistry,
    @Inject(RichTextRunRenderRegistry.symbol)
    runRenderRegistry: RichTextRunRenderRegistry,
    @Inject(DocInputPlugin.symbol)
    inputPlugin: DocInputPlugin,
    @Inject(DocCursorManager.symbol)
    cursorManager: DocCursorManager,
    @Inject(DocCompositionManager.symbol)
    compositionProvider: DocCompositionProvider,
    @Inject(ScrollManager.symbol)
    scrollManager: ScrollManager,
    @Inject(Platform.symbol)
    platform: Platform,
    @Inject(DocCommandBus.symbol)
    commands: DocCommandBus,
  ) {
    this.#layoutEngine = layoutEngine;
    this.#textShaper = textShaper;
    this.#measurements = measurements;
    this.#inlineStyleRegistry = inlineStyleRegistry;
    this.#lineBoxRegistry = lineBoxRegistry;
    this.#blockFlowRegistry = blockFlowRegistry;
    this.#runRenderRegistry = runRenderRegistry;
    this.#inputPlugin = inputPlugin;
    this.#cursorManager = cursorManager;
    this.#compositionProvider = compositionProvider;
    this.#scrollManager = scrollManager;
    this.#platform = platform;
    this.#commands = commands;
    Object.freeze(this);
  }

  #assertCommandWrite(): void {
    if (!this.#commands.isExecuting()) throw new SearError('Doc layout changes must run through editor.commands.run(...).');
  }

  public reset(): void {
    this.#assertCommandWrite();
    this.#document = null;
    this.#contentWidth = -1;
    this.#records = [];
    this.#blockHeights = new PrefixHeightIndex([]);
    this.#blockLayoutCache.clear();
    this.#latestSummary = null;
    this.#paragraphLayoutDefaults = defaultRichTextParagraphLayoutDefaults;
  }

  public getLatestSummary(): DocVirtualLayoutSummary | null {
    return this.#latestSummary;
  }

  public prepare(input: DocVirtualLayoutInput): DocVirtualLayoutResult {
    this.#assertCommandWrite();
    const totalStart = this.#platform.now();
    const contentWidth = Math.max(0, input.contentRect.width);

    const documentModelStart = this.#platform.now();
    const modelStats = this.#ensureDocumentModel(input.document, contentWidth, input);
    const documentModelMs = this.#readElapsed(documentModelStart);

    const viewportRangeStart = this.#platform.now();
    const visibleRange = this.#computeMaterializationRange(input.viewport);
    const cursorBlockIndex = this.#getCursorBlockIndex(input.selection.head);
    const materializedIndexes = this.#createMaterializedIndexes(visibleRange, cursorBlockIndex);
    const viewportRangeMs = this.#readElapsed(viewportRangeStart);

    const materializeBlocksStart = this.#platform.now();
    const materialized = this.#materializeBlocks(materializedIndexes, input);
    const materializeBlocksMs = this.#readElapsed(materializeBlocksStart);

    let heightCorrectionMs = 0;
    if (materialized.heightChanged) {
      const heightCorrectionStart = this.#platform.now();
      heightCorrectionMs = this.#readElapsed(heightCorrectionStart);
    }

    const snapshotCacheStart = this.#platform.now();
    const snapshot = this.#createSnapshot(materialized.blockLayouts);
    const cache = new DocLayoutCache(snapshot, this.#createCacheBlocks(materialized.blockLayouts));
    const pageMap = DocPageMap.fromLayoutCache(cache, Math.max(1, input.contentRect.height));
    const visibleBlocks = this.#selectMaterializedBlocks(cache, materializedIndexes);
    const snapshotCacheMs = this.#readElapsed(snapshotCacheStart);
    const documentRect = {
      x: input.contentRect.x,
      y: input.contentRect.y,
      width: input.contentRect.width,
      height: this.#getDocumentHeight(),
    };

    const cursorRelative = this.#layoutEngine.cursorToPoint(input.selection.head, snapshot);
    const composingCaretPixelOffset = this.#compositionProvider.measure(
      input.font ?? '16px sans-serif',
    ).caretPixelOffset;

    const cursorSelectionStart = this.#platform.now();
    this.#inputPlugin.setLastSnapshot(snapshot);
    this.#cursorManager.setCursor({
      x: documentRect.x + cursorRelative.x,
      y: documentRect.y + cursorRelative.y,
      height: cursorRelative.height,
      visible: input.cursorVisible,
    });
    this.#cursorManager.setSelectionRects(
      this.#layoutEngine.getSelectionRects(input.selection, snapshot, documentRect.x, documentRect.y),
    );
    const cursorSelectionMs = this.#readElapsed(cursorSelectionStart);
    const virtualLayoutTotalMs = this.#readElapsed(totalStart);
    this.#latestSummary = lockDocVirtualLayoutSummary({
      model: modelStats.status,
      totalBlocks: modelStats.blockCount,
      rangeStart: visibleRange.start,
      rangeEnd: visibleRange.end,
      cursorBlock: cursorBlockIndex,
      materializedBlocks: materializedIndexes.length,
      materializedIndexes: formatMaterializedIndexes(materializedIndexes),
      cacheHits: materialized.cacheHits,
      cacheMisses: materialized.cacheMisses,
      heightIndexUpdated: materialized.heightChanged,
      documentHeight: documentRect.height,
      timings: {
        documentModelMs,
        viewportRangeMs,
        materializeBlocksMs,
        heightCorrectionMs,
        snapshotCacheMs,
        cursorSelectionMs,
        virtualLayoutTotalMs,
      },
    });

    return Object.freeze({
      layoutCache: cache,
      pageMap,
      visibleBlocks: Object.freeze(visibleBlocks),
      documentRect: Object.freeze(documentRect),
      cursorX: documentRect.x + cursorRelative.x,
      cursorY: documentRect.y + cursorRelative.y,
      composingCaretPixelOffset,
    });
  }

  #ensureDocumentModel(
    document: readonly RichDocNode[],
    contentWidth: number,
    input: DocVirtualLayoutInput,
  ): DocVirtualLayoutModelStats {
    const paragraphLayoutDefaults = input.paragraphLayoutDefaults ?? defaultRichTextParagraphLayoutDefaults;
    if (
      this.#document === document &&
      this.#contentWidth === contentWidth &&
      sameParagraphLayoutDefaults(this.#paragraphLayoutDefaults, paragraphLayoutDefaults)
    ) {
      return { status: 'reused', blockCount: this.#records.length };
    }
    const previousMeasuredHeights = new Map(this.#records.map((record) => [record.id, record.measuredHeight] as const));
    this.#document = document;
    const geometryChanged = this.#contentWidth !== contentWidth;
    const paragraphLayoutChanged = !sameParagraphLayoutDefaults(this.#paragraphLayoutDefaults, paragraphLayoutDefaults);
    this.#contentWidth = contentWidth;
    this.#paragraphLayoutDefaults = paragraphLayoutDefaults;
    if (geometryChanged || paragraphLayoutChanged || input.reflowBlockIds === null) this.#blockLayoutCache.clear();
    this.#defaultBlockHeight = this.#computeDefaultBlockHeight(input);
    this.#records = [];
    for (let index = 0; index < document.length; index++) {
      const record = this.#createVirtualBlockRecord(document[index], index);
      record.measuredHeight = paragraphLayoutChanged ? null : previousMeasuredHeights.get(record.id) ?? null;
      if (record.measuredHeight === null) {
        record.estimatedHeight += this.#blockFlowRegistry.resolve({
          node: record.node,
          index,
          blockCount: document.length,
        });
      }
      this.#records.push(record);
    }
    this.#blockHeights = new PrefixHeightIndex(createRecordHeights(this.#records));
    return { status: 'rebuilt', blockCount: this.#records.length };
  }

  #createVirtualBlockRecord(node: RichDocNode, index: number): VirtualBlockRecord {
    return {
      id: resolveDocNodeId(node, [index]),
      index,
      node,
      estimatedHeight: this.#defaultBlockHeight,
      measuredHeight: null,
    };
  }

  #computeDefaultBlockHeight(input: DocVirtualLayoutInput): number {
    const space = this.#measurements.measureSpace(input.font ?? '16px sans-serif');
    return Math.max(1, space.height);
  }

  #getRecordHeight(record: VirtualBlockRecord): number {
    return Math.max(1, record.measuredHeight ?? record.estimatedHeight);
  }

  #computeMaterializationRange(viewport: DocEditorViewport): { readonly start: number; readonly end: number } {
    if (this.#records.length === 0) return { start: 0, end: -1 };
    const top = this.#readScrollY();
    const singleScreenBlockCount = Math.max(1, Math.ceil(viewport.height / this.#defaultBlockHeight));
    const overscanBlockCount = singleScreenBlockCount;
    const materializedBlockCount = singleScreenBlockCount + overscanBlockCount * 2;
    const anchor = this.#findBlockIndex(top);
    const maxStart = Math.max(0, this.#records.length - materializedBlockCount);
    const start = Math.min(Math.max(0, anchor - overscanBlockCount), maxStart);
    const end = Math.min(this.#records.length - 1, start + materializedBlockCount - 1);
    return { start, end };
  }

  #readScrollY(): number {
    return this.#scrollManager.getState().y;
  }

  #findBlockIndex(y: number): number {
    return this.#blockHeights.findIndexAt(y);
  }

  #getCursorBlockIndex(cursor: DocCursorPos): number | null {
    const index = cursor.path[0];
    return Number.isInteger(index) && index >= 0 && index < this.#records.length ? index : null;
  }

  #createMaterializedIndexes(
    range: { readonly start: number; readonly end: number },
    cursorBlockIndex: number | null,
  ): readonly number[] {
    const indexes = new Set<number>();
    for (let index = range.start; index <= range.end; index++) indexes.add(index);
    if (cursorBlockIndex !== null) indexes.add(cursorBlockIndex);
    return [...indexes].sort(compareNumericIndex);
  }

  #materializeBlocks(
    indexes: readonly number[],
    input: DocVirtualLayoutInput,
  ): DocVirtualLayoutMaterializationStats {
    const blockLayouts: DocBlockLayout[] = [];
    let heightChanged = false;
    let cacheHits = 0;
    let cacheMisses = 0;

    for (const index of indexes) {
      const record = this.#records[index];
      if (!record) continue;
      const cached = this.#getCachedBlockLayout(record, input);
      cached.fromCache ? cacheHits++ : cacheMisses++;
      const previousHeight = this.#getRecordHeight(record);
      record.measuredHeight = cached.layout.flowHeight;
      const nextHeight = this.#getRecordHeight(record);
      if (previousHeight !== nextHeight) {
        this.#blockHeights.update(record.index, nextHeight);
        heightChanged = true;
      }
      blockLayouts.push(this.#createBlockLayout(record, cached.layout, 0, 0));
    }

    return { blockLayouts, heightChanged, cacheHits, cacheMisses };
  }

  #getCachedBlockLayout(
    record: VirtualBlockRecord,
    input: DocVirtualLayoutInput,
  ): { readonly layout: CachedBlockLayout; readonly fromCache: boolean } {
    const cached = this.#blockLayoutCache.get(record.index);
    const needsReflow = input.reflowBlockIds === null || input.reflowBlockIds?.has(record.id) === true;
    if (!needsReflow && cached && cached.contentWidth === this.#contentWidth) {
      const layout = input.repaintBlockIds?.has(record.id) ? this.#refreshCachedBlockPaintState(record, cached) : cached;
      return { layout, fromCache: true };
    }

    const blockManager = new BlockManager(
      this.#textShaper,
      this.#inlineStyleRegistry,
      this.#runRenderRegistry,
      this.#lineBoxRegistry,
      input.font,
      input.paragraphLayoutDefaults ?? defaultRichTextParagraphLayoutDefaults,
    );
    blockManager.add(record.node);
    const blockSnapshot = this.#layoutEngine.buildSnapshotForBlocks(
      input.document as RichDocNode[],
      blockManager,
      [record.index],
      [0],
      this.#contentWidth,
      0,
    );
    const lines = blockSnapshot.snapshot.lines;
    const visualHeight = Math.max(1, blockSnapshot.blocks[0]?.rect.height ?? this.#defaultBlockHeight);
    const flowHeight = Math.max(1, blockSnapshot.blocks[0]?.flowHeight ?? visualHeight);
    const next = {
      node: record.node,
      contentWidth: this.#contentWidth,
      lines,
      height: visualHeight,
      flowHeight,
    };
    this.#blockLayoutCache.set(record.index, next);
    return { layout: next, fromCache: false };
  }

  #refreshCachedBlockPaintState(record: VirtualBlockRecord, cached: CachedBlockLayout): CachedBlockLayout {
    const lines = cached.lines.map((line) => ({
      ...line,
      chars: line.chars.map((char) => {
        if (char.textNodeIndex === void 0) return char;
        const child = (record.node.content as RichDocNode[])[char.textNodeIndex];
        if (!isTextNode(child)) return char;
        const style = this.#inlineStyleRegistry.readTextNodeStyle(child);
        if (style) return { ...char, style };
        const { style: _removedStyle, ...rest } = char;
        return rest;
      }),
    }));
    const next = { ...cached, node: record.node, lines };
    this.#blockLayoutCache.set(record.index, next);
    return next;
  }

  #createSnapshot(materializedBlocks: readonly DocBlockLayout[]): LayoutSnapshot {
    const lines: LayoutLine[] = [];
    for (const block of materializedBlocks) {
      const record = this.#records[block.index];
      const cached = this.#blockLayoutCache.get(block.index);
      if (!record || !cached) continue;
      const blockTop = this.#getRecordTop(record.index);
      for (const line of cached.lines) {
        lines.push({
          ...line,
          y: line.y + blockTop,
        });
      }
    }
    return { lines };
  }

  #createCacheBlocks(materializedBlocks: readonly DocBlockLayout[]): readonly DocBlockLayout[] {
    const lineRanges = new Map<number, { lineStart: number; lineEnd: number }>();
    let cursor = 0;
    for (const block of materializedBlocks) {
      const cached = this.#blockLayoutCache.get(block.index);
      const count = cached?.lines.length ?? 0;
      lineRanges.set(block.index, { lineStart: cursor, lineEnd: cursor + count });
      cursor += count;
    }

    const blocks: DocBlockLayout[] = [];
    let blockTop = 0;
    for (const record of this.#records) {
      const cached = this.#blockLayoutCache.get(record.index);
      const range = lineRanges.get(record.index) ?? { lineStart: 0, lineEnd: 0 };
      const height = this.#getRecordHeight(record);
      blocks.push({
        id: record.id,
        index: record.index,
        lineStart: range.lineStart,
        lineEnd: range.lineEnd,
        rect: {
          x: cached && cached.lines.length > 0 ? getLeftMostLineX(cached.lines) : 0,
          y: blockTop,
          width: this.#contentWidth,
          height: cached?.height ?? height,
        },
        flowHeight: cached?.flowHeight ?? height,
      });
      blockTop += height;
    }
    return blocks;
  }

  #createBlockLayout(
    record: VirtualBlockRecord,
    cached: CachedBlockLayout,
    lineStart: number,
    lineEnd: number,
  ): DocBlockLayout {
    return {
      id: record.id,
      index: record.index,
      lineStart,
      lineEnd,
      rect: { x: 0, y: this.#getRecordTop(record.index), width: this.#contentWidth, height: cached.height },
      flowHeight: cached.flowHeight,
    };
  }

  #selectMaterializedBlocks(cache: DocLayoutCache, indexes: readonly number[]): readonly DocBlockLayout[] {
    const blocks: DocBlockLayout[] = [];
    for (const index of indexes) {
      const block = cache.getBlockByIndex(index);
      if (block) blocks.push(block);
    }
    return blocks;
  }

  #getDocumentHeight(): number {
    return Math.max(1, this.#blockHeights.totalHeight);
  }

  #getRecordTop(index: number): number {
    return this.#blockHeights.getTop(index);
  }

  #readElapsed(start: number): number {
    return this.#platform.now() - start;
  }
}

function getVirtualRecordHeight(record: VirtualBlockRecord): number {
  return Math.max(1, record.measuredHeight ?? record.estimatedHeight);
}

function getLeftMostLineX(lines: readonly LayoutLine[]): number {
  let left = Number.POSITIVE_INFINITY;
  for (const line of lines) left = Math.min(left, line.x);
  return left;
}

function createRecordHeights(records: readonly VirtualBlockRecord[]): number[] {
  const heights: number[] = [];
  for (const record of records) heights.push(getVirtualRecordHeight(record));
  return heights;
}

function sameParagraphLayoutDefaults(
  left: RichTextParagraphLayoutDefaults,
  right: RichTextParagraphLayoutDefaults,
): boolean {
  return (
    left.spacingAfter === right.spacingAfter &&
    left.lineSpacing.mode === right.lineSpacing.mode &&
    left.lineSpacing.value === right.lineSpacing.value
  );
}
