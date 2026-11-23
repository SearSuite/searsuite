import { Injectable } from '@searsuite/sear-foundation-di';
import { SearError } from '@searsuite/sear-foundation-error';
import { type CellMatrixElement } from './CellMatrixElement';

import { type CellFormatTransferCodec } from './CellFormatTransferCodec';
import { assertCellExtensionWrite } from './CellExtensionWriteBoundary';

/** Editor-local cell-format codecs; unregistered types preserve their payload verbatim. */
@Injectable()
export class CellFormatTransferRegistry {
  public static readonly symbol = Symbol.for('CellFormatTransferRegistry');
  readonly #codecs = new Map<string, CellFormatTransferCodec>();
  public register(codec: CellFormatTransferCodec): () => void {
    assertCellExtensionWrite(this);
    if (this.#codecs.has(codec.cellType))
      throw new SearError('Duplicate cell format-transfer codec.', { cellType: codec.cellType });
    const registered: CellFormatTransferCodec = Object.freeze({
      cellType: codec.cellType,
      capture: codec.capture.bind(codec),
      apply: codec.apply.bind(codec),
    });
    this.#codecs.set(registered.cellType, registered);
    return () => {
      assertCellExtensionWrite(this);
      if (this.#codecs.get(registered.cellType) === registered) this.#codecs.delete(registered.cellType);
    };
  }
  public capture(cell: CellMatrixElement | null): Readonly<Record<string, unknown>> {
    return cell ? this.#codecs.get(cell.type)?.capture(cell) ?? {} : {};
  }
  public apply(cell: CellMatrixElement | null, format: Readonly<Record<string, unknown>>): CellMatrixElement | null {
    return cell ? this.#codecs.get(cell.type)?.apply(cell, format) ?? cell : null;
  }
  public destroy(): void {
    assertCellExtensionWrite(this);
    this.#codecs.clear();
  }
}
