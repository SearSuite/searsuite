import { FormulaNodeKind, type FormulaAST, type IFormulaParser, type IFunctionRegistry } from '@searsuite/sear-domain-formula-engine';
import { completeFormulaForCommit } from './completeFormulaForCommit';

export interface FormulaInputDiagnostic {
  readonly kind: 'incomplete' | 'error' | 'warning';
  readonly message: string;
  readonly start: number;
  readonly end: number;
  readonly suggestion?: string;
  readonly cellAddress?: string;
}

/** Checks the draft with the same parser used for formula evaluation. */
export function diagnoseFormulaInput(
  text: string,
  parser: IFormulaParser,
  registry?: IFunctionRegistry,
): FormulaInputDiagnostic | null {
  if (!text.startsWith('=')) return null;
  if (text.length === 1) {
    return { kind: 'incomplete', message: 'Formula is incomplete', start: 1, end: 1 };
  }
  try {
    const ast = parser.parse(text);
    return registry ? diagnoseFunctionCalls(ast, text, registry) : null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const completed = completeFormulaForCommit(text);
    if (completed !== text) {
      try {
        parser.parse(completed);
        return {
          kind: 'incomplete',
          message: 'Missing closing parenthesis',
          start: text.length,
          end: text.length,
          suggestion: 'Add a closing parenthesis.',
        };
      } catch {
        // The draft has another syntax error as well.
      }
    }
    const position = /position (\d+)/.exec(message);
    const start = position ? Math.min(text.length, Number(position[1]) + 1) : Math.max(1, text.length - 1);
    const suggestion = repairSuggestion(message);
    return {
      kind: start >= text.length ? 'incomplete' : 'error',
      message: start >= text.length ? 'Formula is incomplete' : message,
      start,
      end: Math.min(text.length, start + 1),
      ...(suggestion ? { suggestion } : {}),
    };
  }
}

function diagnoseFunctionCalls(
  node: FormulaAST,
  text: string,
  registry: IFunctionRegistry,
): FormulaInputDiagnostic | null {
  if (node.kind === FormulaNodeKind.Call) {
    const definition = registry.get(node.name);
    const descriptor = definition?.descriptor;
    const nameStart = text.toUpperCase().indexOf(node.name.toUpperCase(), 1);
    const start = nameStart < 0 ? text.length : nameStart;
    if (!definition) {
      return {
        kind: 'warning', message: `${node.name} is not a registered function.`,
        start, end: start + node.name.length,
        suggestion: 'Check the spelling or register the function in this workbook.',
      };
    }
    if (descriptor?.minArguments !== undefined && node.args.length < descriptor.minArguments) {
      return {
        kind: 'error', message: `${node.name} requires at least ${descriptor.minArguments} arguments.`,
        start, end: start + node.name.length,
      };
    }
    if (descriptor?.maxArguments !== undefined && node.args.length > descriptor.maxArguments) {
      return {
        kind: 'error', message: `${node.name} accepts at most ${descriptor.maxArguments} arguments.`,
        start, end: start + node.name.length,
      };
    }
    for (const argument of node.args) {
      const diagnostic = diagnoseFunctionCalls(argument, text, registry);
      if (diagnostic) return diagnostic;
    }
  } else if (node.kind === FormulaNodeKind.Binary || node.kind === FormulaNodeKind.Intersection) {
    return diagnoseFunctionCalls(node.left, text, registry) ?? diagnoseFunctionCalls(node.right, text, registry);
  } else if (node.kind === FormulaNodeKind.Unary) {
    return diagnoseFunctionCalls(node.operand, text, registry);
  } else if (node.kind === FormulaNodeKind.Array) {
    for (const row of node.rows) for (const value of row) {
      const diagnostic = diagnoseFunctionCalls(value, text, registry);
      if (diagnostic) return diagnostic;
    }
  }
  return null;
}

function repairSuggestion(message: string): string | undefined {
  if (/Expected '\)'|Unterminated.*parenthes/i.test(message)) return 'Add a closing parenthesis.';
  if (/Unterminated array constant/i.test(message)) return 'Close the array constant with }.';
  if (/Expected a reference|Expected cell reference/i.test(message)) return 'Enter a cell or range reference.';
  if (/Missing array constant value/i.test(message)) return 'Enter a value between the separators.';
  if (/Unexpected character/i.test(message)) return 'Check the operator or value at this position.';
  return undefined;
}
