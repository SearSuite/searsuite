import { PositionRect } from '@searsuite/sear-foundation-rect';
import { DashedLineNode } from './DashedLineNode';
import { type NodeProperties } from './types';

/** Creates a shared visual-only overlay guide for move and resize gestures. */
export function createDragGuideNode<T extends NodeProperties>(
  line: { x1: number; y1: number; x2: number; y2: number },
  properties: Partial<T>,
): DashedLineNode<T> {
  const strokeWidth = properties.strokeWidth ?? 2;
  const bounds = new PositionRect(
    Math.min(line.x1, line.x2) - strokeWidth,
    Math.min(line.y1, line.y2) - strokeWidth,
    Math.abs(line.x2 - line.x1) + strokeWidth * 2,
    Math.abs(line.y2 - line.y1) + strokeWidth * 2,
  );
  return new DashedLineNode<T>(
    bounds,
    {
      stroke: 'rgba(56, 110, 246, 0.8)',
      strokeWidth,
      lineDash: [6, 4],
      ...properties,
      isEdit: true,
      skipHit: true,
    },
    line,
  );
}
