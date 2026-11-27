import { Injectable, Inject } from '@searsuite/sear-foundation-di';
import { type CellKey } from '@searsuite/sear-domain-formula-engine';
import { fromCellKey } from '@searsuite/sear-domain-formula-engine-ts';
import { SheetDisplayedValueChanges } from '@searsuite/sear-domain-cell-types';

/**
 * Formula-result publisher for the shared displayed-value change bus.
 *
 * The formula scheduler reports changes after updating derived results. Other
 * features subscribe to the shared bus without depending on formula internals.
 */
@Injectable()
export class FormulaValuePublisher {
  readonly #displayedValueChanges: SheetDisplayedValueChanges;

  /** DI token for resolving FormulaValuePublisher. */
  public static readonly symbol = Symbol.for('FormulaValuePublisher');

  public constructor(@Inject(SheetDisplayedValueChanges.symbol) displayedValueChanges: SheetDisplayedValueChanges) {
    this.#displayedValueChanges = displayedValueChanges;
  }

  /**
   * Reports formula result changes to displayed-value subscribers.
   * @param keys - Formula cell keys whose derived display values changed.
   */
  public publishResults(keys: readonly CellKey[]): void {
    if (keys.length === 0) return;
    this.#displayedValueChanges.publish(
      keys.map((key) => {
        const [row, column] = fromCellKey(key);
        return { row, column };
      }),
    );
  }
}
