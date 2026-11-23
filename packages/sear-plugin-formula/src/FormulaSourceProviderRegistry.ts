import { Injectable } from '@searsuite/sear-foundation-di';
import { type IFormulaSourceProvider } from '@searsuite/sear-domain-formula-engine';
import { FormulaProviderEntries } from './FormulaProviderEntries';

export interface FormulaSourceProviderRegistration {
  readonly provider: IFormulaSourceProvider;
  readonly priority?: number;
}

/** Editor-local ordered registry for formula source providers. */
@Injectable()
export class FormulaSourceProviderRegistry implements IFormulaSourceProvider {
  public static readonly symbol = Symbol.for('FormulaSourceProviderRegistry');

  readonly #providers = new FormulaProviderEntries<IFormulaSourceProvider>();

  public register(registration: FormulaSourceProviderRegistration): () => void {
    const provider = registration.provider;
    return this.#providers.register(Object.freeze({
      getFormulaSource: provider.getFormulaSource.bind(provider),
    }), registration.priority);
  }

  public enforceCommandBoundary(isExecuting: () => boolean, remove: (id: number) => void): void {
    this.#providers.seal(isExecuting, remove);
    Object.preventExtensions(this);
  }

  public unregister(id: number): void {
    this.#providers.unregister(id);
  }

  public getFormulaSource(row: number, col: number): string | undefined {
    for (const { provider } of this.#providers.getEntries()) {
      const source = provider.getFormulaSource(row, col);
      if (source !== void 0) return source;
    }
    return void 0;
  }
}
