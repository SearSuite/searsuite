import { type SheetCommandResult } from './SheetCommand';

declare const sheetCommandInputType: unique symbol;
declare const sheetCommandResultType: unique symbol;

/** A stable command identifier carrying its input and result contract. */
export interface SheetCommandDefinition<Input, Result extends SheetCommandResult = SheetCommandResult> {
  /** Globally stable command id owned by the feature package that defines it. */
  readonly id: string;
  /** Phantom field that preserves the command input type for callers. */
  readonly [sheetCommandInputType]: Input;
  /** Phantom field that preserves the command result type for callers. */
  readonly [sheetCommandResultType]: Result;
}

/** Extracts the input contract from a typed command definition. */
export type SheetCommandInput<Definition> = Definition extends SheetCommandDefinition<infer Input, SheetCommandResult>
  ? Input
  : never;

/** Extracts the result contract from a typed command definition. */
export type SheetCommandDefinitionResult<Definition> = Definition extends SheetCommandDefinition<unknown, infer Result>
  ? Result
  : never;

/** Creates an immutable, feature-owned command contract. */
export function defineSheetCommand<Input = void, Result extends SheetCommandResult = SheetCommandResult>(
  id: string,
): SheetCommandDefinition<Input, Result> {
  return Object.freeze({ id }) as SheetCommandDefinition<Input, Result>;
}
