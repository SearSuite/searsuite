import { type RichDocNode, type DocCursorPos, type DocSelection, type RichTextParagraphLayoutDefaults } from '@searsuite/sear-domain-doc';
import { DocLayoutCache, DocPageMap, type DocBlockLayout, type DocVerticalAlign, type LayoutLine } from '@searsuite/sear-domain-editor';
import { type PositionRectProps } from '@searsuite/sear-foundation-rect';
import { type DocVirtualLayoutRenderPhase, type DocVirtualLayoutSummary, type DocVirtualLayoutTimingSummary } from './DocViewContracts';
import { type DocEditorContentRect, type DocEditorViewport } from './DocEditorContracts';

export type {
  DocVirtualLayoutRenderPhase,
  DocVirtualLayoutSummary,
  DocVirtualLayoutTimingSummary,
} from './DocViewContracts';

export interface VirtualBlockRecord {
  readonly id: DocBlockLayout['id'];
  readonly index: number;
  readonly node: RichDocNode;
  estimatedHeight: number;
  measuredHeight: number | null;
}

export interface CachedBlockLayout {
  readonly node: RichDocNode;
  readonly contentWidth: number;
  readonly lines: readonly LayoutLine[];
  readonly height: number;
  readonly flowHeight: number;
}

export interface DocVirtualLayoutModelStats {
  readonly status: 'reused' | 'rebuilt';
  readonly blockCount: number;
}

export interface DocVirtualLayoutMaterializationStats {
  readonly blockLayouts: readonly DocBlockLayout[];
  readonly heightChanged: boolean;
  readonly cacheHits: number;
  readonly cacheMisses: number;
}

export interface DocVirtualLayoutInput {
  readonly contentRect: DocEditorContentRect;
  readonly viewport: DocEditorViewport;
  readonly document: readonly RichDocNode[];
  readonly selection: DocSelection;
  readonly cursorVisible: boolean;
  readonly verticalAlign: DocVerticalAlign;
  /** Default text measurement font used for runs without an inline font override. */
  readonly font?: string | undefined;
  readonly paragraphLayoutDefaults?: RichTextParagraphLayoutDefaults;
  /** Reflow blocks whose layout cache must be refreshed; null means the change cannot be localized safely. */
  readonly reflowBlockIds?: ReadonlySet<DocBlockLayout['id']> | null;
  /** Repaint blocks whose cached line styles can be refreshed without reflow measurement. */
  readonly repaintBlockIds?: ReadonlySet<DocBlockLayout['id']>;
}

export interface DocVirtualLayoutResult {
  readonly layoutCache: DocLayoutCache;
  readonly pageMap: DocPageMap;
  readonly visibleBlocks: readonly DocBlockLayout[];
  readonly documentRect: PositionRectProps;
  readonly cursorX: number;
  readonly cursorY: number;
  readonly composingCaretPixelOffset: number;
}

export class PrefixHeightIndex {
  readonly #tree: number[];
  readonly #heights: number[];

  public constructor(heights: readonly number[]) {
    this.#heights = heights.map(normalizeHeight);
    this.#tree = Array.from({ length: this.#heights.length + 1 }, createZero);
    for (let index = 0; index < this.#heights.length; index++) {
      this.#add(index, this.#heights[index]);
    }
  }

  public get totalHeight(): number {
    return this.#sum(this.#heights.length);
  }

  public getTop(index: number): number {
    if (index <= 0) return 0;
    return this.#sum(Math.min(index, this.#heights.length));
  }

  public update(index: number, height: number): void {
    if (index < 0 || index >= this.#heights.length) return;
    const next = normalizeHeight(height);
    const delta = next - this.#heights[index];
    if (delta === 0) return;
    this.#heights[index] = next;
    this.#add(index, delta);
  }

  public findIndexAt(y: number): number {
    if (this.#heights.length === 0) return -1;
    const target = Math.max(0, Math.min(y, Math.max(0, this.totalHeight - 1)));
    let index = 0;
    let bit = highestPowerOfTwoAtMost(this.#heights.length);
    let accumulated = 0;
    while (bit !== 0) {
      const next = index + bit;
      if (next <= this.#heights.length && accumulated + this.#tree[next] <= target) {
        index = next;
        accumulated += this.#tree[next];
      }
      bit >>= 1;
    }
    return Math.min(index, this.#heights.length - 1);
  }

  #add(index: number, delta: number): void {
    for (let cursor = index + 1; cursor < this.#tree.length; cursor += cursor & -cursor) {
      this.#tree[cursor] += delta;
    }
  }

  #sum(count: number): number {
    let total = 0;
    for (let cursor = count; cursor > 0; cursor -= cursor & -cursor) total += this.#tree[cursor];
    return total;
  }
}

export function formatMaterializedIndexes(indexes: readonly number[]): string {
  if (indexes.length <= 24) return indexes.join(',');
  const head = indexes.slice(0, 12).join(',');
  const tail = indexes.slice(indexes.length - 12).join(',');
  return `${head},...,${tail}`;
}

export function compareNumericIndex(left: number, right: number): number {
  return left - right;
}

function normalizeHeight(height: number): number {
  return Math.max(1, height);
}

function createZero(): number {
  return 0;
}

function highestPowerOfTwoAtMost(value: number): number {
  let power = 1;
  while (power * 2 <= value) power *= 2;
  return power;
}

export type { DocCursorPos, DocEditorViewport };
