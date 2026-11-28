import { defineQuery, type QueryDefinition } from './QueryDefinition';

/** Stable typed query contract owned by a document feature. */
export interface DocQueryDefinition<Input, Result> extends QueryDefinition<Input, Result> {}

/** Creates a document query returning a detached result. */
export function defineDocQuery<Input = void, Result = unknown>(id: string): DocQueryDefinition<Input, Result> {
  return defineQuery<Input, Result>(id);
}
export type DocQueryInput<Definition> = Definition extends DocQueryDefinition<infer Input, unknown> ? Input : never;
export type DocQueryResult<Definition> = Definition extends DocQueryDefinition<unknown, infer Result> ? Result : never;
