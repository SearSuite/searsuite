declare const workbookCommandInputType: unique symbol;
declare const workbookCommandResultType: unique symbol;

/** Stable workbook command identifier carrying its input and result contract. */
export interface WorkbookCommandDefinition<Input, Result> {
  /** Globally stable command id owned by the workbook assembly package. */
  readonly id: string;
  /** Phantom field that preserves the command input type for callers. */
  readonly [workbookCommandInputType]: Input;
  /** Phantom field that preserves the command result type for callers. */
  readonly [workbookCommandResultType]: Result;
}

/** Extracts the input contract from a typed workbook command definition. */
export type WorkbookCommandInput<Definition> =
  Definition extends WorkbookCommandDefinition<infer Input, unknown> ? Input : never;

/** Extracts the result contract from a typed workbook command definition. */
export type WorkbookCommandDefinitionResult<Definition> =
  Definition extends WorkbookCommandDefinition<unknown, infer Result> ? Result : never;

/** Creates an immutable workbook-owned command contract. */
export function defineWorkbookCommand<Input = void, Result = void>(
  id: string,
): WorkbookCommandDefinition<Input, Result> {
  return Object.freeze({ id }) as WorkbookCommandDefinition<Input, Result>;
}
