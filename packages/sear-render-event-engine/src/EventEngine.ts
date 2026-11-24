import { SearError } from '@searsuite/sear-foundation-error';
import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { ScrollManager } from '@searsuite/sear-render-scroll';
import { CoordinateTransformer, RenderContext, type EventWithOffset } from '@searsuite/sear-render-context';

import { EventListener, Node, NodeProperties, SceneGraph } from '@searsuite/sear-render-node';
import { EventRenderStrategy, HitRenderStrategy, RenderStrategy } from '@searsuite/sear-render-strategy';
import { ConfigEngine } from '@searsuite/sear-assembly-config';
import { EventRegistrar } from './EventRegistrar';

export type { EventWithOffset } from '@searsuite/sear-render-context';

/** Plugin event payload enriched with hit-tested scene target. */
export interface EventWithOffsetAndTarget<NodeTypeProperties extends NodeProperties> {
  /** Original host event emitted by the render context. */
  origin: EventWithOffset;
  /** Topmost scene node hit by the event, or null when empty. */
  target: Node<NodeTypeProperties> | null;
  /** Consecutive click count for this pointer activation, when known. */
  clickCount?: number;
}

function readClickCount(event: EventWithOffset): number | undefined {
  if (event.clickCount !== void 0) return event.clickCount;
  return event.detail !== void 0 ? event.detail : void 0;
}

/** Coordinates render-context events, hit testing and plugin event dispatch. */
@Injectable()
export class EventEngine<NodeTypeProperties extends NodeProperties> extends EventListener<string> {
  readonly #coordinates: CoordinateTransformer;

  /** DI token for resolving the event engine. */
  public static readonly symbol: symbol = Symbol.for('EventEngine');

  readonly #strategies: Map<string | Symbol, RenderStrategy<NodeTypeProperties>> = new Map();
  #cachedStageNode: Node<NodeTypeProperties> | null = null;
  readonly #renderContextEventDisposers: Array<() => void> = [];
  #destroyed = false;

  /** Creates the event engine and installs built-in event strategies. */
  constructor(
    // It may not depend on ScrollManager; ScrollManager itself depends on RenderContext
    @Inject(ScrollManager.symbol) public readonly scrollManager: ScrollManager,
    @Inject(RenderContext.symbol) public readonly renderContext: RenderContext,
    @Inject(SceneGraph.symbol)
    public readonly stageNode: SceneGraph<NodeTypeProperties>,
    @Inject(ConfigEngine.symbol) public readonly configEngine: ConfigEngine,
    @Inject(EventRenderStrategy.symbol)
    public readonly eventRenderStrategy: EventRenderStrategy<NodeTypeProperties>,
    @Inject(HitRenderStrategy.symbol)
    public readonly hitRenderStrategy: HitRenderStrategy<NodeTypeProperties>,
    @Inject(EventRegistrar.symbol)
    public readonly eventRegistrar: EventRegistrar,
    @Inject(CoordinateTransformer.symbol)
    coordinates: CoordinateTransformer,
  ) {
    super();
    this.#coordinates = coordinates;
    this.initialize();
  }

  /** Registers built-in strategies and attaches render-context listeners. */
  initialize() {
    this.addStrategy(EventRenderStrategy.symbol, this.eventRenderStrategy);
    this.addStrategy(HitRenderStrategy.symbol, this.hitRenderStrategy);

    // Register events on the underlying renderContext
    this.registerEventListenersToRenderContext();
    // Forward events triggered by the underlying renderContext
    // this.dispatchEventsFromRenderContext();
  }

  /** Registers a named render strategy used by event handling. */
  addStrategy(name: string | Symbol, strategy: RenderStrategy<NodeTypeProperties>): void {
    this.assertWriteAllowed();
    this.#strategies.set(name, strategy);
  }

  /** Returns a previously registered event render strategy. */
  getStrategy(name: string | Symbol): RenderStrategy<NodeTypeProperties> | undefined {
    return this.#strategies.get(name);
  }

