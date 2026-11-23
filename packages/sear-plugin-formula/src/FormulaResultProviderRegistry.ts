import {
  type FormulaValue,
  type IFormulaResultProvider,
} from '@searsuite/sear-domain-formula-engine';
import { Injectable } from '@searsuite/sear-foundation-di';
import { FormulaProviderEntries } from './FormulaProviderEntries';

/** Ordered formula result provider registered for one SheetEditor instance. */
export interface FormulaResultProviderRegistration {
  /** Provider queried for formula results. */
  readonly provider: IFormulaResultProvider;
  /** Higher priority providers are queried first. */
  readonly priority?: number;
}

/** Instance-local result provider registry exposed as the renderer's formula result reader. */
@Injectable()
export class FormulaResultProviderRegistry implements IFormulaResultProvider {
  /** DI token for resolving the registry owned by one SheetEditor instance. */
  public static readonly symbol = Symbol.for('FormulaResultProviderRegistry');

  readonly #providers = new FormulaProviderEntries<IFormulaResultProvider>();

  /** Registers one formula result provider and returns an idempotent disposer. */
  public register(registration: FormulaResultProviderRegistration): () => void {
    const provider = registration.provider;
    return this.#providers.register(Object.freeze({
      getFormulaResult: provider.getFormulaResult.bind(provider),
      ...(provider.getFormulaResultFormat
        ? { getFormulaResultFormat: provider.getFormulaResultFormat.bind(provider) }
        : {}),
      ...(provider.forEachFormulaResultInRange
        ? { forEachFormulaResultInRange: provider.forEachFormulaResultInRange.bind(provider) }
        : {}),
    }), registration.priority);
  }

  /** Binds post-assembly registration and disposal to the owning command bus. */
  public enforceCommandBoundary(isExecuting: () => boolean, remove: (id: number) => void): void {
    this.#providers.seal(isExecuting, remove);
    Object.preventExtensions(this);
  }

  /** Removes one provider inside the formula owner's unregister command. */
  public unregister(id: number): void {
    this.#providers.unregister(id);
  }

  /** Reads the first defined result supplied by registered providers. */
  public getFormulaResult(row: number, col: number): FormulaValue | undefined {
    for (const { provider } of this.#providers.getEntries()) {
      const result = provider.getFormulaResult(row, col);
      if (result !== void 0) return result;
    }
    return void 0;
  }

  public getFormulaResultFormat(row: number, col: number) {
    for (const { provider } of this.#providers.getEntries()) {
      if (provider.getFormulaResult(row, col) !== void 0) return provider.getFormulaResultFormat?.(row, col);
    }
    return void 0;
  }

  /** Visits derived result coordinates published by registered providers, once per position. */
  public forEachFormulaResultInRange(
    startRow: number, startColumn: number, endRow: number, endColumn: number,
    visit: (row: number, column: number) => void,
  ): void {
    const visited = new Set<string>();
    for (const { provider } of this.#providers.getEntries()) {
      provider.forEachFormulaResultInRange?.(startRow, startColumn, endRow, endColumn, (row, column) => {
        if (row < startRow || row > endRow || column < startColumn || column > endColumn) return;
        const key = `${row}:${column}`;
        if (visited.has(key)) return;
        visited.add(key);
        visit(row, column);
      });
    }
  }
}
