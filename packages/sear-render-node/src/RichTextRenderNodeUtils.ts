import { PositionRect } from '@searsuite/sear-foundation-rect';
import { type HexColor } from '@searsuite/sear-foundation-utils';
import { RenderContext } from '@searsuite/sear-render-context';

import { type ClipRegion } from './Node';

/** Creates a world-space rectangle for one rich-text line/run. */
export function createRichTextRunRect(
  x: number,
  baselineY: number,
  width: number,
  height: number,
  fontAscent: number,
): PositionRect<HexColor> {
  return new PositionRect<HexColor>(x, baselineY - fontAscent, width, height);
}

/** Applies a rectangular or polygonal clip region to the active render context. */
export function applyClip(context: RenderContext, clipRegion?: ClipRegion): void {
  if (!clipRegion) return;
  context.beginPath();
  if (Array.isArray(clipRegion)) {
    if (clipRegion.length < 3) return;
    context.moveTo(clipRegion[0][0], clipRegion[0][1]);
    for (let index = 1; index < clipRegion.length; index++) {
      context.lineTo(clipRegion[index][0], clipRegion[index][1]);
    }
    context.closePath();
  } else {
    context.rect(clipRegion.x, clipRegion.y, clipRegion.width, clipRegion.height);
  }
  context.clip();
}
