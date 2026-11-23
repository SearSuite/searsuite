import { TextShaper, createFontDescriptor } from '@searsuite/sear-render-metrics';
import { type SheetConfig } from '@searsuite/sear-assembly-config';
import { drawCellVisualLabels } from './drawCellVisualLabels';
import { RenderContext } from '@searsuite/sear-render-context';
import { type PositionRectProps } from '@searsuite/sear-foundation-rect';
import { CellVisualIconShape, CellVisualLayerShape, type CellVisualLayer, type NodeProperties } from './types';
import { RenderNode } from './RenderNode';

/** Draws a feature-contributed visual between a cell background and its content. */
export class CellVisualLayerNode<T extends NodeProperties> extends RenderNode<T> {
  constructor(rect: PositionRectProps, properties: Partial<T>, private readonly layer: CellVisualLayer) {
    super(rect, { ...properties, skipHit: true });
  }

  public drawScene(context: RenderContext): void {
    const x = this.x + this.width * this.layer.x;
    const y = this.y + this.height * this.layer.y;
    const width = this.width * this.layer.width;
    const height = this.height * this.layer.height;
    if (width <= 0 || height <= 0) return;
    context.save();
    context.beginPath();
    context.rect(this.x, this.y, this.width, this.height);
    context.clip();
    if (this.layer.labels) {
      const config = this.configEngine.getDefaultConfig() as Partial<SheetConfig>;
      drawCellVisualLabels(
        context,
        this.resolveRuntime<TextShaper>(TextShaper.symbol),
        this.layer.labels,
        { x, y, width, height },
        createFontDescriptor({
          fontSize: config.sheetCellFontSize ?? 10,
          fontFamily: config.sheetCellFontFamily ?? 'sans-serif',
        }),
      );
      context.restore();
      return;
    }
    if (this.layer.icon) {
      const size = Math.min(16, Math.max(0, height - 4), Math.max(0, width - 4));
      if (size > 0) drawIcon(context, x + 4, y + (height - size) / 2, size, this.layer.icon);
      context.restore();
      return;
    }
    const fill = this.layer.fill;
    if (typeof fill === 'string') {
      context.beginPath();
      if (this.layer.shape === CellVisualLayerShape.TopLeftTriangle) {
        context.moveTo(x, y);
        context.lineTo(x + width, y);
        context.lineTo(x, y + height);
        context.closePath();
      } else {
        context.rect(x, y, width, height);
      }
      context.setFillStyle(fill);
      context.fill();
    } else if (fill) {
      const segments = 16;
      for (let index = 0; index < segments; index++) {
        context.beginPath();
        context.rect(x + (width * index) / segments, y, width / segments + 0.1, height);
        context.setFillStyle(interpolateHex(fill.start, fill.end, (index + 0.5) / segments));
        context.fill();
      }
    }
    context.restore();
  }

  public drawHit(): void {}

  public clear(context: RenderContext): void {
    context.clearRect(this.x, this.y, this.width, this.height);
  }
}

