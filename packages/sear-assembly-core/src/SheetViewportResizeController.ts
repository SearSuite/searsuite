import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { SubscriptionManager } from '@searsuite/sear-foundation-subscription';
import { type SheetLifecycleContext, type SheetLifecycleController } from './SheetLifecycleController';
import { type SheetConfig } from '@searsuite/sear-assembly-config';
import { SearError } from '@searsuite/sear-foundation-error';

/** Keeps rendering, scrolling, and viewport-culled plugin nodes in sync with viewport size. */
@Injectable()
export class SheetViewportResizeController implements SheetLifecycleController {
  /** DI token for resolving SheetViewportResizeController. */
  public static readonly symbol = Symbol.for('SheetViewportResizeController');

  private context: SheetLifecycleContext | undefined;
  private stopObserving: (() => void) | undefined;
  private resizeExecutor: ((size: { width: number; height: number }) => void) | undefined;

  /** Creates a SheetViewportResizeController instance. */
  constructor(
    @Inject(SubscriptionManager.symbol)
    private readonly subscriptionManager: SubscriptionManager,
  ) {}

  /** Routes platform resize notifications through the owning editor's command bus. */
  setResizeExecutor(executor: (size: { width: number; height: number }) => void): void {
    if (this.resizeExecutor || this.context) throw new SearError('Sheet viewport resize executor is already configured.');
    this.resizeExecutor = executor;
  }

  /** Starts SheetViewportResizeController. */
  start(context: SheetLifecycleContext): void {
    if (this.context) return;
    this.context = context;
    this.stopObserving = this.subscriptionManager.observeResize(
      context.core.renderEngine.renderContext.getRenderTarget(),
      this.handleViewportResize.bind(this),
    );

    // Plugin rendering can be viewport-culled. Run the same complete
    // synchronization once after every sheet has finished bootstrapping,
    // even when its current dimensions have not changed yet.
    const [width, height] = context.core.renderEngine.scrollManager.getShape();
    this.requestViewportResize(width, height, true);
  }

  /** Releases resources owned by SheetViewportResizeController. */
  destroy(): void {
    this.stopObserving?.();
    this.stopObserving = void 0;
    this.context = void 0;
  }

  private handleViewportResize({ width, height }: { width: number; height: number }): void {
    this.requestViewportResize(width, height, false);
  }

  private requestViewportResize(width: number, height: number, force: boolean): void {
    const context = this.context;
    if (!context || width <= 0 || height <= 0) return;
    const [currentWidth, currentHeight] = context.core.renderEngine.scrollManager.getShape();
    if (!force && currentWidth === width && currentHeight === height) return;
    if (this.resizeExecutor) this.resizeExecutor({ width, height });
    else this.applyViewportResize(width, height);
  }

  /** Applies a resize inside the command dispatched by the owning editor. */
  applyViewportResize(width: number, height: number): void {
    const context = this.context;
    if (!context || width <= 0 || height <= 0) return;
    const { core } = context;
    const scale = (core.configEngine.getDefaultConfig() as Partial<SheetConfig>).devicePixelRatio ?? 4;
    core.renderEngine.scrollManager.resize(width, height);
    core.renderEngine.resize(width, height, scale);
    context.refreshSheetBoundaries();

    core.pluginManager.forEach((plugin) => {
      plugin.onResize?.();
      if (!plugin.render) return;
      const shapes = plugin.render(core) || [];
      core.getStage().addPluginNode(plugin.key.key, shapes);
    });

    // Resizing clears canvas backing stores. Rebuild visual and hit layers.
    core.renderEngine.render(core.getStage());
    core.eventEngine.renderImmediate(core.getStage());
  }
}
