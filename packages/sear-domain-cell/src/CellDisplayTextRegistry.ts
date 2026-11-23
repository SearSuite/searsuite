import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { Platform } from '@searsuite/sear-foundation-platform';
import { assertCellExtensionWrite, type CellFormatLocale } from '@searsuite/sear-domain-cell-types';

/** Persisted data required to derive a cell's plain-text representation. */
export interface CellDisplayData {
  type: string | symbol;
  value?: unknown;
  formula?: string;
  format?: unknown;
}

/**
 * Read-only data available while deriving display text.
 *
 * This deliberately does not reuse a render-cell context: measurement, copy,
 * and search need the same cell semantics without taking a render dependency.
 */
export interface CellDisplayContext {
  row?: number;
  col?: number;
  formulaResultProvider?: FormulaResultReader;
  cellFormatLocale?: CellFormatLocale;
}

/** Minimal formula-result capability required by formula display text. */
export interface FormulaResultReader {
  getFormulaResult(row: number, col: number): unknown;
}

/** Public contract for CellDisplayTextProvider. */
export interface CellDisplayTextProvider {
  readonly cellType: string | symbol;
  getDisplayText(cell: CellDisplayData, context: CellDisplayContext): string;
}

/** Maps persisted cell types to their display-text semantics without creating render Cells. */
@Injectable()
export class CellDisplayTextRegistry {
  /** DI token for resolving CellDisplayTextRegistry. */
  public static readonly symbol = Symbol.for('CellDisplayTextRegistry');

  readonly #providers = new Map<string | symbol, CellDisplayTextProvider>();
  private readonly warnedTypes = new Set<string>();

  /** Creates a CellDisplayTextRegistry instance. */
  constructor(@Inject(Platform.symbol) private readonly platform: Platform) {}

  /** Registers the value. */
  register(provider: CellDisplayTextProvider): () => void {
    assertCellExtensionWrite(this);
    const registered: CellDisplayTextProvider = Object.freeze({
      cellType: provider.cellType,
      getDisplayText: provider.getDisplayText.bind(provider),
    });
    const previous = this.#providers.get(registered.cellType);
    this.#providers.set(registered.cellType, registered);
    const registry = this;
    return function unregisterCellDisplayTextProvider(): void {
      assertCellExtensionWrite(registry);
      if (registry.#providers.get(registered.cellType) !== registered) return;
      if (previous) registry.#providers.set(registered.cellType, previous);
      else registry.#providers.delete(registered.cellType);
    };
  }

  /** Returns the display text. */
  getDisplayText(cell: CellDisplayData, context: CellDisplayContext): string {
    const provider = this.#providers.get(cell.type);
    if (provider) return provider.getDisplayText(cell, context);

    const typeName = typeof cell.type === 'symbol' ? cell.type.toString() : cell.type;
    if (!this.warnedTypes.has(typeName)) {
      this.warnedTypes.add(typeName);
      this.platform.warn(
        `[Display] No display-text provider registered for cell type "${typeName}". Falling back to String(value).`,
      );
    }
    return typeof cell.value === 'string' ? cell.value : String(cell.value ?? '');
  }
}
