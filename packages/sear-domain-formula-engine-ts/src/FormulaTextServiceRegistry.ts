import {
  type FormulaLanguageService,
  type FormulaPhoneticReader,
  type IFormulaTextServiceProvider,
} from '@searsuite/sear-domain-formula-engine';
import { SearError } from '@searsuite/sear-foundation-error';

/** Default tokenized editor-local registry for metadata and cached external formula services. */
export class FormulaTextServiceRegistry implements IFormulaTextServiceProvider {
  readonly #phoneticReaders: Array<{ id: number; value: FormulaPhoneticReader }> = [];
  readonly #languageServices: Array<{ id: number; value: FormulaLanguageService }> = [];
  readonly #listeners = new Set<() => void>();
  #disposeLanguageInvalidation: (() => void) | undefined;
  #nextRegistrationId = 0;
  #isCommandExecuting: (() => boolean) | undefined;
  #dispatchRemoval: ((id: number) => void) | undefined;

  public enforceCommandBoundary(isCommandExecuting: () => boolean, dispatchRemoval: (id: number) => void): void {
    if (this.#isCommandExecuting) throw new SearError('Formula text-service registry is already bound.');
    this.#isCommandExecuting = isCommandExecuting;
    this.#dispatchRemoval = dispatchRemoval;
    Object.preventExtensions(this);
  }

  #assertCommandWrite(): void {
    if (this.#isCommandExecuting && !this.#isCommandExecuting()) {
      throw new SearError('Formula text services must change through editor.commands.run(...).');
    }
  }

  public getPhoneticReader(): FormulaPhoneticReader | undefined {
    return this.#phoneticReaders.at(-1)?.value;
  }

  public getLanguageService(): FormulaLanguageService | undefined {
    return this.#languageServices.at(-1)?.value;
  }

  public registerPhoneticReader(reader: FormulaPhoneticReader): () => void {
    return this.register(this.#phoneticReaders, reader);
  }

  public registerLanguageService(service: FormulaLanguageService): () => void {
    const dispose = this.register(this.#languageServices, service);
    this.bindLanguageInvalidation();
    this.emitInvalidation();
    return dispose;
  }

  public subscribeInvalidation(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  private register<Value>(
    registrations: Array<{ id: number; value: Value }>,
    value: Value,
  ): () => void {
    this.#assertCommandWrite();
    const id = this.#nextRegistrationId++;
    registrations.push({ id, value });
    return () => this.unregisterRegistration(id);
  }

  public unregisterRegistration(id: number): void {
    const languageIndex = this.#languageServices.findIndex((registration) => registration.id === id);
    const phoneticIndex = this.#phoneticReaders.findIndex((registration) => registration.id === id);
    if (languageIndex < 0 && phoneticIndex < 0) return;
    if (this.#isCommandExecuting && !this.#isCommandExecuting()) {
      this.#dispatchRemoval!(id);
      return;
    }
    if (languageIndex >= 0) {
      this.#languageServices.splice(languageIndex, 1);
      this.bindLanguageInvalidation();
      this.emitInvalidation();
    } else {
      this.#phoneticReaders.splice(phoneticIndex, 1);
    }
  }

  private bindLanguageInvalidation(): void {
    this.#disposeLanguageInvalidation?.();
    this.#disposeLanguageInvalidation = this.getLanguageService()?.subscribeInvalidation?.(() =>
      this.emitInvalidation(),
    );
  }

  private emitInvalidation(): void {
    this.#listeners.forEach((listener) => listener());
  }
}
