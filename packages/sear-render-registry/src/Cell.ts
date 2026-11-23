import { Node, NodeProperties } from '@searsuite/sear-render-node';
import { PositionRectProps } from '@searsuite/sear-foundation-rect';
import { type IFormulaResultProvider, type IFormulaRichResultProvider } from '@searsuite/sear-domain-formula-engine';
import { type CellFormatLocale } from '@searsuite/sear-domain-cell-types';

/**
 * Well-known regions used by sheet cells and their interaction handlers.
 *
 * Keep this as a runtime value as well as a type so producers and consumers
 * share the same identifiers instead of duplicating string literals.
 */
export const CellRegion = {
  Grid: 'grid',
  RowHeader: 'row-header',
  ColumnHeader: 'column-header',
  Corner: 'corner',
} as const;

/** Type contract for CellRegion. */
export type CellRegion = (typeof CellRegion)[keyof typeof CellRegion];

/** Built-in rendering-only cell roles that are not persisted sheet values. */
export const CellRenderType = {
  Affix: 'affix',
  Editor: 'rich_text',
} as const;

/** Type contract for CellRenderType. */
export type CellRenderType = (typeof CellRenderType)[keyof typeof CellRenderType];

/** Type contract for CellProperties. */
export type CellProperties<T = unknown> = NodeProperties & {
  type: string | symbol;
  region?: CellRegion;
  value?: T;
  /** Number-format projection contributed by the cell-format state owner. */
  format?: unknown;
  isEdit?: boolean;
  startRowIndex?: number;
  startColIndex?: number;
  endRowIndex?: number;
  endColIndex?: number;
};

/**
 * Cell construction context injected by callers such as SheetGridRender and
 * SheetResizePlugin. It lets Cell subclasses access external services on demand
 * and avoids caller-side type switches.
 *
 * Design principle: adding a cell type or external service should not require
 * callers to add if/else branches. Callers add the service to CellContext, and
 * the corresponding Cell subclass reads it.
 *
 * The current capabilities are explicit read-only rendering dependencies. Do
 * not pass a DI container or generic service locator into Cell; that would make
 * Cell implicitly depend on the entire application service graph.
 */
export interface CellContext {
  /** Current cell row index (0-based); optional for non-grid cells. */
  row?: number;
  /** Current cell column index (0-based); optional for non-grid cells. */
  col?: number;
  /** Read-only access to derived formula results; optional when formulas are disabled. */
  formulaResultProvider?: IFormulaResultProvider;
  /** Read-only metadata for host-rendered formula links and images. */
  formulaRichResultProvider?: IFormulaRichResultProvider;
  /** Sheet-local defaults for formatting numbers and date/time serials. */
  cellFormatLocale?: CellFormatLocale;
}

/** Base render node for a projected Sheet cell. */
export abstract class Cell<T extends NodeProperties> {
  /** Creates a Cell instance. */
  constructor(
    public readonly data: T,
    public readonly positionRect: PositionRectProps,
    public readonly properties: T,
    public readonly context: CellContext = {},
  ) {}

  /** Renders Cell scene output. */
  abstract render(): Node<T> | Node<T>[];

  /**
   * Returns this cell's plain-text representation for:
   * - Automatic column-width and row-height measurement (SheetResizePlugin).
   * - Non-rendering workflows such as copy/paste and find/replace.
   *
   * Each subclass implements its own semantics, so callers do not need type switches.
   */
  abstract getDisplayText(): string;
}

export { IFormulaResultProvider } from '@searsuite/sear-domain-formula-engine';
