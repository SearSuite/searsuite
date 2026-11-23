import { BuildInStateName } from '@searsuite/sear-foundation-common';
import { DimensionsCSRMatrix } from './DimensionsCSRMatrix';

/** Specialized subclass of DimensionsCSRMatrix for tracking column widths. */
export class ColumnShapeDimensionsCSRMatrix extends DimensionsCSRMatrix {
  /** Stable matrix name used in diagnostics and serialized metadata. */
  public name: string = BuildInStateName.COLUMN_SHAPE_STATE;
}
