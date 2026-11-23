import { PositionRect, type PositionRectProps } from '@searsuite/sear-foundation-rect';
import { RenderContext } from '@searsuite/sear-render-context';
import { HexColor } from '@searsuite/sear-foundation-utils';

export function clearViewportRect(context: RenderContext, rect: PositionRectProps): void {
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(rect.x, rect.y, rect.width, rect.height);
  context.restore();
}

export function clearViewport(context: RenderContext, viewport: PositionRectProps): void {
  clearViewportRect(context, viewport);
}

export function worldRectToViewportClearRect<T>(
  rect: PositionRect<T>,
  scrollX: number,
  scrollY: number,
  padding: number,
): PositionRect<HexColor> {
  return new PositionRect<HexColor>(
    rect.x - scrollX - padding,
    rect.y - scrollY - padding,
    rect.width + padding * 2,
    rect.height + padding * 2,
  );
}
