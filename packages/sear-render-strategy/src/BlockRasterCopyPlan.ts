import { PositionRect, type PositionRectProps } from '@searsuite/sear-foundation-rect';
import { type HexColor } from '@searsuite/sear-foundation-utils';
import { type ScrollManagerState } from '@searsuite/sear-render-scroll';
import { type RasterCopyRect } from './RasterCopyPlan';

export interface BlockRasterCopyCandidate {
  readonly source: PositionRectProps;
  readonly destination: PositionRectProps;
}

export interface BlockRasterCopyPlanInput {
  readonly viewport: PositionRectProps;
  readonly scrollState: Pick<ScrollManagerState, 'x' | 'y'>;
  readonly clearWorldRects: readonly PositionRectProps[];
  readonly copies: readonly BlockRasterCopyCandidate[];
  readonly invalidWorldRects: readonly PositionRectProps[];
}

/** Raster-copy plan for layout shifts where unchanged blocks move within the viewport. */
export class BlockRasterCopyPlan {
  public constructor(
    public readonly viewport: PositionRectProps,
    public readonly clearViewportRects: readonly PositionRect<HexColor>[],
    public readonly cacheToViewportCopies: readonly RasterCopyRect[],
    public readonly invalidWorldRects: readonly PositionRect<HexColor>[],
  ) {}

  public static fromLayoutShift(input: BlockRasterCopyPlanInput): BlockRasterCopyPlan | null {
    const clearViewportRects = input.clearWorldRects
      .map((rect) => clipWorldRectToViewportRect(rect, input.viewport, input.scrollState))
      .filter((rect): rect is PositionRect<HexColor> => rect !== null);
    const copies = input.copies
      .map((copy) => clipCopyToViewport(copy, input.viewport, input.scrollState))
      .filter((copy): copy is RasterCopyRect => copy !== null);
    const invalidWorldRects = input.invalidWorldRects
      .map((rect) => clipWorldRectToViewport(rect, input.viewport, input.scrollState))
      .filter((rect): rect is PositionRect<HexColor> => rect !== null);
    if (clearViewportRects.length === 0 || copies.length === 0) return null;
    return new BlockRasterCopyPlan(input.viewport, clearViewportRects, copies, invalidWorldRects);
  }
}

function clipCopyToViewport(
  copy: BlockRasterCopyCandidate,
  viewport: PositionRectProps,
  scrollState: Pick<ScrollManagerState, 'x' | 'y'>,
): RasterCopyRect | null {
  const sourceViewport = worldToViewportRect(copy.source, scrollState);
  const destinationViewport = worldToViewportRect(copy.destination, scrollState);
  const clippedDestination = intersectRects(destinationViewport, viewport);
  if (!clippedDestination) return null;
  const dx = clippedDestination.x - destinationViewport.x;
  const dy = clippedDestination.y - destinationViewport.y;
  return {
    source: {
      x: sourceViewport.x + dx,
      y: sourceViewport.y + dy,
      width: clippedDestination.width,
      height: clippedDestination.height,
    },
    destination: clippedDestination,
  };
}

function clipWorldRectToViewport(
  rect: PositionRectProps,
  viewport: PositionRectProps,
  scrollState: Pick<ScrollManagerState, 'x' | 'y'>,
): PositionRect<HexColor> | null {
  const clipped = clipWorldRectToViewportRect(rect, viewport, scrollState);
  if (!clipped) return null;
  return new PositionRect<HexColor>(
    clipped.x + scrollState.x,
    clipped.y + scrollState.y,
    clipped.width,
    clipped.height,
  );
}

function clipWorldRectToViewportRect(
  rect: PositionRectProps,
  viewport: PositionRectProps,
  scrollState: Pick<ScrollManagerState, 'x' | 'y'>,
): PositionRect<HexColor> | null {
  const viewportRect = worldToViewportRect(rect, scrollState);
  const clipped = intersectRects(viewportRect, viewport);
  if (!clipped) return null;
  return new PositionRect<HexColor>(clipped.x, clipped.y, clipped.width, clipped.height);
}

function worldToViewportRect(
  rect: PositionRectProps,
  scrollState: Pick<ScrollManagerState, 'x' | 'y'>,
): PositionRectProps {
  return {
    x: rect.x - scrollState.x,
    y: rect.y - scrollState.y,
    width: rect.width,
    height: rect.height,
  };
}

function intersectRects(first: PositionRectProps, second: PositionRectProps): PositionRectProps | null {
  const left = Math.max(first.x, second.x);
  const top = Math.max(first.y, second.y);
  const right = Math.min(first.x + first.width, second.x + second.width);
  const bottom = Math.min(first.y + first.height, second.y + second.height);
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}
