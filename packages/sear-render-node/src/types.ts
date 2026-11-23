import { type PositionRectProps } from '@searsuite/sear-foundation-rect';
import { type HexColor } from '@searsuite/sear-foundation-utils';
import { type SheetHorizontalAlignment, type SheetVerticalAlignment } from '@searsuite/sear-domain-cell-types';

/** Stable key used by SceneGraph, Tree and DataStorage to identify render nodes. */
export type RenderNodeKey = string;

/** Color key used only by hit-canvas rendering and pixel-to-node lookup. */
export type HitColorKey = HexColor;

export const CellVisualIconShape = {
  Up: 'up',
  Right: 'right',
  Down: 'down',
  Circle: 'circle',
  Diamond: 'diamond',
  Triangle: 'triangle',
  Flag: 'flag',
  Star: 'star',
  Bar: 'bar',
  Check: 'check',
  Cross: 'cross',
} as const;
export type CellVisualIconShape = (typeof CellVisualIconShape)[keyof typeof CellVisualIconShape];

/** Primitive shapes available to feature-contributed cell layers. */
export const CellVisualLayerShape = { Rectangle: 'rectangle', TopLeftTriangle: 'topLeftTriangle' } as const;
export type CellVisualLayerShape = (typeof CellVisualLayerShape)[keyof typeof CellVisualLayerShape];

/** One text label drawn within a feature-contributed visual layer. */
export interface CellVisualLabel {
  readonly text: string;
  readonly fill: string;
  readonly color?: string;
}

/** A visual rectangle, icon or sequence of labels within its cell bounds. */
export interface CellVisualLayer {
  readonly slot: string;
  /** Paint order among visual layers; use values from 0 to 1, with higher values drawn later. */
  readonly zIndex?: number;
  readonly shape?: CellVisualLayerShape;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly fill?: string | { readonly start: string; readonly end: string };
  /** Ordered labels, clipped to the layer bounds without changing the cell value. */
  readonly labels?: readonly CellVisualLabel[];
  readonly icon?: {
    readonly shape: CellVisualIconShape;
    readonly color: string;
    readonly level?: number;
    readonly totalLevels?: number;
  };
}

/** Type contract for NodeProperties. */
export type NodeProperties = {
  /**
   * Stable render-node key.
   *
   * When omitted, Node falls back to its generated hit color key for backwards
   * compatibility. Semantic render nodes should provide stable ids such as
   * block ids here instead of using hit colors as identity.
   */
  nodeKey?: RenderNodeKey | undefined;

  top?: number | undefined;
  left?: number | undefined;
  right?: number | undefined;
  bottom?: number | undefined;

  depth?: number | undefined;

  fill?: string | undefined;
  /** Foreground color used by text-rendering nodes. */
  textColor?: string | undefined;
  /** Suppresses projected text while preserving its underlying value. */
  hideText?: boolean | undefined;
  /** Space reserved before projected text for a cell visual. */
  contentInsetStart?: number | undefined;
  /** Space reserved after projected text for a cell visual. */
  contentInsetEnd?: number | undefined;
  /** Maximum width available to single-line text across adjacent empty cells. */
  textOverflowWidth?: number | undefined;
  /** Character repeated to fill the remaining inline width of formatted text. */
  textFillCharacter?: string | undefined;
  /** Raw General-format number fitted against the actual render width. */
  fitNumberValue?: number | undefined;
  stroke?: string | undefined;
  strokeWidth?: number | undefined;
  lineDash?: number[] | undefined;
  cornerRadius?: [number, number, number, number] | undefined;
  horizontalAlign?: SheetHorizontalAlignment | undefined;
  verticalAlign?: SheetVerticalAlignment | undefined;
  isEdit?: boolean | undefined;

  /** Stable semantic ownership exposed by retained render targets. */
  semanticOwner?: string | undefined;
  /** Stable semantic role exposed by retained render targets. */
  semanticRole?: string | undefined;

  /**
   * Optional world-coordinate clip applied by OverlayRenderStrategy.
   * Overlay nodes normally render above sticky UI; this lets a visual stay
   * within a host-defined content region instead (for example, a sheet
   * selection must not draw over row/column headers).
   */
  overlayClipRect?: PositionRectProps | undefined;

  /**
   * Visual-only nodes do not participate in hit canvas.
   *
   * Background: `FixBoxNode.drawHit` fills the entire rect with random color for Hit Canvas lookup.
   * But once visual-only nodes (such as selection strokes and header highlight backgrounds)
   * enter the Hit Canvas,
   * they can cover underlying cell hit colors and block click-through.
   * Setting `skipHit: true` in properties makes `drawHit` skip directly.
   */
  skipHit?: boolean | undefined;

  /**
   * Business marker: true when selection represents a whole row or whole column range.
   * Dirty render may use this to choose a different redraw shape.
   */
  shouldBeClipInDirtyRender?: boolean | undefined;
};
