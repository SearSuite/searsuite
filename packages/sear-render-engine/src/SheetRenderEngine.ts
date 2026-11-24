import { ScrollManagerState } from '@searsuite/sear-render-scroll';
import { DimensionsCSRMatrix } from '@searsuite/sear-domain-matrix';
import { MatrixOTOperation } from '@searsuite/sear-domain-ot';
import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { Node } from '@searsuite/sear-render-node';
import { ScreenRenderStrategy } from '@searsuite/sear-render-strategy';
import { StickyRenderStrategy } from '@searsuite/sear-render-strategy';
import { ScrollManager } from '@searsuite/sear-render-scroll';
import { RenderContext } from '@searsuite/sear-render-context';
import { ConfigEngine } from '@searsuite/sear-assembly-config';
import { RenderStrategy, RenderStrategyManager, DirtyRenderStrategy } from '@searsuite/sear-render-strategy';
import {
  RenderCoordinatorManager,
  CellProperties,
  SheetRenderCoordinatorManager,
} from '@searsuite/sear-render-registry';
import { OverlayRenderStrategy } from '@searsuite/sear-render-strategy';

import { RenderEngine } from './RenderEngine';
import { PositionRect } from '@searsuite/sear-foundation-rect';
import { HexColor } from '@searsuite/sear-foundation-utils';

interface ISheetViewPluginState {
  colShapeState: DimensionsCSRMatrix;
  rowShapeState: DimensionsCSRMatrix;
}

// Should be renamed to SheetRenderEngine (MatrixType is expected to be fixed)
/**
 * Concrete Sheet renderer composed from screen, dirty, sticky, and overlay passes.
 *
 * The passes run in that order so sticky headers survive dirty-region redraws
 * and overlays remain visible above cell content. Resizing or changing the
 * view scale invalidates retained screen pixels; the next render repaints
 * through the configured render contexts.
 */
@Injectable()
export class SheetRenderEngine extends RenderEngine<CellProperties, SheetRenderCoordinatorManager> {
  readonly #offScreenRenderContext: RenderContext;
  readonly #hitRenderContext: RenderContext;
  readonly #screenRenderStrategy: ScreenRenderStrategy<CellProperties>;
  readonly #dirtyRenderStrategy: DirtyRenderStrategy<CellProperties>;
  readonly #stickyRenderStrategy: StickyRenderStrategy<CellProperties>;
  readonly #overlayRenderStrategy: OverlayRenderStrategy<CellProperties>;

  /** Creates a SheetRenderEngine instance. */
  constructor(
    @Inject(ScrollManager.symbol) public readonly scrollManager: ScrollManager,
    @Inject(RenderContext.symbol) public readonly renderContext: RenderContext,
    @Inject(RenderContext.offScreenSymbol)
    offScreenRenderContext: RenderContext,
    @Inject(RenderContext.hitSymbol)
    hitRenderContext: RenderContext,
    @Inject(ConfigEngine.symbol) public readonly configEngine: ConfigEngine,
    @Inject(RenderCoordinatorManager.symbol)
    public readonly renderCoordinatorManager: SheetRenderCoordinatorManager,
    @Inject(RenderStrategyManager.symbol)
    public readonly renderStrategyManager: RenderStrategyManager<CellProperties>,
    @Inject(ScreenRenderStrategy.symbol)
    screenRenderStrategy: ScreenRenderStrategy<CellProperties>,
    @Inject(DirtyRenderStrategy.symbol)
    dirtyRenderStrategy: DirtyRenderStrategy<CellProperties>,
    @Inject(StickyRenderStrategy.symbol)
    stickyRenderStrategy: StickyRenderStrategy<CellProperties>,
    @Inject(OverlayRenderStrategy.symbol)
    overlayRenderStrategy: OverlayRenderStrategy<CellProperties>,
  ) {
    super(scrollManager, renderContext, configEngine, renderCoordinatorManager, renderStrategyManager);
    this.#offScreenRenderContext = offScreenRenderContext;
    this.#hitRenderContext = hitRenderContext;
    this.#screenRenderStrategy = screenRenderStrategy;
    this.#dirtyRenderStrategy = dirtyRenderStrategy;
    this.#stickyRenderStrategy = stickyRenderStrategy;
    this.#overlayRenderStrategy = overlayRenderStrategy;
    this.renderStrategyManager.addStrategy(ScreenRenderStrategy.symbol, this.#screenRenderStrategy);
    // Order: Screen -> Dirty -> Sticky, to avoid Dirty erasing newly drawn sticky header highlights.
    this.renderStrategyManager.addStrategy(DirtyRenderStrategy.symbol, this.#dirtyRenderStrategy);
    this.renderStrategyManager.addStrategy(StickyRenderStrategy.symbol, this.#stickyRenderStrategy);
    // Overlay render must be the last pass so editor visuals always win the final compositing order.
    this.renderStrategyManager.addStrategy(OverlayRenderStrategy.symbol, this.#overlayRenderStrategy);

    this.initialize();
  }
  /** Initializes SheetRenderEngine. */
  initialize() {}

  /** Handles the scroll lifecycle event. */
  public onScroll(scrollManagerState: ScrollManagerState): void {
    // Scroll rendering is driven by ScrollManager state consumed during render.
  }

  /** Handles the click lifecycle event. */
  public onClick(): void {}

  /** Returns the stage. */
  public getStage() {}

  /** Returns the layer. */
  public getLayer() {}

  /** Marks a region or the current scene for rendering on the next frame. */
  public markDirty(rect: PositionRect<HexColor>): void {
    const dirtyStrategy = this.renderStrategyManager.getStrategy(DirtyRenderStrategy.symbol);
    if (dirtyStrategy) dirtyStrategy.dirtyTree.mark(rect);
  }

  /** Renders SheetRenderEngine scene output. */
  public render(node: Node<CellProperties>) {
    this.renderStrategyManager.getAllStrategy().forEach(function renderWithStrategy(strategy) {
      strategy.render(node);
    });
  }

  /** Resizes every canvas layer and invalidates scroll optimization buffers. */
  public resize(width: number, height: number, scale: number): void {
    this.renderContext.resize(width, height, scale);
    this.#offScreenRenderContext.resize(width, height, scale);
    this.#hitRenderContext.resize(width, height, scale);
    this.#offScreenRenderContext.isDrawn = false;
  }

  /** Updates the view scale. */
  public setViewScale(scale: number): void {
    this.renderStrategyManager.setViewScale(scale);
    this.#offScreenRenderContext.isDrawn = false;
  }

  /** Drops retained screen content so the next frame repaints it. */
  public invalidateScreenCache(): void {
    this.#offScreenRenderContext.isDrawn = false;
  }

  /** Applies a transaction to SheetRenderEngine state. */
  public apply(operations: MatrixOTOperation<number>[]) {
    // this.colShapeState = MatrixOT.apply<number, DimensionsCSRMatrix>(this.colShapeState, operations);
    // this.rowShapeState = MatrixOT.apply<number, DimensionsCSRMatrix>(this.rowShapeState, operations);
  }
}
