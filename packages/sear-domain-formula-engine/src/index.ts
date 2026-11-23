/**
 * Host-neutral formula values, evaluation contracts, registries, references, and external-service boundaries.
 *
 * @packageDocumentation
 */

/**
 * @referenceChapter 0 contract-and-runtime Separate the contract from its implementation
 * @referenceBody
 * This package defines the values and service interfaces consumed by formula features. `IFormulaParser` describes
 * parsing, `IFormulaEvaluator` describes evaluation, `IDependencyGraph` describes recalculation dependencies, and
 * `IFunctionRegistry` describes function lookup. The TypeScript implementations live in
 * `@searsuite/sear-domain-formula-engine-ts` and are selected through dependency injection.
 *
 * Use these interfaces when building a plugin or host that must work with a different formula implementation.
 * Use the TypeScript package when you need its concrete parser, evaluator, or built-in functions.
 */

/**
 * @referenceChapter 1 formula-values Understand the values passed through evaluation
 * @referenceBody
 * `FormulaAST` is the parsed expression. `FormulaValue` is the result a function or evaluator can return;
 * `FormulaArg` represents an argument passed to a function. References and ranges use the `FormulaReference*`
 * and `FormulaRange*` contracts, so a function can read cells without owning the Sheet document.
 *
 * If you are implementing a function, start with `FormulaFunction` and `EvalContext`. If you are integrating an
 * evaluator, start with `IFormulaEvaluator` and the reference-resolution contracts.
 */

/**
 * sear-formula-engine formula-engine interface layer.
 *
 * Contains TypeScript-only interfaces and type definitions with no runtime
 * implementation. All implementations (TS / WASM) implement these contracts,
 * and DI selects the concrete implementation.
 *
 * Usage:
 * ```ts
 * import {
 *   IFormulaParser, IFormulaEvaluator,
 *   IDependencyGraph, IAggregationCache, IFunctionRegistry,
 * } from '@searsuite/sear-domain-formula-engine';
 *
 * // Inject interfaces through DI.
 * constructor(
 *   @Inject(IFormulaParser.symbol) private parser: IFormulaParser,
 *   @Inject(IFormulaEvaluator.symbol) private evaluator: IFormulaEvaluator,
 * ) {}
 * ```
 */

