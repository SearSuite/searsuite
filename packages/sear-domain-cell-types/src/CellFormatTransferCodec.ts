import { type CellMatrixElement } from './CellMatrixElement';

/** Type-owned format projection that never substitutes source values for target values. */
export interface CellFormatTransferCodec {
  readonly cellType: string;
  capture(cell: CellMatrixElement): Readonly<Record<string, unknown>>;
  apply(cell: CellMatrixElement, format: Readonly<Record<string, unknown>>): CellMatrixElement;
}
