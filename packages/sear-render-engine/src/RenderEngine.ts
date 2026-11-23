import { Inject } from '@searsuite/sear-foundation-di';
import { ScrollManager } from '@searsuite/sear-render-scroll';
import { Node, NodeProperties } from '@searsuite/sear-render-node';
import { RenderContext } from '@searsuite/sear-render-context';
import { ConfigEngine } from '@searsuite/sear-assembly-config';
import { RenderStrategyManager } from '@searsuite/sear-render-strategy';
import { RenderCoordinatorManager } from '@searsuite/sear-render-registry';
import { PositionRect } from '@searsuite/sear-foundation-rect';
import { HexColor } from '@searsuite/sear-foundation-utils';

// import { Renderer } from "./renderer";

/**
 * Rendering boundary between the editor's scene and a host render context.
 *
 * A concrete engine chooses strategies for painting, dirty regions, and cache
 * reuse. The core supplies scene nodes after state commits; callers can mark
 * affected regions, resize the target, or invalidate cached pixels before the
 * next render. The abstract class does not select a browser drawing API.
 */
export abstract class RenderEngine<NodeType extends NodeProperties, RenderCoordinatorManagerType> {
  /** DI token for resolving RenderEngine. */
  public static readonly symbol: symbol = Symbol.for('RenderEngine');

  /** Creates a RenderEngine instance. */
  constructor(
    @Inject(ScrollManager.symbol) public readonly scrollManager: ScrollManager,
    @Inject(RenderContext.symbol) public readonly renderContext: RenderContext,
    @Inject(ConfigEngine.symbol) public readonly configEngine: ConfigEngine,
    @Inject(RenderCoordinatorManager.symbol)
    public readonly renderCoordinatorManager: RenderCoordinatorManagerType,
    @Inject(RenderStrategyManager.symbol)
    public readonly renderStrategyManager: RenderStrategyManager<NodeType>,
  ) {}

  /** Initializes RenderEngine. */
  abstract initialize(): void;
  /** Renders RenderEngine scene output. */
  abstract render(node: Node<NodeType>): void;
  /** Resizes the render target and invalidates dependent frame state. */
  abstract resize(width: number, height: number, scale: number): void;
  /** Updates the view scale. */
  abstract setViewScale(scale: number): void;
  /** Discard pixel-cache reuse before the next render. */
  abstract invalidateScreenCache(): void;

  /** Marks a region or the current scene for rendering on the next frame. */
  abstract markDirty(rect: PositionRect<HexColor>): void;
}
