import { type PositionRectProps } from '@searsuite/sear-foundation-rect';
import {
  type Cell,
  type CellContext,
  type CellProperties,
  type SheetRenderCoordinatorManager,
} from '@searsuite/sear-render-registry';

/** Render contribution belonging to one spreadsheet cell definition. */
export interface CellRendererDefinition {
  readonly cellType: string | symbol;
  register(renderCoordinator: SheetRenderCoordinatorManager): () => void;
}

/** Creates the standard renderer definition for a `Cell` subclass. */
export function defineCellRenderer<DataType extends CellProperties<unknown>, Properties>(
  cellType: string | symbol,
  cell: new (
    data: DataType,
    positionRect: PositionRectProps,
    properties: Properties,
    context?: CellContext,
  ) => Cell<DataType>,
): CellRendererDefinition {
  return {
    cellType,
    register: (renderCoordinator) => renderCoordinator.registerCell(cellType, cell),
  };
}
