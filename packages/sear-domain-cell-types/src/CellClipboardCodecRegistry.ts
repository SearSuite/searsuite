import { Injectable } from '@searsuite/sear-foundation-di';
import { type CellMatrixElement } from './CellMatrixElement';
import { assertCellExtensionWrite } from './CellExtensionWriteBoundary';

/** Context used by a cell type when a native clipboard cell is pasted elsewhere. */
export interface CellClipboardDecodeContext {
  readonly rowDelta: number;
  readonly columnDelta: number;
}

/** JSON-safe representation owned by the cell type that produced it. */
export interface CellClipboardCellPayload {
  readonly type: string;
  readonly data: unknown;
}

/** Clipboard behavior contributed by one persisted cell type. */
export interface CellClipboardCodecDefinition {
  readonly cellType: string;
  encode(cell: CellMatrixElement): unknown;
  decode(data: unknown, context: CellClipboardDecodeContext): CellMatrixElement | null;
  toPlainText(cell: CellMatrixElement): string;
  rebase?(cell: CellMatrixElement, context: CellClipboardDecodeContext): CellMatrixElement;
  decodePlainText?(text: string): CellMatrixElement | null;
}

/** Editor-local registry for cell-type-owned clipboard behavior. */
@Injectable()
export class CellClipboardCodecRegistry {
  public static readonly symbol = Symbol.for('CellClipboardCodecRegistry');

  readonly #codecs = new Map<string, CellClipboardCodecDefinition>();

  register(codec: CellClipboardCodecDefinition): () => void {
    assertCellExtensionWrite(this);
    const registered: CellClipboardCodecDefinition = Object.freeze({
      cellType: codec.cellType,
      encode: codec.encode.bind(codec),
      decode: codec.decode.bind(codec),
      toPlainText: codec.toPlainText.bind(codec),
      ...(codec.rebase ? { rebase: codec.rebase.bind(codec) } : {}),
      ...(codec.decodePlainText ? { decodePlainText: codec.decodePlainText.bind(codec) } : {}),
    });
    const previous = this.#codecs.get(registered.cellType);
    this.#codecs.set(registered.cellType, registered);
    const registry = this;
    return (): void => {
      assertCellExtensionWrite(registry);
      if (registry.#codecs.get(registered.cellType) !== registered) return;
      if (previous) registry.#codecs.set(registered.cellType, previous);
      else registry.#codecs.delete(registered.cellType);
    };
  }

  get(cellType: string): CellClipboardCodecDefinition | undefined {
    return this.#codecs.get(cellType);
  }

  encode(cell: CellMatrixElement): CellClipboardCellPayload {
    const codec = this.#codecs.get(cell.type);
    return { type: cell.type, data: codec ? codec.encode(cell) : cloneValue(cell) };
  }

  decode(payload: CellClipboardCellPayload, context: CellClipboardDecodeContext): CellMatrixElement | null {
    const codec = this.#codecs.get(payload.type);
    if (!codec) {
      const value = payload.data;
      return value && typeof value === 'object' && (value as { type?: unknown }).type === payload.type
        ? (cloneValue(value) as CellMatrixElement)
        : null;
    }
    const cell = codec.decode(payload.data, context);
    return cell && codec.rebase ? codec.rebase(cell, context) : cell;
  }

  toPlainText(cell: CellMatrixElement): string {
    return this.#codecs.get(cell.type)?.toPlainText(cell) ?? fallbackPlainText(cell);
  }

  decodePlainText(text: string): CellMatrixElement | null {
    for (const codec of [...this.#codecs.values()].reverse()) {
      const cell = codec.decodePlainText?.(text);
      if (cell) return cell;
    }
    return null;
  }
}

function fallbackPlainText(cell: CellMatrixElement): string {
  if (typeof cell.value === 'string' || typeof cell.value === 'number' || typeof cell.value === 'boolean') {
    return String(cell.value);
  }
  return '';
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)]));
}
