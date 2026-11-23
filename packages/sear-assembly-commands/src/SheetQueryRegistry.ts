import { SearError } from '@searsuite/sear-foundation-error';
import { Injectable } from '@searsuite/sear-foundation-di';
import { cloneSessionStateValue } from '@searsuite/sear-assembly-plugin';
import { createSheetQueryReader } from './createSheetQueryReader';
import { type SheetQueryDefinition, type SheetQueryInput, type SheetQueryResult } from './SheetQueryDefinition';

export type SheetQueryHandler<Input, Result> = (input: Input) => Result;

/** Editor-local registry for typed, side-effect-free sheet queries. */
@Injectable()
export class SheetQueryRegistry {
  public static readonly symbol = Symbol.for('SheetQueryRegistry');
  readonly #handlers = new Map<
    string,
    { definition: SheetQueryDefinition<unknown, unknown>; handler: SheetQueryHandler<unknown, unknown> }
  >();
  readonly #readers = new WeakMap<object, unknown>();
  #destroyed = false;
  #assertWrite: (() => void) | null = null;

  /** Requires editor command dispatch for registration changes after assembly. */
  public enforceWriteBoundary(assertWrite: () => void): void {
    if (this.#assertWrite) throw new SearError('Sheet query write boundary is already installed.');
    this.#assertWrite = assertWrite;
    Object.freeze(this);
  }

  public register<Definition extends SheetQueryDefinition<unknown, unknown>>(
    definition: Definition,
    handler: SheetQueryHandler<SheetQueryInput<Definition>, SheetQueryResult<Definition>>,
  ): () => void {
    this.assertLive();
    this.#assertWrite?.();
    const id = definition.id;
    if (this.#handlers.has(id))
      throw new SearError(`SheetQueryRegistry already has a query registered for ${id}.`);
    const registration = {
      definition: Object.freeze({ id, ...(definition.resultMode === 'reader' ? { resultMode: 'reader' as const } : {}) }),
      handler: handler as SheetQueryHandler<unknown, unknown>,
    };
    this.#handlers.set(id, registration);
    return () => {
      this.#assertWrite?.();
      if (this.#handlers.get(id) === registration) this.#handlers.delete(id);
    };
  }

  public run<Definition extends SheetQueryDefinition<unknown, unknown>>(
    definition: Definition,
    input: SheetQueryInput<Definition>,
  ): SheetQueryResult<Definition> {
    this.assertLive();
    const registration = this.#handlers.get(definition.id);
    if (!registration) throw new SearError(`SheetQueryRegistry has no query registered for ${definition.id}.`);
    const result = registration.handler(input);
    if (registration.definition.resultMode !== 'reader') return cloneSessionStateValue(result) as SheetQueryResult<Definition>;
    if (result === null || typeof result !== 'object') return createSheetQueryReader(result) as SheetQueryResult<Definition>;
    let reader = this.#readers.get(result);
    if (!reader) {
      reader = createSheetQueryReader(result);
      this.#readers.set(result, reader);
    }
    return reader as SheetQueryResult<Definition>;
  }

  public has(definition: SheetQueryDefinition<unknown, unknown> | string): boolean {
    this.assertLive();
    return this.#handlers.has(typeof definition === 'string' ? definition : definition.id);
  }

  public getRegisteredQueryIds(): readonly string[] {
    this.assertLive();
    return [...this.#handlers.keys()].sort();
  }

  public destroy(): void {
    if (this.#destroyed) return;
    this.#assertWrite?.();
    this.#destroyed = true;
    this.#handlers.clear();
  }

  private assertLive(): void {
    if (this.#destroyed) throw new SearError('SheetQueryRegistry has been destroyed.');
  }
}

/** Alias emphasizing query execution as the counterpart to SheetCommandBus. */
export { SheetQueryRegistry as SheetQueryBus };
