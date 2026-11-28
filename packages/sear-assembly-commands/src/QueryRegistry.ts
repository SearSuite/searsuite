import { cloneSessionStateValue, runOutsideCommandExecution } from '@searsuite/sear-assembly-plugin';
import { Injectable } from '@searsuite/sear-foundation-di';
import { SearError } from '@searsuite/sear-foundation-error';
import { createQueryReader } from './createQueryReader';
import { type QueryDefinition, type QueryInput, type QueryResult } from './QueryDefinition';

export type QueryHandler<Input, Result> = (input: Input) => Result;

/** Editor-local registry for typed, side-effect-free queries. */
@Injectable()
export class QueryRegistry {
  public static readonly symbol: symbol = Symbol.for('QueryRegistry');
  readonly #handlers = new Map<
    string,
    { definition: QueryDefinition<unknown, unknown>; handler: QueryHandler<unknown, unknown> }
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

  public register<Definition extends QueryDefinition<unknown, unknown>>(
    definition: Definition,
    handler: QueryHandler<QueryInput<Definition>, QueryResult<Definition>>,
  ): () => void {
    this.#assertLive();
    this.#assertWrite?.();
    const id = definition.id;
    if (this.#handlers.has(id)) throw new SearError(`QueryRegistry already has a query registered for ${id}.`);
    const registration = {
      definition: Object.freeze({
        id,
        ...(definition.resultMode === 'reader' ? { resultMode: 'reader' as const } : {}),
      }),
      handler: handler as QueryHandler<unknown, unknown>,
    };
    this.#handlers.set(id, registration);
    return () => {
      this.#assertWrite?.();
      if (this.#handlers.get(id) === registration) this.#handlers.delete(id);
    };
  }

  public run<Definition extends QueryDefinition<unknown, unknown>>(
    definition: Definition,
    input: QueryInput<Definition>,
  ): QueryResult<Definition> {
    this.#assertLive();
    const registration = this.#handlers.get(definition.id);
    if (!registration) throw new SearError(`QueryRegistry has no query registered for ${definition.id}.`);
    const result = runOutsideCommandExecution(() => registration.handler(input));
    if (registration.definition.resultMode !== 'reader')
      return cloneSessionStateValue(result) as QueryResult<Definition>;
    if (result === null || typeof result !== 'object') return createQueryReader(result) as QueryResult<Definition>;
    let reader = this.#readers.get(result);
    if (!reader) {
      reader = createQueryReader(result);
      this.#readers.set(result, reader);
    }
    return reader as QueryResult<Definition>;
  }

  public has(definition: QueryDefinition<unknown, unknown> | string): boolean {
    this.#assertLive();
    return this.#handlers.has(typeof definition === 'string' ? definition : definition.id);
  }

  public getRegisteredQueryIds(): readonly string[] {
    this.#assertLive();
    return [...this.#handlers.keys()].sort();
  }

  public destroy(): void {
    if (this.#destroyed) return;
    this.#assertWrite?.();
    this.#destroyed = true;
    this.#handlers.clear();
  }

  #assertLive(): void {
    if (this.#destroyed) throw new SearError('QueryRegistry has been destroyed.');
  }
}
