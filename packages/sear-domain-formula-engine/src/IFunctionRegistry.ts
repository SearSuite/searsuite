/**
 * Function registry interface.
 *
 * Manages all available formula functions such as SUM, AVERAGE, and IF.
 * Formula evaluation looks up the corresponding FormulaFunction by name.
 *
 * Default implementation: FunctionRegistry (sear-formula-engine-ts)
 */

import { type FormulaFunction } from './FormulaFunction';

/** Public contract for IFunctionRegistry. */
export interface IFunctionRegistry {
  /** Requires post-initialization writes to occur during the owning editor's command dispatch. */
  enforceCommandBoundary(isCommandExecuting: () => boolean, dispatchRemoval: (id: number) => void): void;

  /** Removes one tokenized registration; disposal may dispatch an owner command. */
  unregisterRegistration(id: number): void;
  /**
   * Registers a formula function.
   *
   * @param fn Function definition; name is stored in uppercase automatically.
   */
  register(fn: FormulaFunction): () => void;

  /**
   * Registers a group of formula functions and publishes one combined change notification.
   *
   * @param functions Function definitions in registration precedence order.
   */
  registerMany(functions: readonly FormulaFunction[]): () => void;

  /**
   * Gets a function definition by name.
   *
   * @param name Function name, case-insensitive.
   * @returns Function definition, or undefined when it is not registered.
   */
  get(name: string): FormulaFunction | undefined;

  /**
   * Checks whether a function has been registered.
   *
   * @param name Function name, case-insensitive.
   */
  has(name: string): boolean;

  /**
   * Lists all registered function names.
   *
   * @returns Function names in uppercase.
   */
  list(): string[];

  /** Subscribes to registrations and removals that can change formula results. */
  subscribe(listener: (functionNames: readonly string[]) => void): () => void;
}

export namespace IFunctionRegistry {
  export const symbol = Symbol.for('IFunctionRegistry');
}
