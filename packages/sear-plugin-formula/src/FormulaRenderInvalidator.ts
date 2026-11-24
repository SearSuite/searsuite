import { Injectable, Inject } from '@searsuite/sear-foundation-di';
import { type CellKey } from '@searsuite/sear-domain-formula-engine';
import { fromCellKey } from '@searsuite/sear-domain-formula-engine-ts';
import { SheetDisplayedValueChanges } from '@searsuite/sear-domain-cell-types';

/** Compatibility callback for formula-result change notifications. */
export type FormulaRenderInvalidationHandler = (keys: readonly CellKey[]) => void;

/**
 * Formula-result publisher for the shared displayed-value change bus.
 *
 * The formula scheduler reports changes after updating derived results. Other
 * features subscribe to the shared bus without depending on formula internals.
 */
@Injectable()
export class FormulaRenderInvalidator {
  readonly #displayedValueChanges: SheetDisplayedValueChanges;

  /** DI token for resolving FormulaRenderInvalidator. */
  public static readonly symbol = Symbol.for('FormulaRenderInvalidator');
  #handler: FormulaRenderInvalidationHandler | undefined;

  public constructor(
    @Inject(SheetDisplayedValueChanges.symbol) displayedValueChanges: SheetDisplayedValueChanges,
  ) {
    this.#displayedValueChanges = displayedValueChanges;
  }

  /**
   * Registers the legacy formula-result callback for one editor instance.
   * @param handler - Callback that maps changed formula keys to render work.
   * @returns Disposer that removes this handler if it is still active.
   */
  public bind(handler: FormulaRenderInvalidationHandler): () => void {
    this.#handler = handler;
    return () => {
      if (this.#handler === handler) this.#handler = void 0;
    };
  }

  /**
   * Reports formula result changes to displayed-value subscribers.
   * @param keys - Formula cell keys whose derived display values changed.
   */
  public invalidateFormulaResults(keys: readonly CellKey[]): void {
    if (keys.length === 0) return;
    this.#displayedValueChanges.publish(keys.map((key) => {
      const [row, column] = fromCellKey(key);
      return { row, column };
    }));
    this.#handler?.(keys);
  }
}
