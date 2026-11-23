import { Injectable } from '@searsuite/sear-foundation-di';
import { type FormulaRichResult, type IFormulaRichResultProvider } from '@searsuite/sear-domain-formula-engine';
import { FormulaProviderEntries } from './FormulaProviderEntries';

/** Ordered rich-result provider registered for one SheetEditor instance. */
export interface FormulaRichResultProviderRegistration {
  readonly provider: IFormulaRichResultProvider;
  readonly priority?: number;
}

/** Instance-local provider registry for formula hyperlinks, images, and future rich results. */
@Injectable()
export class FormulaRichResultProviderRegistry implements IFormulaRichResultProvider {
  public static readonly symbol = Symbol.for('FormulaRichResultProviderRegistry');

  readonly #providers = new FormulaProviderEntries<IFormulaRichResultProvider>();

  public register(registration: FormulaRichResultProviderRegistration): () => void {
    const provider = registration.provider;
    return this.#providers.register(Object.freeze({
      getFormulaRichResult: provider.getFormulaRichResult.bind(provider),
    }), registration.priority);
  }

  public enforceCommandBoundary(isExecuting: () => boolean, remove: (id: number) => void): void {
    this.#providers.seal(isExecuting, remove);
    Object.preventExtensions(this);
  }

  public unregister(id: number): void {
    this.#providers.unregister(id);
  }

  public getFormulaRichResult(row: number, col: number): FormulaRichResult | undefined {
    for (const { provider } of this.#providers.getEntries()) {
      const result = provider.getFormulaRichResult(row, col);
      if (result !== void 0) return result;
    }
    return void 0;
  }
}
