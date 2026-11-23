import { MatrixOTActionName } from '@searsuite/sear-domain-ot';
import { type StructureChange } from './StructureChange';
import { StructureChangeAxis } from './StructureChangeAxis';

/** Returns the axis affected by one structure change. */
export function getStructureChangeAxis(change: StructureChange): StructureChangeAxis | undefined {
  switch (change.type) {
    case MatrixOTActionName.RowInsert:
    case MatrixOTActionName.RowDelete:
    case MatrixOTActionName.RowMove:
      return StructureChangeAxis.Row;
    case MatrixOTActionName.ColInsert:
    case MatrixOTActionName.ColDelete:
    case MatrixOTActionName.ColMove:
      return StructureChangeAxis.Col;
  }
}
