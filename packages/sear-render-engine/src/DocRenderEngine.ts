import { ConfigEngine } from '@searsuite/sear-assembly-config';
import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { PositionRect, type PositionRectProps } from '@searsuite/sear-foundation-rect';
import { type HexColor } from '@searsuite/sear-foundation-utils';
import { RenderContext } from '@searsuite/sear-render-context';
import { type Node, type NodeProperties, SceneGraph } from '@searsuite/sear-render-node';
import { ScrollManager } from '@searsuite/sear-render-scroll';
import {
  type BlockRasterCopyPlan,
  DirtyRenderStrategy,
  OverlayRenderStrategy,
  RenderStrategyManager,
  type ScreenRenderFrameMode,
  ScreenRenderStrategy,
  StickyRenderStrategy,
} from '@searsuite/sear-render-strategy';
import { RenderEngine } from './RenderEngine';

/** Snapshot of the current document viewport used by render strategies. */
export interface DocRenderViewport {
  /** Visible viewport width in host-view units. */
  readonly width: number;
  /** Visible viewport height in host-view units. */
  readonly height: number;
  /** Editable content rectangle inside the viewport. */
  readonly contentRect: PositionRectProps;
}

/**
 * Document render engine that mirrors Sheet's fixed strategy chain.
 *
 * Domain-specific layout and SceneGraph projection
 * happen before this class. The render engine owns only SceneGraph painting,
 * dirty marks, viewport resizing, and ordered strategy dispatch.
 */
@Injectable()
export class DocRenderEngine extends RenderEngine<NodeProperties> {
  readonly #stage: SceneGraph<NodeProperties>;
  readonly #screenRenderStrategy: ScreenRenderStrategy<NodeProperties>;
  readonly #dirtyRenderStrategy: DirtyRenderStrategy<NodeProperties>;
  readonly #stickyRenderStrategy: StickyRenderStrategy<NodeProperties>;
  readonly #overlayRenderStrategy: OverlayRenderStrategy<NodeProperties>;

  /** DI token for resolving DocRenderEngine. */
  public static readonly symbol: symbol = Symbol.for('DocRenderEngine');