// Shared types.
export { type CellKey } from './CellKey';
export { type ErrorCode } from './ErrorCode';
export { type FormulaError } from './FormulaError';
export { FormulaErrorCode } from './FormulaErrorCode';
export { type FormulaText } from './FormulaText';
export { type FormulaLanguageService } from './FormulaLanguageService';
export { type FormulaLanguageServiceResult } from './FormulaLanguageServiceResult';
export { type FormulaPhoneticReader } from './FormulaPhoneticReader';
export { type BinaryOp } from './BinaryOp';
export { type UnaryOp } from './UnaryOp';
export { FormulaNodeKind } from './FormulaNodeKind';
export { type FormulaAST } from './FormulaAST';
export { type FormulaValue } from './FormulaValue';
export { type FormulaArray } from './FormulaArray';
export { type FormulaArg } from './FormulaArg';
export { type FormulaRangeCell } from './FormulaRangeCell';
export { FormulaRangeSourceKind } from './FormulaRangeSourceKind';
export { type FormulaRangeSource } from './FormulaRangeSource';
export { type ResolvedFormulaRange } from './ResolvedFormulaRange';
export { type FormulaDateTimeLocale } from './FormulaDateTimeLocale';
export { FormulaDateSystem } from './FormulaDateSystem';
export { IFormulaDateSystemProvider } from './IFormulaDateSystemProvider';
export { type FormulaIterationSettings } from './FormulaIterationSettings';
export { IFormulaIterationSettingsProvider } from './IFormulaIterationSettingsProvider';
export { type FormulaDateTimeMeridiemSymbol } from './FormulaDateTimeMeridiemSymbol';
export { type FormulaDateTimeMonthSymbol } from './FormulaDateTimeMonthSymbol';
export { type FormulaDateTimeParseOptions } from './FormulaDateTimeParseOptions';
export { type FormulaDateTimeParseResult } from './FormulaDateTimeParseResult';
export { type FormulaDateTimeSymbols } from './FormulaDateTimeSymbols';
export { type FormulaDateTimeUnitSymbols } from './FormulaDateTimeUnitSymbols';
export { type FormulaTextLocale } from './FormulaTextLocale';
export { type CellChange } from './CellChange';
export { type StructureChangeType } from './StructureChangeType';
export { type StructureChange } from './StructureChange';
export { type EvalContext } from './EvalContext';
export { type FormulaFunction } from './FormulaFunction';
export { type FormulaFunctionArgumentKind } from './FormulaFunctionArgumentKind';
export { type FormulaFunctionDescriptor } from './FormulaFunctionDescriptor';
export { type FormulaFunctionParameterDescriptor } from './FormulaFunctionParameterDescriptor';
export { type EvalResult } from './EvalResult';
export { type FormulaReferenceValue } from './FormulaReferenceValue';
export { type FormulaTupleValue } from './FormulaTupleValue';
export { type FormulaCubeMemberValue } from './FormulaCubeMemberValue';
export { type FormulaCubeSetValue } from './FormulaCubeSetValue';
export { type FormulaCubeService } from './FormulaCubeService';
export {
  FormulaCubeKpiProperty,
  type FormulaCubeKpiProperty as FormulaCubeKpiPropertyValue,
} from './FormulaCubeKpiProperty';
export { FormulaCubeServiceDefinition } from './FormulaCubeServiceDefinition';
export { type FormulaCubeMemberExpression } from './FormulaCubeMemberExpression';
export { type FormulaCubeQuery } from './FormulaCubeQuery';
export { type FormulaCubeResult } from './FormulaCubeResult';
export { type FormulaCellPosition } from './FormulaCellPosition';
export { type FormulaReferenceStyle } from './FormulaReferenceStyle';
export { type FormulaReferenceResolutionOptions } from './FormulaReferenceResolutionOptions';
export { type FormulaReferenceResolver } from './FormulaReferenceResolver';
export { type FormulaDynamicDependencyRegistrar } from './FormulaDynamicDependencyRegistrar';
export { type FormulaReferenceArgument } from './FormulaReference';
export { type FormulaEvaluationBudget } from './FormulaEvaluationBudget';
export { type FormulaEvaluationScope } from './FormulaEvaluationScope';
export { type FormulaMetadataReader } from './FormulaMetadata';
export { type FormulaCellMetadata } from './FormulaCellMetadata';
export { type FormulaCellSource } from './FormulaCellSource';
export { type FormulaMetadataCellReference } from './FormulaMetadataCellReference';
export { type FormulaEnvironmentMetadata } from './FormulaEnvironmentMetadata';
export { type FormulaSheetMetadata } from './FormulaSheetMetadata';
export { type FormulaWorkbookMetadata } from './FormulaWorkbookMetadata';
export { IFormulaWorkbookMetadataProvider } from './IFormulaWorkbookMetadataProvider';
export { type FormulaStockHistoryService } from './FormulaStockHistoryService';
export { FormulaStockHistoryServiceDefinition } from './FormulaStockHistoryServiceDefinition';
export { type FormulaStockHistoryRequest } from './FormulaStockHistoryRequest';
export { type FormulaPivotDataQuery } from './FormulaPivotDataQuery';
export { type FormulaPivotDataService } from './FormulaPivotDataService';
export { type FormulaRtdKey } from './FormulaRtdKey';
export { type FormulaRtdService } from './FormulaRtdService';
export { type FormulaImageResource } from './FormulaImageResource';
export { type FormulaImageService } from './FormulaImageService';
export { type FormulaHyperlinkService } from './FormulaHyperlinkService';
export { FormulaPivotDataServiceDefinition } from './FormulaPivotDataServiceDefinition';
export { FormulaRtdServiceDefinition } from './FormulaRtdServiceDefinition';
export { FormulaImageServiceDefinition } from './FormulaImageServiceDefinition';
export { FormulaHyperlinkServiceDefinition } from './FormulaHyperlinkServiceDefinition';
export { type FormulaRichResult } from './FormulaRichResult';
export { type FormulaHyperlinkResult } from './FormulaHyperlinkResult';
export { type FormulaImageResult } from './FormulaImageResult';
export { FormulaFunctionArguments } from './FormulaFunctionArguments';
export { isFormulaError } from './isFormulaError';
export { isFormulaArgumentKind } from './FormulaArgumentKind';
export { type FormulaAddInService } from './FormulaAddInService';
export { FormulaAddInServiceDefinition } from './FormulaAddInServiceDefinition';
export { type FormulaAddInCall } from './FormulaAddInCall';
export { type FormulaAddInRegistrationId } from './FormulaAddInRegistrationId';
export { type FormulaAddInRegistrationRequest } from './FormulaAddInRegistrationRequest';
export { type FormulaDirectAddInCall } from './FormulaDirectAddInCall';
export { type FormulaRegisteredAddInCall } from './FormulaRegisteredAddInCall';