function drawIcon(
  context: RenderContext,
  x: number,
  y: number,
  size: number,
  icon: NonNullable<CellVisualLayer['icon']>,
): void {
  const point = (px: number, py: number): [number, number] => [x + px * size, y + py * size];
  const polygon = (coordinates: readonly (readonly [number, number])[]) => {
    context.beginPath();
    coordinates.forEach(([px, py], index) => {
      const [cx, cy] = point(px, py);
      if (index === 0) context.moveTo(cx, cy);
      else context.lineTo(cx, cy);
    });
    context.closePath();
    context.fill();
  };
  context.setFillStyle(icon.color);
  context.setStrokeStyle(icon.color);
  context.setLineWidth(Math.max(1.5, size * 0.14));
  switch (icon.shape) {
    case CellVisualIconShape.Up:
      polygon([
        [0.5, 0.05],
        [0.95, 0.55],
        [0.68, 0.55],
        [0.68, 0.95],
        [0.32, 0.95],
        [0.32, 0.55],
        [0.05, 0.55],
      ]);
      break;
    case CellVisualIconShape.Down:
      polygon([
        [0.32, 0.05],
        [0.68, 0.05],
        [0.68, 0.45],
        [0.95, 0.45],
        [0.5, 0.95],
        [0.05, 0.45],
        [0.32, 0.45],
      ]);
      break;
    case CellVisualIconShape.Right:
      polygon([
        [0.05, 0.32],
        [0.48, 0.32],
        [0.48, 0.05],
        [0.95, 0.5],
        [0.48, 0.95],
        [0.48, 0.68],
        [0.05, 0.68],
      ]);
      break;
    case CellVisualIconShape.Circle:
      polygon(
        Array.from({ length: 16 }, (_, index) => {
          const angle = (index * Math.PI) / 8;
          return [0.5 + Math.cos(angle) * 0.43, 0.5 + Math.sin(angle) * 0.43] as const;
        }),
      );
      break;
    case CellVisualIconShape.Diamond:
      polygon([
        [0.5, 0.03],
        [0.97, 0.5],
        [0.5, 0.97],
        [0.03, 0.5],
      ]);
      break;
    case CellVisualIconShape.Triangle:
      polygon([
        [0.5, 0.04],
        [0.96, 0.9],
        [0.04, 0.9],
      ]);
      break;
    case CellVisualIconShape.Flag:
      polygon([
        [0.18, 0.08],
        [0.85, 0.08],
        [0.7, 0.43],
        [0.85, 0.72],
        [0.18, 0.72],
      ]);
      context.beginPath();
      context.moveTo(x + size * 0.18, y);
      context.lineTo(x + size * 0.18, y + size);
      context.stroke();
      break;
    case CellVisualIconShape.Star:
      polygon(
        Array.from({ length: 10 }, (_, index) => {
          const angle = -Math.PI / 2 + (index * Math.PI) / 5;
          const radius = index % 2 ? 0.2 : 0.47;
          return [0.5 + Math.cos(angle) * radius, 0.5 + Math.sin(angle) * radius] as const;
        }),
      );
      break;
    case CellVisualIconShape.Bar:
      for (let index = 0; index < (icon.totalLevels ?? 3); index++) {
        const total = icon.totalLevels ?? 3;
        const left = 0.05 + (index * 0.9) / total;
        const right = left + 0.72 / total;
        const top = 0.82 - (index * 0.7) / Math.max(1, total - 1);
        context.setFillStyle(index < (icon.level ?? 3) ? icon.color : '#DADCE0');
        polygon([
          [left, top],
          [right, top],
          [right, 0.96],
          [left, 0.96],
        ]);
      }
      break;
    case CellVisualIconShape.Check:
      context.beginPath();
      context.moveTo(x + size * 0.08, y + size * 0.52);
      context.lineTo(x + size * 0.4, y + size * 0.82);
      context.lineTo(x + size * 0.94, y + size * 0.16);
      context.stroke();
      break;
    case CellVisualIconShape.Cross:
      context.beginPath();
      context.moveTo(x + size * 0.15, y + size * 0.15);
      context.lineTo(x + size * 0.85, y + size * 0.85);
      context.moveTo(x + size * 0.85, y + size * 0.15);
      context.lineTo(x + size * 0.15, y + size * 0.85);
      context.stroke();
      break;
  }
}

function interpolateHex(start: string, end: string, fraction: number): string {
  const a = /^#([\da-f]{6})$/i.exec(start);
  const b = /^#([\da-f]{6})$/i.exec(end);
  if (!a || !b) return start;
  const first = Number.parseInt(a[1], 16);
  const last = Number.parseInt(b[1], 16);
  const channels = [16, 8, 0].map((shift) =>
    Math.round(((first >> shift) & 255) * (1 - fraction) + ((last >> shift) & 255) * fraction),
  );
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}