  #viewport: DocRenderViewport = {
    width: 0,
    height: 0,
    contentRect: { x: 0, y: 0, width: 0, height: 0 },
  };
  #pendingBlockRasterCopyPlan: BlockRasterCopyPlan | null = null;
  #lastScreenRenderMode: ScreenRenderFrameMode | null = null;

  /** Creates a render engine for one document editor instance. */
  public constructor(
    @Inject(ScrollManager.symbol) scrollManager: ScrollManager,
    @Inject(RenderContext.symbol) renderContext: RenderContext,
    @Inject(ConfigEngine.symbol) configEngine: ConfigEngine,
    @Inject(SceneGraph.symbol) stage: SceneGraph<NodeProperties>,
    @Inject(RenderStrategyManager.symbol)
    renderStrategyManager: RenderStrategyManager<NodeProperties>,
    @Inject(ScreenRenderStrategy.symbol)
    screenRenderStrategy: ScreenRenderStrategy<NodeProperties>,
    @Inject(DirtyRenderStrategy.symbol)
    dirtyRenderStrategy: DirtyRenderStrategy<NodeProperties>,
    @Inject(StickyRenderStrategy.symbol)
    stickyRenderStrategy: StickyRenderStrategy<NodeProperties>,
    @Inject(OverlayRenderStrategy.symbol)
    overlayRenderStrategy: OverlayRenderStrategy<NodeProperties>,
  ) {
    super(scrollManager, renderContext, configEngine, renderStrategyManager);
    this.#stage = stage;
    this.#screenRenderStrategy = screenRenderStrategy;
    this.#dirtyRenderStrategy = dirtyRenderStrategy;
    this.#stickyRenderStrategy = stickyRenderStrategy;
    this.#overlayRenderStrategy = overlayRenderStrategy;
    this.renderStrategyManager.addStrategy(ScreenRenderStrategy.symbol, this.#screenRenderStrategy);
    this.renderStrategyManager.addStrategy(DirtyRenderStrategy.symbol, this.#dirtyRenderStrategy);
    this.renderStrategyManager.addStrategy(StickyRenderStrategy.symbol, this.#stickyRenderStrategy);
    this.renderStrategyManager.addStrategy(OverlayRenderStrategy.symbol, this.#overlayRenderStrategy);
    this.#screenRenderStrategy.configureRuntime({
      getViewport: this.#getCurrentViewportRect.bind(this),
      consumeBlockRasterCopyPlan: this.#consumeBlockRasterCopyPlan.bind(this),
      onFrameRendered: this.#recordScreenFrameRendered.bind(this),
    });
    this.initialize();
  }

  /** Initializes DocRenderEngine. */
  public initialize(): void {}

  /** Updates the viewport model used by subsequent render frames. */
  public setViewport(viewport: DocRenderViewport): void {
    this.#viewport = viewport;
  }

  /** Supplies one layout-shift raster-copy plan for the next screen render pass. */
  public setBlockRasterCopyPlan(plan: BlockRasterCopyPlan | null): void {
    this.#pendingBlockRasterCopyPlan = plan;
  }

  /** Runs the configured document render strategies over the current scene graph. */
  public render(node: Node<NodeProperties>): void;
  public render(node: Node<NodeProperties> = this.#stage): void {
    // debugger;
    this.#lastScreenRenderMode = null;
    this.#prepareFrame();
    for (const strategy of this.renderStrategyManager.getAllStrategy()) {
      if (strategy === this.#dirtyRenderStrategy && this.#shouldSkipDirtyBodyPass()) {
        this.#dirtyRenderStrategy.dirtyTree.clear();
        continue;
      }
      strategy.render(node);
    }
  }

  /** Returns the screen strategy mode used by the last render pass, if it painted. */
  public getLastScreenRenderMode(): ScreenRenderFrameMode | null {
    return this.#lastScreenRenderMode;
  }

  /** Marks one document-world rectangle dirty for the next dirty pass. */
  public markDirty(rect: PositionRect<HexColor>): void {
    const dirtyStrategy = this.renderStrategyManager.getStrategy(DirtyRenderStrategy.symbol);
    if (dirtyStrategy) dirtyStrategy.dirtyTree.mark(rect);
  }

  /** Resizes all Doc render layers and invalidates screen-cache reuse. */
  public resize(width: number, height: number, scale: number): void {
    const contexts = new Set<RenderContext>([this.renderContext]);
    for (const strategy of this.renderStrategyManager.getAllStrategy()) {
      for (const context of strategy.getViewScaleContexts()) contexts.add(context);
    }
    for (const context of contexts) context.resize(width, height, scale);
    this.invalidateScreenCache();
  }

  /** Invalidates the off-screen body cache used by the screen strategy. */
  public invalidateScreenCache(): void {
    for (const strategy of this.renderStrategyManager.getAllStrategy()) {
      strategy.offScreenRenderContext.isDrawn = false;
    }
  }

  /** Updates the view scale on every render strategy context. */
  public setViewScale(scale: number): void {
    this.renderStrategyManager.setViewScale(scale);
    this.invalidateScreenCache();
  }

  #prepareFrame(): void {
    if (this.renderContext.requiresFrameRebuild()) {
      this.renderContext.beginFrame();
    }
  }

  #getCurrentViewportRect(): PositionRect<HexColor> {
    return new PositionRect<HexColor>(0, 0, this.#viewport.width, this.#viewport.height);
  }

  #consumeBlockRasterCopyPlan(): BlockRasterCopyPlan | null {
    const plan = this.#pendingBlockRasterCopyPlan;
    this.#pendingBlockRasterCopyPlan = null;
    return plan;
  }

  #recordScreenFrameRendered(mode: ScreenRenderFrameMode): void {
    this.#lastScreenRenderMode = mode;
  }

  #shouldSkipDirtyBodyPass(): boolean {
    return (
      this.#lastScreenRenderMode === 'full' ||
      this.#lastScreenRenderMode === 'rebuild' ||
      this.#lastScreenRenderMode === 'block-copy'
    );
  }
}
