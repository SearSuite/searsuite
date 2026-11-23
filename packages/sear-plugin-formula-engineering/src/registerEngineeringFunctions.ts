import type { IFunctionRegistry } from '@searsuite/sear-domain-formula-engine';
import { engineeringFunctions } from './engineeringFunctions';

export interface EngineeringFunctionRegistrationOptions {
  /** Function names omitted for hosts whose formula dialect does not expose them. */
  readonly excludedNames?: readonly string[];
}

/** Registers engineering formulas into an editor-local registry and returns an idempotent disposer. */
export function registerEngineeringFunctions(
  registry: IFunctionRegistry,
  options: EngineeringFunctionRegistrationOptions = {},
): () => void {
  const excluded = new Set(options.excludedNames?.map((name) => name.toUpperCase()));
  return registry.registerMany(engineeringFunctions.filter((fn) => !excluded.has(fn.name.toUpperCase())));
}
