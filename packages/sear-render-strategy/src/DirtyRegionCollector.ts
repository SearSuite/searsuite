import { PositionRect } from '@searsuite/sear-foundation-rect';
import { HexColor } from '@searsuite/sear-foundation-utils';

/** Boundary represented by four world-space edges. */
export interface DirtyRegionBounds {
  /** Left edge in world coordinates. */
  readonly x1: number;
  /** Top edge in world coordinates. */
  readonly y1: number;
  /** Right edge in world coordinates. */
  readonly x2: number;
  /** Bottom edge in world coordinates. */
  readonly y2: number;
}

/**
 * Minimal dirty-region storage contract consumed by {@link DirtyRegionCollector}.
 *
 * Sheet uses `GenerationalDirtyTracker`; future document renderers can provide
 * a block/page dirty source with the same boundary, query and frame-clear
 * contract without depending on Sheet scene internals.
 *
 * @typeParam T Optional key type attached to collected rectangles.
 */
export interface DirtyRegionSource<T = unknown> {
  /** Returns dirty rectangles intersecting the provided query range. */
  query(range: PositionRect<T>): PositionRect<T>[];
  /** Returns the total query boundary that contains all possible dirty entries. */
  getBoundary(): PositionRect<T>;
  /** Clears dirty state after the owning frame has consumed it. */
  clear(): void;
}

/**
 * Collects frame-scoped dirty regions and builds dirty clip geometry.
 *
 * The collector is intentionally independent from Sheet cells. It owns only
 * rectangle collection, frame cleanup, stroke expansion and the concave union
 * clip used when a dirty region must include both a changed area and the
 * previously painted node bounds.
 *
 * @typeParam T Optional key type attached to collected rectangles.
 */
export class DirtyRegionCollector<T = unknown> {
  readonly #source: DirtyRegionSource<T>;

  /**
   * Creates a collector around a frame-scoped dirty source.
   *
   * @param source Dirty source owned by the host renderer.
   */
  public constructor(source: DirtyRegionSource<T>) {
    this.#source = source;
  }

  /**
   * Returns all dirty rectangles accumulated for the current frame.
   *
   * The source is not cleared by this method; callers should clear only after
   * the frame's redraw work has succeeded or has been intentionally skipped.
   */
  public collect(): PositionRect<T>[] {
    return this.#source.query(this.#source.getBoundary());
  }

  /** Clears all dirty rectangles from the underlying source. */
  public clear(): void {
    this.#source.clear();
  }

  /**
   * Expands a dirty rectangle by a symmetric stroke padding.
   *
   * @param rect Dirty rectangle in world coordinates.
   * @param padding Pixels added to every edge.
   * @returns Expanded rectangle suitable for clipping repaint work.
   */
  public static expand<T>(rect: PositionRect<T>, padding: number): PositionRect<HexColor> {
    return new PositionRect<HexColor>(
      rect.x - padding,
      rect.y - padding,
      rect.width + padding * 2,
      rect.height + padding * 2,
    );
  }

  /**
   * Builds the repaint clip for one dirty region and one intersecting node.
   *
   * Most nodes can repaint within the expanded dirty rectangle. Selection-like
   * nodes may need a concave clip covering the union of the dirty region and
   * the node's previous bounds so erased borders do not leave seams.
   *
   * @param dirtyRect Dirty rectangle in world coordinates.
   * @param nodeRect Node bounds in world coordinates.
   * @param strokeWidth Stroke width used to expand both dirty and node bounds.
   * @param useUnionClip Whether to compute the concave union boundary.
   * @returns A rectangle or polygon accepted by scene node draw calls.
   */
  public static createClipRegion<T>(
    dirtyRect: PositionRect<T>,
    nodeRect: PositionRect<T>,
    strokeWidth: number,
    useUnionClip: boolean,
  ): PositionRect<HexColor> | [number, number][] {
    const expandedRect = DirtyRegionCollector.expand(dirtyRect, strokeWidth / 2);
    if (!useUnionClip) return expandedRect;

    const dirtyBounds = DirtyRegionCollector.#toBounds(expandedRect);
    const nodeBounds = DirtyRegionCollector.#toBounds(DirtyRegionCollector.expand(nodeRect, strokeWidth / 2));
    const outerCorners = DirtyRegionCollector.traceUnionBoundary(dirtyBounds, nodeBounds);
    return outerCorners.length >= 3 ? outerCorners : expandedRect;
  }

