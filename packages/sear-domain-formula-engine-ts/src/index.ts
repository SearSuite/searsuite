/**
 * The TypeScript formula parser, evaluator, dependency graph, and built-in function runtime.
 *
 * @packageDocumentation
 */

/**
 * @referenceChapter 0 implementation Follow a formula through the engine
 * @referenceBody
 * `FormulaParser` turns formula text into an expression tree. `FormulaEvaluator` evaluates that tree against cell
 * values and functions supplied by the runtime. `DependencyGraph` records which cells must be recalculated when an
 * input changes. These are the TypeScript implementations of the contracts in
 * `@searsuite/sear-domain-formula-engine`.
 *
 * Most Sheet hosts use these through the formula plugin and editor assembly. When replacing the implementation,
 * depend on the contract interfaces rather than importing these classes into a feature plugin.
 */

/**
 * @referenceChapter 1 built-in-functions Find and register a built-in function
 * @referenceBody
 * The function entries below are `FormulaFunction` values, grouped by purpose: lookup, date and time, math,
 * finance, text, and other families. `FunctionRegistry` registers the built-ins and resolves names without case
 * sensitivity. For example, a formula containing `XLOOKUP` is evaluated through the registry's `XLOOKUP` entry;
 * application code does not call that entry as a normal JavaScript function.
 *
 * Start with the function's description and example, then inspect `FormulaFunction` in the contracts package when
 * you need to define or register a custom function.
 */

/**
 * sear-formula-engine-ts default TypeScript formula-engine implementation.
 *
 * Provides pure TypeScript implementations of IFormulaParser,
 * IFormulaEvaluator, IDependencyGraph, IAggregationCache, and IFunctionRegistry.
 *
 * Registered through DI and replaceable with a WASM implementation in the host.
 */

export { FormulaParser } from './FormulaParser';
export { FormulaFormatter } from './FormulaFormatter';
export { type WorkbookFormulaFormatOptions } from './WorkbookFormulaFormatOptions';
export { FormulaEvaluator } from './FormulaEvaluator';
export { DependencyGraph } from './DependencyGraph';
export { AggregationCache } from './AggregationCache';
export { FormulaTextServiceRegistry } from './FormulaTextServiceRegistry';
export { FormulaExternalServiceRegistry } from './FormulaExternalServiceRegistry';
export { AsyncFormulaServiceCache } from './AsyncFormulaServiceCache';
export { FormulaExecutionBudget } from './FormulaExecutionBudget';
export { FormulaLexicalScope } from './FormulaLexicalScope';
export { FormulaStockHistoryCache } from './FormulaStockHistoryCache';
export { FormulaWebServiceCache } from './FormulaWebServiceCache';
export { FormulaCubeCache } from './FormulaCubeCache';
export * from './functions';
export * from './FormulaGoogleServiceCache';
export { UnavailableFormulaAddInService } from './UnavailableFormulaAddInService';
export { CjkFormulaTextLocale, SingleByteFormulaTextLocale, createFormulaTextLocale } from './functions/text';
export { parseCellRef } from './parseCellRef';
export { toCellRef } from './toCellRef';
export { cellKey } from './cellKey';
export { fromCellKey } from './fromCellKey';
export { type ParsedCellRef } from './ParsedCellRef';
export { numericDateText } from './functions/shared/formulaNumericDateText';
