import { type DocCommandResult } from './DocEditorCommand';

declare const docCommandInputType: unique symbol;
declare const docCommandResultType: unique symbol;

/** A stable document command identifier carrying its input and result contract. */
export interface DocCommandDefinition<Input, Result extends DocCommandResult = DocCommandResult> {
  /** Globally stable command id owned by the document feature package that defines it. */
  readonly id: string;
  /** Phantom field that preserves the command input type for callers. */
  readonly [docCommandInputType]: Input;
  /** Phantom field that preserves the command result type for callers. */
  readonly [docCommandResultType]: Result;
}

/** Extracts the input contract from a typed document command definition. */
export type DocCommandInput<Definition> = Definition extends DocCommandDefinition<infer Input, DocCommandResult>
  ? Input
  : never;

/** Extracts the result contract from a typed document command definition. */
export type DocCommandDefinitionResult<Definition> = Definition extends DocCommandDefinition<unknown, infer Result>
  ? Result
  : never;

/** Creates an immutable, feature-owned document command contract. */
export function defineDocCommand<Input = void, Result extends DocCommandResult = DocCommandResult>(
  id: string,
): DocCommandDefinition<Input, Result> {
  return Object.freeze({ id }) as DocCommandDefinition<Input, Result>;
}
