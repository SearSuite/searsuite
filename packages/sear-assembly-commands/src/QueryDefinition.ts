/** A stable query identifier carrying its input and result contract. */
export interface QueryDefinition<Input, Result> {
  readonly id: string;
  /** Reader queries return a live, read-only projection instead of a data snapshot. */
  readonly resultMode?: 'reader';
  readonly __input?: Input;
  readonly __result?: Result;
}

/** Creates an immutable, feature-owned query contract. */
export function defineQuery<Input = void, Result = unknown>(id: string): QueryDefinition<Input, Result> {
  return Object.freeze({ id }) as QueryDefinition<Input, Result>;
}

/** Defines a live reader whose methods own detached values at their read boundary. */
export function defineReaderQuery<Input = void, Result = unknown>(id: string): QueryDefinition<Input, Result> {
  return Object.freeze({ id, resultMode: 'reader' }) as QueryDefinition<Input, Result>;
}

export type QueryInput<Definition> = Definition extends QueryDefinition<infer Input, unknown> ? Input : never;
export type QueryResult<Definition> = Definition extends QueryDefinition<unknown, infer Result> ? Result : never;