export { assertSupportedStructureChange } from './assertSupportedStructureChange';
export { FormulaStructureChangeActionNames } from './FormulaStructureChangeActionNames';
export { StructureChangeAxis } from './StructureChangeAxis';
export { StructureChangeKind } from './StructureChangeKind';
export { getStructureChangeAxis } from './getStructureChangeAxis';
export { getStructureChangeKind } from './getStructureChangeKind';
export { matrixOperationToStructureChange } from './matrixOperationToStructureChange';
export { matrixOperationsToStructureChanges } from './matrixOperationsToStructureChanges';
export { shiftStructureCoordinate } from './shiftStructureCoordinate';
export { type ShiftedStructureCoordinate } from './ShiftedStructureCoordinate';

export { createFormulaError } from './createFormulaError';
export { isFormulaErrorCode } from './isFormulaErrorCode';

// Parser interface.
export { IFormulaParser } from './IFormulaParser';
export { type Dependency } from './Dependency';

// Evaluator interface.
export { IFormulaEvaluator } from './IFormulaEvaluator';

// Formula result provider interface.
export { IFormulaResultProvider } from './IFormulaResultProvider';
export { IFormulaRichResultProvider } from './IFormulaRichResultProvider';

// Formula source provider interface.
export { IFormulaSourceProvider } from './IFormulaSourceProvider';

// Formula status provider interface.
export { IFormulaStatusProvider } from './IFormulaStatusProvider';
export { type FormulaCellStatus } from './FormulaCellStatus';

// Formula trace provider interface.
export { IFormulaCalculationTraceProvider } from './IFormulaCalculationTraceProvider';
export { FormulaBatchFlushedEventType } from './FormulaBatchFlushedEventType';
export { FormulaRecalculationCompletedEventType } from './FormulaRecalculationCompletedEventType';
export { FormulaErrorChangedEventType } from './FormulaErrorChangedEventType';
export { FormulaDependenciesChangedEventType } from './FormulaDependenciesChangedEventType';
export { FormulaCalculationTraceEventType } from './FormulaCalculationTraceEventType';
export { type FormulaBatchFlushedEvent } from './FormulaBatchFlushedEvent';
export { type FormulaDependenciesChangedEvent } from './FormulaDependenciesChangedEvent';
export { type FormulaCalculationTraceEvent } from './FormulaCalculationTraceEvent';
export { type FormulaCalculationTraceEventBase } from './FormulaCalculationTraceEventBase';
export { type FormulaCalculationTraceEventPayload } from './FormulaCalculationTraceEventPayload';
export { type FormulaCalculationTraceListener } from './FormulaCalculationTraceListener';
export { type FormulaErrorChangedEvent } from './FormulaErrorChangedEvent';
export { type FormulaFlushedCellResult } from './FormulaFlushedCellResult';
export { type FormulaRecalculationCompletedEvent } from './FormulaRecalculationCompletedEvent';

// Formula locale provider interface.
export { IFormulaLocaleProvider } from './IFormulaLocaleProvider';
export { IFormulaTextServiceProvider } from './IFormulaTextServiceProvider';
export { FormulaLanguageServiceDefinition } from './FormulaLanguageServiceDefinition';
export { defineFormulaExternalService } from './defineFormulaExternalService';
export { IFormulaExternalServiceProvider } from './FormulaExternalService';
export { type FormulaExternalServiceDefinition } from './FormulaExternalServiceDefinition';
export { type FormulaExternalServiceReader } from './FormulaExternalServiceReader';
export { FormulaServiceCacheStatus } from './FormulaServiceCacheStatus';
export { type FormulaServiceCacheResult } from './FormulaServiceCacheResult';

// Dependency graph interface.
export { IDependencyGraph } from './IDependencyGraph';

// Aggregation cache interface.
export { IAggregationCache } from './IAggregationCache';

// Function registry interface.
export { IFunctionRegistry } from './IFunctionRegistry';
export { FormulaWebLimits } from './FormulaWebLimits';
export { FormulaWebServiceDefinition } from './FormulaWebServiceDefinition';
export { type FormulaWebService } from './FormulaWebService';
export { type FormulaGoogleService } from './FormulaGoogleService';
export { FormulaGoogleServiceDefinition } from './FormulaGoogleServiceDefinition';
export { type FormulaGoogleRequest } from './FormulaGoogleRequest';
export { moveFormulaReferences } from './moveFormulaReferences';
export { reorderFormulaReferences } from './reorderFormulaReferences';
export { type FormulaStructureMoveOptions } from './FormulaStructureMoveOptions';
export { type StructureMoveChange } from './StructureMoveChange';
export { type FormulaReferenceNode } from './FormulaReferenceNode';
export { mapFormulaReferenceNodes } from './mapFormulaReferenceNodes';
export { type FormulaRangeMove } from './FormulaRangeMove';
