import {
  type FormulaEvaluationScope,
  type FormulaValue,
} from '@searsuite/sear-domain-formula-engine';

/** Case-insensitive lexical scope for LET bindings. */
export class FormulaLexicalScope implements FormulaEvaluationScope {
  private readonly values = new Map<string, FormulaValue>();
  public readonly parent?: FormulaEvaluationScope;

  public constructor(parent?: FormulaEvaluationScope) {
    if (parent) this.parent = parent;
  }

  public get(name: string): FormulaValue | undefined {
    return this.values.get(normalizeName(name)) ?? this.parent?.get(name);
  }

  public set(name: string, value: FormulaValue): void {
    this.values.set(normalizeName(name), value);
  }
}

function normalizeName(name: string): string {
  return name.trim().toUpperCase();
}
