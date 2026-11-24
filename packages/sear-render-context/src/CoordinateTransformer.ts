import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { PositionRect } from '@searsuite/sear-foundation-rect';
import { ScrollManager, type ScrollManagerState } from '@searsuite/sear-render-scroll';
import { RenderContext } from './RenderContext';

/** Public contract for viewport/world/raster coordinate points. */
export interface CoordinatePoint {
  x: number;
  y: number;
}

/** Single authority for host-view, world, and raster coordinate conversion. */
@Injectable()
export class CoordinateTransformer {
  readonly #scrollManager: ScrollManager;
  readonly #renderContext: RenderContext;
  readonly #hitRenderContext: RenderContext;

  /** DI token for resolving the host-neutral coordinate transformer. */
  public static readonly symbol: symbol = Symbol.for('CoordinateTransformer');

  /** Creates a CoordinateTransformer instance. */
  constructor(
    @Inject(ScrollManager.symbol) scrollManager: ScrollManager,
    @Inject(RenderContext.symbol) renderContext: RenderContext,
    @Inject(RenderContext.hitSymbol)
    hitRenderContext: RenderContext,
  ) {
    this.#scrollManager = scrollManager;
    this.#renderContext = renderContext;
    this.#hitRenderContext = hitRenderContext;
  }

  /** Converts a host-view point into world coordinates. */
  public viewToWorld(
    point: CoordinatePoint,
    scroll: Pick<ScrollManagerState, 'x' | 'y'> = this.#scrollManager.getState(),
  ): CoordinatePoint {
    const scale = this.#renderContext.getViewScale();
    return { x: point.x / scale + scroll.x, y: point.y / scale + scroll.y };
  }

  /** Converts a world point into host-view coordinates. */
  public worldToView(
    point: CoordinatePoint,
    scroll: Pick<ScrollManagerState, 'x' | 'y'> = this.#scrollManager.getState(),
  ): CoordinatePoint {
    const scale = this.#renderContext.getViewScale();
    return { x: (point.x - scroll.x) * scale, y: (point.y - scroll.y) * scale };
  }

  /** Converts a host-view point into raster coordinates for pixel reads. */
  public viewToRaster(point: CoordinatePoint): CoordinatePoint {
    const scale = this.#hitRenderContext.getRasterScale();
    return { x: point.x * scale, y: point.y * scale };
  }

  /** Returns the visible world rect. */
  public getVisibleWorldRect(): PositionRect<unknown> {
    const { x, y } = this.#scrollManager.getState();
    const [width, height] = this.#scrollManager.getShape();
    return new PositionRect(x, y, width, height);
  }
}
