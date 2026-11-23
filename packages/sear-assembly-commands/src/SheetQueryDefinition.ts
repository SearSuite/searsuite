/** A stable query identifier carrying its input and result contract. */
export interface SheetQueryDefinition<Input, Result> {
  readonly id: string;
  /** Reader queries return a live, read-only projection instead of a data snapshot. */
  readonly resultMode?: 'reader';
  readonly __input?: Input;
  readonly __result?: Result;
}

/** Creates an immutable, feature-owned query contract. */
export function defineSheetQuery<Input = void, Result = unknown>(id: string): SheetQueryDefinition<Input, Result> {
  return Object.freeze({ id }) as SheetQueryDefinition<Input, Result>;
}

/** Defines a live reader whose methods own detached values at their read boundary. */
export function defineSheetReaderQuery<Input = void, Result = unknown>(id: string): SheetQueryDefinition<Input, Result> {
  return Object.freeze({ id, resultMode: 'reader' }) as SheetQueryDefinition<Input, Result>;
}

export type SheetQueryInput<Definition> = Definition extends SheetQueryDefinition<infer Input, unknown> ? Input : never;
export type SheetQueryResult<Definition> = Definition extends SheetQueryDefinition<unknown, infer Result> ? Result : never;