  /** Rebuilds the hit layer for the given scene graph. */
  render(node: Node<NodeTypeProperties>) {
    const strategy = this.getStrategy(HitRenderStrategy.symbol);
    if (!strategy) throw new SearError('Render strategy not found');
    strategy.render(node);
    this.#cachedStageNode = node;
  }

  /**
   * Render the hit canvas immediately, bypassing the debounce timer.
   *
   * See HitRenderStrategy.renderImmediate() for details.
   */
  renderImmediate(node: Node<NodeTypeProperties>) {
    const strategy = this.getStrategy(HitRenderStrategy.symbol) as HitRenderStrategy<NodeTypeProperties>;
    if (!strategy) throw new SearError('Render strategy not found');
    strategy.renderImmediate(node);
    this.#cachedStageNode = node;
  }

  /** Coalesces scroll-driven hit refreshes to at most one per animation frame. */
  renderHitOnNextFrame(node: Node<NodeTypeProperties>) {
    this.hitRenderStrategy.renderOnNextFrame(node);
    this.#cachedStageNode = node;
  }

  /** Attaches platform event listeners to the underlying render context. */
  registerEventListenersToRenderContext() {
    this.assertWriteAllowed();
    const eventRenderStrategy = this.getStrategy(EventRenderStrategy.symbol);
    if (!eventRenderStrategy) throw new SearError('Event render strategy not found');

    const { eventRegistrar } = this;
    eventRegistrar.registeredEvents.forEach((eventKey) => {
      const dispatchRegisteredRenderEvent = (originEvent: EventWithOffset): void => {
        // console.time(`${eventKey}execution time`);

        this.emit(eventKey, {
          origin: originEvent,
          target: this.getNodeAtViewPoint(originEvent.offsetX, originEvent.offsetY),
          clickCount: readClickCount(originEvent),
        });
        // console.timeEnd(`${eventKey}execution time`);
      };
      const dispose = eventRenderStrategy
        .getContext()
        .addEventListener(eventKey.toLowerCase(), dispatchRegisteredRenderEvent);
      this.#renderContextEventDisposers.push(dispose);
    });
  }

  /** Resolves a screen point through the same hit layer used by pointer events. */
  public getNodeAtViewPoint(x: number, y: number): Node<NodeTypeProperties> | null {
    const strategy = this.getStrategy(HitRenderStrategy.symbol) as HitRenderStrategy<NodeTypeProperties> | undefined;
    if (!strategy) throw new SearError('Hit render strategy not found');
    strategy.flushPendingScrollRender();
    const hitPoint = this.#coordinates.viewToRaster({ x, y });
    let targets = strategy.getNodeByCoordinates(this.stageNode, hitPoint.x, hitPoint.y);
    if (!targets.length && this.#cachedStageNode) {
      strategy.renderImmediate(this.#cachedStageNode);
      targets = strategy.getNodeByCoordinates(this.stageNode, hitPoint.x, hitPoint.y);
    }
    return targets[0] ?? null;
  }

  /** Registers a plugin event handler for a normalized event key. */
  registerEvent<Event>(eventKey: string, handler: (event: Event) => void): () => void {
    this.on(eventKey, handler);
    const engine = this;
    return function unregisterPluginEventHandler(): void {
      engine.off(eventKey, handler);
    };
  }

  /** Clears plugin handlers so a destroyed sheet cannot react to host events. */
  destroy(ownerToken?: object): void {
    if (this.#destroyed) return;
    this.beginTeardown(ownerToken);
    this.#destroyed = true;
    try {
      const disposers = this.#renderContextEventDisposers.splice(0);
      disposers.reverse().forEach((dispose) => dispose());
      this.off();
      this.#cachedStageNode = null;
      this.hitRenderStrategy.destroy();
    } finally {
      this.finishTeardown();
    }
  }
}