  /**
   * Removes duplicated points while preserving first occurrence order.
   *
   * @param points Polygon points.
   * @returns Deduplicated polygon points.
   */
  public static dedupePoints(points: [number, number][]): [number, number][] {
    const seen = new Set<string>();
    const unique: [number, number][] = [];
    points.forEach(([x, y]) => {
      const key = `${x},${y}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push([x, y]);
      }
    });
    return unique;
  }

  /**
   * Drops middle vertices that lie on a straight line.
   *
   * Degenerate polygons are preserved as-is so callers can fall back to a
   * rectangle when the boundary cannot form a useful clip.
   *
   * @param points Polygon points in boundary order.
   * @returns Cleaned polygon points.
   */
  public static removeCollinear(points: [number, number][]): [number, number][] {
    if (points.length <= 2) return points;

    const cleaned: [number, number][] = [];
    for (let i = 0; i < points.length; i += 1) {
      const prev = points[(i - 1 + points.length) % points.length];
      const curr = points[i];
      const next = points[(i + 1) % points.length];
      if (DirtyRegionCollector.#cross(prev, curr, next) !== 0) {
        cleaned.push(curr);
      }
    }

    return cleaned.length ? cleaned : points;
  }

  /**
   * Traces the outer boundary of the union of two axis-aligned rectangles.
   *
   * The returned path may be concave and is intended for clip construction,
   * not for hit testing or layout geometry.
   *
   * @param rectA First rectangle bounds.
   * @param rectB Second rectangle bounds.
   * @returns Boundary points in drawing order.
   */
  public static traceUnionBoundary(rectA: DirtyRegionBounds, rectB: DirtyRegionBounds): [number, number][] {
    const xs = [...new Set([rectA.x1, rectA.x2, rectB.x1, rectB.x2])].sort((a, b) => a - b);
    const ys = [...new Set([rectA.y1, rectA.y2, rectB.y1, rectB.y2])].sort((a, b) => a - b);

    if (xs.length < 2 || ys.length < 2) {
      return [
        [rectA.x1, rectA.y1],
        [rectA.x2, rectA.y1],
        [rectA.x2, rectA.y2],
        [rectA.x1, rectA.y2],
      ];
    }

    const cellInUnion = (ix: number, iy: number): boolean => {
      const cx = (xs[ix] + xs[ix + 1]) / 2;
      const cy = (ys[iy] + ys[iy + 1]) / 2;
      const inA = cx >= rectA.x1 && cx <= rectA.x2 && cy >= rectA.y1 && cy <= rectA.y2;
      const inB = cx >= rectB.x1 && cx <= rectB.x2 && cy >= rectB.y1 && cy <= rectB.y2;
      return inA || inB;
    };

    const occupied: boolean[][] = [];
    for (let ix = 0; ix < xs.length - 1; ix += 1) {
      occupied[ix] = [];
      for (let iy = 0; iy < ys.length - 1; iy += 1) {
        occupied[ix][iy] = cellInUnion(ix, iy);
      }
    }

    const directedBoundaryEdges = new Map<string, [number, number]>();
    const addOrCancelEdge = (a: [number, number], b: [number, number]): void => {
      const fw = DirtyRegionCollector.#edgeKey(a, b);
      const rv = DirtyRegionCollector.#edgeKey(b, a);
      if (directedBoundaryEdges.has(rv)) {
        directedBoundaryEdges.delete(rv);
        return;
      }
      directedBoundaryEdges.set(fw, b);
    };

    for (let ix = 0; ix < xs.length - 1; ix += 1) {
      for (let iy = 0; iy < ys.length - 1; iy += 1) {
        if (!occupied[ix][iy]) continue;
        const x0 = xs[ix];
        const x1 = xs[ix + 1];
        const y0 = ys[iy];
        const y1 = ys[iy + 1];

        addOrCancelEdge([x0, y0], [x1, y0]);
        addOrCancelEdge([x1, y0], [x1, y1]);
        addOrCancelEdge([x1, y1], [x0, y1]);
        addOrCancelEdge([x0, y1], [x0, y0]);
      }
    }

    if (!directedBoundaryEdges.size) {
      return [
        [rectA.x1, rectA.y1],
        [rectA.x2, rectA.y1],
        [rectA.x2, rectA.y2],
        [rectA.x1, rectA.y2],
      ];
    }

    const nextByStart = new Map<string, [number, number]>();
    const starts: [number, number][] = [];
    directedBoundaryEdges.forEach((end, edge) => {
      const [startPoint] = edge.split('->');
      const [sx, sy] = startPoint.split(',').map(Number);
      const start: [number, number] = [sx, sy];
      nextByStart.set(DirtyRegionCollector.#pointKey(start), end);
      starts.push(start);
    });

    const start = starts.sort(([ax, ay], [bx, by]) => (ay !== by ? ay - by : ax - bx))[0];
    const startKey = DirtyRegionCollector.#pointKey(start);

    const loop: [number, number][] = [];
    let current = start;
    let currentKey = startKey;
    let guard = 0;
    const maxSteps = nextByStart.size + 5;

    while (guard < maxSteps) {
      guard += 1;
      loop.push(current);

      const next = nextByStart.get(currentKey);
      if (!next) break;

      const nextKey = DirtyRegionCollector.#pointKey(next);
      if (nextKey === startKey) break;

      current = DirtyRegionCollector.#parsePoint(nextKey);
      currentKey = nextKey;
    }

    return DirtyRegionCollector.removeCollinear(loop);
  }

  static #toBounds<T>(rect: PositionRect<T>): DirtyRegionBounds {
    return {
      x1: rect.x,
      y1: rect.y,
      x2: rect.x + rect.width,
      y2: rect.y + rect.height,
    };
  }

  static #cross(o: [number, number], a: [number, number], b: [number, number]): number {
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  }

  static #edgeKey(a: [number, number], b: [number, number]): string {
    return `${a[0]},${a[1]}->${b[0]},${b[1]}`;
  }

  static #pointKey([x, y]: [number, number]): string {
    return `${x},${y}`;
  }

  static #parsePoint(key: string): [number, number] {
    const [x, y] = key.split(',').map(Number);
    return [x, y];
  }
}
