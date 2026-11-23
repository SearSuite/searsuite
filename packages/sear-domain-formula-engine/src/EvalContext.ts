import { type XmlXPathEvaluator } from '@searsuite/sear-foundation-platform';
import { type FormulaExternalServiceReader } from './FormulaExternalServiceReader';
import { type FormulaEvaluationBudget } from './FormulaEvaluationBudget';
import { type FormulaEvaluationScope } from './FormulaEvaluationScope';
import { type FormulaAST } from './FormulaAST';
import { type FormulaDateTimeLocale } from './FormulaDateTimeLocale';
import { type FormulaDateSystem } from './FormulaDateSystem';
import { type FormulaLanguageService } from './FormulaLanguageService';
import { type FormulaMetadataReader } from './FormulaMetadata';
import { type FormulaPhoneticReader } from './FormulaPhoneticReader';
import { type FormulaRangeCell } from './FormulaRangeCell';
import { type FormulaCellPosition } from './FormulaCellPosition';
import { type FormulaDynamicDependencyRegistrar } from './FormulaDynamicDependencyRegistrar';
import { type FormulaReferenceResolver } from './FormulaReferenceResolver';
import { type FormulaTextLocale } from './FormulaTextLocale';
import { type FormulaValue } from './FormulaValue';
import { type FormulaRichResult } from './FormulaRichResult';
import { type IAggregationCache } from './IAggregationCache';
import { type IFormulaSourceProvider } from './IFormulaSourceProvider';
import { type ResolvedFormulaRange } from './ResolvedFormulaRange';

/** Host-provided services and data readers used during formula evaluation. */
export interface EvalContext {
  arrayFormulaMode?: 'dynamic' | 'legacy';
  currentCell?: FormulaCellPosition;
  /** True only while evaluating the outermost function call in a formula cell. */
  rootFormulaCall?: boolean;
  /** Captures a rich result for the outermost formula call. */
  publishRichResult?(result: FormulaRichResult | undefined): void;
  forFormulaCell?(cell: FormulaCellPosition): EvalContext;
  referenceResolver?: FormulaReferenceResolver;
  readReference?(reference: ResolvedFormulaRange): FormulaValue;
  registerDynamicDependency?: FormulaDynamicDependencyRegistrar;
  formulaSource?: IFormulaSourceProvider;
  scope?: FormulaEvaluationScope;
  budget?: FormulaEvaluationBudget;
  metadata?: FormulaMetadataReader;
  xmlXPath?: XmlXPathEvaluator;
  externalServices?: FormulaExternalServiceReader;
  aggregationCache?: IAggregationCache;
  isCellInBounds(row: number, col: number): boolean;
  getSheetShape?(): [rowCount: number, colCount: number];
  getCellValue(row: number, col: number): FormulaValue;
  /** Reads the complete result at a dynamic-array anchor for the postfix # operator. */
  getSpillValue?(row: number, col: number, sheetName?: string): FormulaValue | undefined;
  getWorkbookCellValue?(sheetName: string, row: number, col: number): FormulaValue;
  evaluateFormula?(ast: FormulaAST, scope?: FormulaEvaluationScope): FormulaValue;
  iterateRange(startRow: number, startCol: number, endRow: number, endCol: number): Iterable<FormulaValue>;
  iterateRangeCells?(startRow: number, startCol: number, endRow: number, endCol: number): Iterable<FormulaRangeCell>;
  iterateWorkbookRange?(
    sheetName: string,
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
  ): Iterable<FormulaValue>;
  iterateWorkbookRangeCells?(
    sheetName: string,
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
  ): Iterable<FormulaRangeCell>;
  evaluateArrayFormula?(ast: FormulaAST, scope?: FormulaEvaluationScope): FormulaValue;
  isCellOccupied?(row: number, col: number): boolean;
  random?(): number;
  currentDateTime?(): number;
  dateSystem?: FormulaDateSystem;
  dateTimeLocale?: FormulaDateTimeLocale;
  textLocale?: FormulaTextLocale;
  phoneticReader?: FormulaPhoneticReader;
  languageService?: FormulaLanguageService;
}
