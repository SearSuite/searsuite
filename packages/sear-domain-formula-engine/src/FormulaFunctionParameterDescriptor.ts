import { type FormulaFunctionArgumentKind } from './FormulaFunctionArgumentKind';

/** One function parameter exposed to formula-authoring tools. */
export interface FormulaFunctionParameterDescriptor {
  readonly name: string;
  readonly description: string;
  readonly optional?: boolean;
  readonly repeating?: boolean;
  readonly accepts?: readonly FormulaFunctionArgumentKind[];
}
