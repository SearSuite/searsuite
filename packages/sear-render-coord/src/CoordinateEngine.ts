import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { PluginKey } from '@searsuite/sear-assembly-plugin';
import { ViewExtensionBase } from '@searsuite/sear-render-event-engine';
import { SearCoreSheet } from '@searsuite/sear-assembly-core';
import { ScrollManager } from '@searsuite/sear-render-scroll';
import { CellProperties } from '@searsuite/sear-render-registry';
import type { EventWithOffsetAndTarget } from '@searsuite/sear-render-event-engine';

import { PositionRect } from '@searsuite/sear-foundation-rect';
import { CoordinateTransformer } from '@searsuite/sear-render-context';

const key = new PluginKey('CoordinateEngine');

/** Two-dimensional point in the sheet coordinate system returned by this engine. */
export interface CoordinatePoint {
  /** Horizontal coordinate. */
  x: number;
  /** Vertical coordinate. */
  y: number;
}

/** Local coordinate state tracked by CoordinateEngine. */
export interface CoordinateState {
  /** Latest pointer x-position in host-event view coordinates. */
  mouseScreenX: number;
  /** Latest pointer y-position in host-event view coordinates. */
  mouseScreenY: number;
  /** Latest horizontal scroll offset in world coordinates. */
  scrollX: number;
  /** Latest vertical scroll offset in world coordinates. */
  scrollY: number;
}

/**
 * Creates default local coordinate values.
 * @returns Initial pointer and scroll coordinates.
 */
export function createDefaultCoordinateState(): CoordinateState {
  return {
    mouseScreenX: 0,
    mouseScreenY: 0,
    scrollX: 0,
    scrollY: 0,
  };
}

/**
 * Sheet view service that tracks pointer and scroll coordinates.
 *
 * CoordinateEngine is the view-facing facade over CoordinateTransformer:
 * it caches the latest host pointer position, reads ScrollManager state, and
 * exposes conversions between view and world coordinates.
 */
@Injectable()
export class CoordinateEngine extends ViewExtensionBase<SearCoreSheet, CellProperties> {
  readonly #scrollManager: ScrollManager;
  readonly #coordinates: CoordinateTransformer;

  /** DI token for resolving the coordinate engine. */
  public static readonly symbol: symbol = Symbol.for('CoordinateEngine');
  /** Stable identity for pointer event ordering. */
  public static readonly viewKey = key;

  /** Tracks pointer events before visible views consume them. */
  public depth: number = -Infinity;
  #mouseScreenX = 0;
  #mouseScreenY = 0;

  /**
   * Constructs the coordinate engine and subscribes it to scroll updates.
   * @param scrollManager - Scroll state manager for the current sheet.
   * @param coordinates - Shared coordinate transformer.
   */
  constructor(
    @Inject(ScrollManager.symbol)
    scrollManager: ScrollManager,
    @Inject(CoordinateTransformer.symbol)
    coordinates: CoordinateTransformer,
  ) {
    super(key);
    this.#scrollManager = scrollManager;
    this.#coordinates = coordinates;
  }

  /** Returns a detached projection of the current input and viewport coordinates. */
  public getCoordinateState(): CoordinateState {
    const scroll = this.#scrollManager.getState();
    return {
      mouseScreenX: this.#mouseScreenX,
      mouseScreenY: this.#mouseScreenY,
      scrollX: scroll.x,
      scrollY: scroll.y,
    };
  }

  /**
   * Tracks the latest pointer position from sheet mouse-move events.
   * @param event - Pointer event carrying host-view offsets.
   */
  public onMouseMove(_searCore: SearCoreSheet, event: EventWithOffsetAndTarget<CellProperties>): void {
    this.#mouseScreenX = event.origin.offsetX;
    this.#mouseScreenY = event.origin.offsetY;
  }

  /**
   * Returns the latest pointer position in host-event coordinates.
   * @returns Current pointer coordinate as recorded from mouse events.
   */
  public getCurrentMouseScreen(): CoordinatePoint {
    return { x: this.#mouseScreenX, y: this.#mouseScreenY };
  }

  /**
   * Returns the latest pointer position in scrolled sheet-world coordinates.
   * @returns Current pointer converted through the active scroll transform.
   */
  public getCurrentMouseWorld(): CoordinatePoint {
    return this.#coordinates.viewToWorld({
      x: this.#mouseScreenX,
      y: this.#mouseScreenY,
    });
  }

  /** Returns the latest pointer position in viewport coordinates. */
  public getCurrentMouseView(): CoordinatePoint {
    return this.#coordinates.viewToWorld({ x: this.#mouseScreenX, y: this.#mouseScreenY }, { x: 0, y: 0 });
  }

  /**
   * Converts a host-event point into sheet-world coordinates.
   * @param screenX - Host-event x-coordinate.
   * @param screenY - Host-event y-coordinate.
   * @returns Point in sheet-world coordinates.
   */
  public screenToWorld(screenX: number, screenY: number): CoordinatePoint {
    return this.#coordinates.viewToWorld({ x: screenX, y: screenY });
  }

  /** Converts a host-event point into an unscrolled viewport point. */
  public screenToView(screenX: number, screenY: number): CoordinatePoint {
    return this.#coordinates.viewToWorld({ x: screenX, y: screenY }, { x: 0, y: 0 });
  }

  /**
   * Converts a sheet-world point into host-view coordinates.
   * @param worldX - Sheet-world x-coordinate.
   * @param worldY - Sheet-world y-coordinate.
   * @returns Point in host-view coordinates.
   */
  public worldToScreen(worldX: number, worldY: number): CoordinatePoint {
    return this.#coordinates.worldToView({ x: worldX, y: worldY });
  }

  /**
   * Returns the currently visible sheet-world rectangle.
   * @returns Visible world-space viewport rectangle.
   */
  public getVisibleWorldRect(): PositionRect<unknown> {
    return this.#coordinates.getVisibleWorldRect();
  }

  /**
   * Returns the current host-view viewport rectangle.
   * @returns Visible screen-space rectangle starting at the viewport origin.
   */
  public getVisibleScreenRect(): PositionRect<unknown> {
    const [width, height] = this.#scrollManager.getShape();
    return new PositionRect(0, 0, width, height);
  }
}
