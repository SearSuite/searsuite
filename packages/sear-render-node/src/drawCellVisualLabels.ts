import { type RenderContext } from '@searsuite/sear-render-context';
import { type TextShaper } from '@searsuite/sear-render-metrics';
import { type CellVisualLabel } from './types';

/** Paints bounded labels using the editor-local shaping adapter. */
export function drawCellVisualLabels(
  context: RenderContext,
  shaper: TextShaper,
  labels: readonly CellVisualLabel[],
  bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  font: string,
): void {
  context.save();
  context.beginPath();
  context.rect(bounds.x, bounds.y, bounds.width, bounds.height);
  context.clip();
  context.setFont(font);
  let left = bounds.x + 3;
  for (const label of labels) {
    if (left >= bounds.x + bounds.width) break;
    const metrics = shaper.shape({ text: label.text, font });
    const height = Math.min(bounds.height - 4, metrics.height + 4);
    if (height <= 0) break;
    const top = bounds.y + (bounds.height - height) / 2;
    const width = metrics.width + 8;
    context.beginPath();
    context.rect(left, top, width, height);
    context.setFillStyle(label.fill);
    context.fill();
    context.setFillStyle(label.color ?? '#1f2937');
    context.fillText(
      label.text,
      left + 4,
      top + (height - metrics.height) / 2 + (metrics.fontAscent ?? metrics.height),
    );
    left += width + 3;
  }
  context.restore();
}
