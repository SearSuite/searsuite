import { BuildInStateName } from '@searsuite/sear-foundation-common';
import { DimensionsCSRMatrix } from './DimensionsCSRMatrix';

/** Specialized subclass of DimensionsCSRMatrix for tracking row heights. */
export class RowShapeDimensionsCSRMatrix extends DimensionsCSRMatrix {
  /** Stable matrix name used in diagnostics and serialized metadata. */
  public name: string = BuildInStateName.ROW_SHAPE_STATE;
}
