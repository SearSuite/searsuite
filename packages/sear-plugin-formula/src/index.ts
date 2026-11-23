/**
 * Sheet formula source, evaluation scheduling, dependency tracking, and result projection.
 *
 * @packageDocumentation
 */

/**
 * @referenceChapter 0 source-to-result How a Sheet formula becomes a value
 * @referenceBody
 * `SheetFormulaPlugin` owns formula source in the Sheet and reacts to committed cell and structure operations.
 * It parses changed formulas, updates dependencies, and asks `RecalcScheduler` to evaluate affected cells.
 * Calculated values live in `FormulaResultStore` and are exposed through result providers; they are derived data,
 * separate from the formula text stored in the document.
 *
 * The parser, evaluator, graph, and built-in functions are described in the formula-engine packages. Start here
 * when integrating formula behavior into a Sheet editor; start with the engine contracts when implementing a new
 * evaluator or function.
 */

/**
 * @referenceChapter 1 recalculation Read and control recalculation
 * @referenceBody
 * `MarkFormulaDirtyCommand` and `RunFormulaBatchCommand` are the command path for scheduled work.
 * `GetFormulaCellStatusCommand` reads one cell's status, while `WaitForFormulaIdleCommand` waits for pending work
 * to finish. `FormulaCalculationTraceObservation` reports calculation traces for diagnostics.
 *
 * Host code should read formula results through a provider or status query. It should not write directly into
 * `FormulaResultStore`, because the scheduler owns recalculation order and invalidation.
 */

/**
 * sear-formula formula-plugin layer.
 *
 * Responsibilities:
 * - DI integration through interfaces without concrete implementation dependencies.
 * - Scheduling through RecalcScheduler lazy recalculation.
 * - Rendering integration through FormulaCell registered via render-registry.
 *
 * Dependencies:
 * - @searsuite/sear-domain-formula-engine (interface layer)
 * - @searsuite/sear-assembly-core (SearCoreSheet, SheetMatrix)
 * - @searsuite/sear-assembly-plugin (Plugin base class)
 * - @searsuite/sear-domain-ot (MatrixOTActionName)
 * - @searsuite/sear-foundation-di (dependency injection)
 */

export { SheetFormulaPlugin, type FormulaPluginState } from './sheetFormula/SheetFormulaPlugin';
export { FormulaResultProviderRegistry, type FormulaResultProviderRegistration } from './FormulaResultProviderRegistry';
export {
  FormulaProviderKind,
  UnregisterFormulaProviderCommand,
  type UnregisterFormulaProviderInput,
} from './FormulaProviderCommands';
export {
  MarkFormulaDirtyCommand,
  RunFormulaBatchCommand,
  ResumeFormulaWorkCommand,
  DiscardFormulaWorkCommand,
} from './FormulaRecalculationCommands';
export {
  FormulaRichResultProviderRegistry,
  type FormulaRichResultProviderRegistration,
} from './FormulaRichResultProviderRegistry';
export { FormulaSourceProviderRegistry, type FormulaSourceProviderRegistration } from './FormulaSourceProviderRegistry';
export { RecalcScheduler } from './RecalcScheduler';
export { FormulaRefShifter } from './FormulaRefShifter';
export { FormulaResultStore } from './FormulaResultStore';
export { lockFormulaResultValue } from './lockFormulaResultValue';
export { FormulaRegistryOwnership } from './FormulaRegistryOwnership';
export { UnregisterSheetFormulaFunctionCommand } from './FormulaFunctionRegistrationCommands';
export {
  UnregisterSheetFormulaExternalServiceCommand,
  UnregisterSheetFormulaTextServiceCommand,
} from './FormulaServiceRegistrationCommands';
export { FormulaCalculationTraceBus } from './FormulaCalculationTraceBus';
export { FormulaCalculationTraceObservation } from './FormulaObservations';
export { FormulaRenderInvalidator, type FormulaRenderInvalidationHandler } from './FormulaRenderInvalidator';
export { FormulaSchedulerDataSource, type FormulaViewportChangeHandler } from './FormulaSchedulerDataSource';
export {
  GetFormulaCellStatusCommand,
  GetFormulaDependencyStatusCommand,
  WaitForFormulaIdleCommand,
  registerFormulaStatusCommands,
  waitForFormulaIdle,
  type FormulaCellStatusCommandInput,
  type FormulaCellStatusCommandResult,
  type FormulaDependencyCellRef,
  type FormulaDependencyReference,
  type FormulaDependencyStatus,
  type FormulaDependencyStatusCommandInput,
  type FormulaDependencyStatusCommandResult,
  type FormulaIdleCommandResult,
  type FormulaIdleProvider,
} from './FormulaStatusCommands';
export { SheetFormulaReferenceHighlightPlugin } from './formulaReferenceHighlight/SheetFormulaReferenceHighlightPlugin';
export {
  FormulaCrossSheetHighlightSource,
  type FormulaCrossSheetReference,
} from './formulaReferenceHighlight/FormulaCrossSheetHighlightSource';
export { CellFormulaValueConverterRegistry, type CellFormulaValueConverter } from './CellFormulaValueConverterRegistry';
export {
  sheetFormulaPluginKey,
  formulaReferenceHighlightConfig,
  getFormulaReferenceColor,
  type FormulaReferenceColorPalette,
  type FormulaReferenceHighlightConfig,
} from './FormulaHighlightConfig';
