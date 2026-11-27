import { SearCoreDoc } from '@searsuite/sear-assembly-core';
import { DocInputPlugin } from '@searsuite/sear-assembly-doc';
import { type DocCursorPos } from '@searsuite/sear-domain-doc';
import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { Platform } from '@searsuite/sear-foundation-platform';
import { ScrollManager } from '@searsuite/sear-render-scroll';

import { type DocInteractionRuntime, type DocPointerDragHandlers, type DocPointerInput } from './DocInteractionRuntime';
import { addDocPointerDragListeners } from './DocRootEventListeners';
import { DocViewportEnvironment } from './DocViewportEnvironment';

/** Maps host pointer coordinates into document cursor positions. */
@Injectable()
export class DocPointerCoordinateMapper implements DocInteractionRuntime {
  readonly #viewportEnvironment: DocViewportEnvironment;
  readonly #scrollManager: ScrollManager;
  readonly #searCoreDoc: SearCoreDoc;
  readonly #inputPlugin: DocInputPlugin;
  readonly #platform: Platform;

  /** DI token for resolving the document pointer coordinate mapper. */
  public static readonly symbol = Symbol.for('DocPointerCoordinateMapper');

  /** Creates a coordinate mapper for document pointer interaction. */
  public constructor(
    @Inject(DocViewportEnvironment.symbol)
    viewportEnvironment: DocViewportEnvironment,
    @Inject(ScrollManager.symbol)
    scrollManager: ScrollManager,
    @Inject(SearCoreDoc.symbol)
    searCoreDoc: SearCoreDoc,
    @Inject(DocInputPlugin.symbol)
    inputPlugin: DocInputPlugin,
    @Inject(Platform.symbol)
    platform: Platform,
  ) {
    this.#viewportEnvironment = viewportEnvironment;
    this.#scrollManager = scrollManager;
    this.#searCoreDoc = searCoreDoc;
    this.#inputPlugin = inputPlugin;
    this.#platform = platform;
  }

  /** Returns the render root that receives pointer events. */
  public getRoot(): unknown {
    return this.#viewportEnvironment.getRoot();
  }

  /** Returns the current viewport model. */
  public getViewport() {
    return this.#viewportEnvironment.getViewport();
  }

  /** Returns the current editable content rectangle. */
  public getContentRect() {
    return this.#viewportEnvironment.getContentRect();
  }

  /** Resolves render-root offset in host-view coordinates. */
  public readRootViewOffset(): { x: number; y: number } {
    return this.#viewportEnvironment.readRootViewOffset();
  }

  /** Resolves a pointer input to the nearest document cursor. */
  public resolveCursorFromPointer(input: DocPointerInput): DocCursorPos {
    const snapshot = this.#inputPlugin.getLastSnapshot();
    if (!snapshot) return { path: [0, 0], offset: 0 };
    const rootOffset = this.#viewportEnvironment.readRootViewOffset();
    const contentRect = this.#viewportEnvironment.getContentRect();
    const scroll = this.#scrollManager.getState();
    const px = input.viewX - rootOffset.x - contentRect.x + scroll.x;
    const py = input.viewY - rootOffset.y - contentRect.y + scroll.y;
    return this.#searCoreDoc.resolveCursorFromPoint(px, py, snapshot);
  }

  /** Subscribes to pointer-drag input rooted at the document surface. */
  public subscribePointerDrag(handlers: DocPointerDragHandlers): () => void {
    return addDocPointerDragListeners(this.#platform, this.#viewportEnvironment.getRoot(), handlers);
  }
}
