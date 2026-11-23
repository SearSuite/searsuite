import {
  type FormulaExternalServiceDefinition,
  type IFormulaExternalServiceProvider,
} from '@searsuite/sear-domain-formula-engine';
import { SearError } from '@searsuite/sear-foundation-error';

/** Tokenized editor-local external-service registry with isolated listener failures. */
export class FormulaExternalServiceRegistry implements IFormulaExternalServiceProvider {
  readonly #entries = new Map<
    string,
    Array<{ id: number; token: symbol; value: unknown; disposeInvalidation: () => void }>
  >();
  readonly #listeners = new Set<(serviceIds: readonly string[]) => void>();
  #destroyed = false;
  #nextRegistrationId = 0;
  #isCommandExecuting: (() => boolean) | undefined;
  #dispatchRemoval: ((id: number) => void) | undefined;
  #teardownToken: object | undefined;

  public constructor(private readonly warn: (message: string, error: unknown) => void = () => void 0) {}

  public enforceCommandBoundary(isCommandExecuting: () => boolean, dispatchRemoval: (id: number) => void): void {
    if (this.#isCommandExecuting) throw new SearError('Formula external-service registry is already bound.');
    this.#isCommandExecuting = isCommandExecuting;
    this.#dispatchRemoval = dispatchRemoval;
    Object.preventExtensions(this);
  }

  /** Reserves cleanup of an assembled registry for its owning editor. */
  public enforceTeardownBoundary(ownerToken: object): void {
    if (this.#teardownToken) throw new SearError('Formula external-service teardown boundary is already installed.');
    this.#teardownToken = ownerToken;
  }

  #assertCommandWrite(): void {
    if (this.#isCommandExecuting && !this.#isCommandExecuting()) {
      throw new SearError('Formula external services must change through editor.commands.run(...).');
    }
  }

  public register<T>(definition: FormulaExternalServiceDefinition<T>, service: T): () => void {
    this.#assertCommandWrite();
    if (this.#destroyed) {
      throw new SearError('Formula external-service registry has been destroyed.', { serviceId: definition.id });
    }
    const token = Symbol(definition.id);
    const id = this.#nextRegistrationId++;
    const entries = this.#entries.get(definition.id) ?? [];
    const entry: { id: number; token: symbol; value: unknown; disposeInvalidation: () => void } = {
      id,
      token,
      value: service,
      disposeInvalidation: () => void 0,
    };
    entries.push(entry);
    this.#entries.set(definition.id, entries);
    try {
      entry.disposeInvalidation =
        definition.subscribeInvalidation?.(service, () => {
          if (this.#entries.get(definition.id)?.at(-1)?.token === token) this.invalidate(definition);
        }) ?? (() => void 0);
    } catch (error) {
      entries.pop();
      if (entries.length === 0) this.#entries.delete(definition.id);
      throw new SearError('Formula external-service subscription failed.', { serviceId: definition.id, cause: error });
    }
    this.invalidate(definition);
    return () => this.unregisterRegistration(id);
  }

  public unregisterRegistration(id: number): void {
    if (this.#destroyed) return;
    const found = [...this.#entries].find(([, entries]) => entries.some((entry) => entry.id === id));
    if (!found) return;
    if (this.#isCommandExecuting && !this.#isCommandExecuting()) {
      this.#dispatchRemoval!(id);
      return;
    }
    const [serviceId, entries] = found;
    const entry = entries.find((candidate) => candidate.id === id)!;
    const remaining = entries.filter((candidate) => candidate.id !== id);
    if (remaining.length) this.#entries.set(serviceId, remaining);
    else this.#entries.delete(serviceId);
    this.disposeEntry(entry.disposeInvalidation);
    this.invalidate({ id: serviceId } as FormulaExternalServiceDefinition<unknown>);
  }

  public get<T>(definition: FormulaExternalServiceDefinition<T>): T | undefined {
    return this.#entries.get(definition.id)?.at(-1)?.value as T | undefined;
  }

  public invalidate<T>(definition: FormulaExternalServiceDefinition<T>): void {
    if (this.#destroyed) return;
    this.#listeners.forEach((listener) => {
      try {
        listener([definition.id]);
      } catch (error) {
        this.warn('Formula external-service invalidation listener failed.', error);
      }
    });
  }

  public subscribeInvalidation(listener: (serviceIds: readonly string[]) => void): () => void {
    if (this.#destroyed) return () => void 0;
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  public destroy(ownerToken?: object): void {
    if (this.#destroyed) return;
    if (this.#teardownToken && ownerToken !== this.#teardownToken) {
      throw new SearError('Formula external services can only be destroyed by their editor owner.');
    }
    this.#destroyed = true;
    const entries = [...this.#entries.values()].flat();
    this.#entries.clear();
    this.#listeners.clear();
    entries.reverse().forEach((entry) => this.disposeEntry(entry.disposeInvalidation));
  }

  private disposeEntry(dispose: () => void): void {
    try {
      dispose();
    } catch (error) {
      this.warn('Formula external-service subscription disposal failed.', error);
    }
  }
}
