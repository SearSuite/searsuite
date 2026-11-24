import { SearError } from '@searsuite/sear-foundation-error';
import { type SheetDocumentState } from '@searsuite/sear-assembly-setup';
import { CellType, cellFormatToExcelCode, type CellMatrixElement } from '@searsuite/sear-domain-cell-types';
import { ReadSheetCellDataQuery, type SheetCellDataReader } from '@searsuite/sear-render-engine';
import { ReadSheetCellFormatQuery, type SheetCellFormatReader } from '@searsuite/sear-plugin-cell-format';
import {
  createFormulaError,
  FormulaErrorCode,
  FormulaNodeKind,
  isFormulaErrorCode,
  type Dependency,
  type EvalContext,
  type FormulaAST,
  type FormulaText,
  type FormulaValue,
  type IFormulaEvaluator,
  type IFormulaParser,
  type FormulaDateTimeLocale,
  type FormulaLanguageService,
  type FormulaPhoneticReader,
  type FormulaTextLocale,
  type StructureChange,
} from '@searsuite/sear-domain-formula-engine';
import {
  AggregationCache,
  FormulaEvaluator,
  FormulaFormatter,
  FormulaParser,
  FunctionRegistry,
} from '@searsuite/sear-domain-formula-engine-ts';
import {
  createWorkbookCellKey,
  isValidWorkbookReference,
  isWorkbookCellReference,
  isWorkbookRangeReference,
  parseWorkbookCellKey,
  WorkbookReferenceField,
  type WorkbookCellKey,
  type WorkbookCellReference,
  type WorkbookFormulaReference,
  type WorkbookSheetDescriptor,
  type WorkbookDocumentState,
} from '@searsuite/sear-domain-workbook';
import { extractRichText } from '@searsuite/sear-render-registry';
import {
  WorkbookFormulaBrokenReferenceReason,
  WorkbookFormulaGraphReferenceKind,
  isWorkbookFormulaBrokenReference,
  type WorkbookFormulaBrokenReference,
  type WorkbookFormulaDependencyGraph,
  type WorkbookFormulaGraphReference,
} from './WorkbookFormulaDependencyGraph';
import { WorkbookFormulaReferenceShifter } from './WorkbookFormulaReferenceShifter';
import { bindWorkbookFormulaObjects } from './WorkbookFormulaObjects';
import { readWorkbookFormulaBindings } from './WorkbookFormulaBindingEnvelope';
import { type WorkbookPluginRuntime } from './WorkbookPluginContracts';

/** Compiled workbook formula with native workbook-reference AST nodes. */
export interface CompiledWorkbookFormula {
  /** Original user-authored formula source. */
  readonly source: string;
  /** Parsed AST consumed by the configured formula evaluator. */
  readonly ast: FormulaAST;
  /** Stable workbook dependencies extracted from the AST. */
  readonly dependencies: readonly WorkbookFormulaReference[];
  /** References that are already known to be invalid. */
  readonly brokenReferences: readonly WorkbookFormulaBrokenReference[];
  /** Formula-text sheet names bound to stable sheet ids at compile time. */
  readonly sheetBindings: ReadonlyMap<string, string>;
  /** Whether the formula contains at least one workbook-qualified reference. */
  readonly hasWorkbookReferences: boolean;
  readonly hasExpandedObjects?: boolean;
}

/** Result returned after recalculating dirty workbook formulas. */
export interface WorkbookFormulaRecalculationResult {
  /** Formula cells that were evaluated and stored in the workbook result cache. */
  readonly recalculatedCells: readonly WorkbookCellReference[];
  /** Dirty formula cells that could not be evaluated in this pass. */
  readonly remainingDirtyCells: readonly WorkbookCellReference[];
}

/** Result of applying row/column structure edits to one compiled workbook formula. */
export interface WorkbookFormulaCompiledReferenceShiftResult {
  /** Updated compiled formula. */
  readonly compiled: CompiledWorkbookFormula;
  /** Whether formula position, AST, dependencies, or broken-reference metadata changed. */
  readonly changed: boolean;
}

/** Runtime adapter that evaluates workbook formulas through the shared formula engine. */
export class WorkbookFormulaEvaluationRuntime {
  readonly #parser: IFormulaParser;
  readonly #evaluator: IFormulaEvaluator;
  readonly #formatter: FormulaFormatter;
  readonly #workbookReferenceShifter: WorkbookFormulaReferenceShifter;

  /** Creates a workbook formula evaluation runtime. */
  public constructor(
    input: {
      parser?: IFormulaParser;
      evaluator?: IFormulaEvaluator;
      contextServices?: () => {
        readonly xmlXPath?: NonNullable<EvalContext['xmlXPath']>;
        readonly externalServices?: NonNullable<EvalContext['externalServices']>;
        readonly dateTimeLocale?: FormulaDateTimeLocale;
        readonly textLocale?: FormulaTextLocale;
        readonly phoneticReader?: FormulaPhoneticReader;
        readonly languageService?: FormulaLanguageService;
      };
    } = {},
  ) {
    this.#parser = input.parser ?? new FormulaParser();
    this.#evaluator = input.evaluator ?? new FormulaEvaluator(new FunctionRegistry(), new AggregationCache());
    this.#formatter = new FormulaFormatter();
    this.#workbookReferenceShifter = new WorkbookFormulaReferenceShifter();
    this.#contextServices = input.contextServices ?? (() => ({}));
  }

  readonly #contextServices: () => {
    readonly xmlXPath?: NonNullable<EvalContext['xmlXPath']>;
    readonly externalServices?: NonNullable<EvalContext['externalServices']>;
    readonly dateTimeLocale?: FormulaDateTimeLocale;
    readonly textLocale?: FormulaTextLocale;
    readonly phoneticReader?: FormulaPhoneticReader;
    readonly languageService?: FormulaLanguageService;
  };

  /** Compiles formula text into native AST plus stable workbook dependencies. */
  public compileFormula(
    formulaCell: WorkbookCellReference,
    source: string,
    workbookState: WorkbookDocumentState<SheetDocumentState>,
  ): CompiledWorkbookFormula {
    const bound = bindWorkbookFormulaObjects(this.#parser.parse(source), this.#parser, workbookState);
    const ast = bound.ast;
    const sheetBindings = new Map(readWorkbookFormulaBindings(workbookState, formulaCell, source));
    const extractedDependencies = this.#parser.extractDependencies(ast);
    const dependencies = extractedDependencies.map((dependency) =>
      this.#toWorkbookDependency(formulaCell.sheetId, dependency, workbookState.sheets, sheetBindings),
    );
    const hasWorkbookReferences = bound.expanded || extractedDependencies.some(
      (dependency) =>
        dependency.kind === FormulaNodeKind.WorkbookCell || dependency.kind === FormulaNodeKind.WorkbookRange,
    );
    return { source, ast, dependencies, brokenReferences: [], sheetBindings, hasWorkbookReferences, hasExpandedObjects: bound.expanded };
  }

  /** Shifts compiled formula references after a row or column structure change. */
  public shiftCompiledFormulaReferences(input: {
    formulaCell: WorkbookCellReference;
    compiled: CompiledWorkbookFormula;
    changedSheetId: string;
    changes: readonly StructureChange[];
  }): WorkbookFormulaCompiledReferenceShiftResult {
    const localAst =
      input.formulaCell.sheetId === input.changedSheetId
        ? this.#parser.shiftReferences(input.compiled.ast, [...input.changes])
        : input.compiled.ast;
    const workbookShift = this.#workbookReferenceShifter.shiftReferences({
      ast: localAst,
      sheetBindings: input.compiled.sheetBindings,
      changedSheetId: input.changedSheetId,
      changes: input.changes,
    });
    const ast = workbookShift.ast;
    const dependencies = this.#parser
      .extractDependencies(ast)
      .map((dependency) =>
        this.#toWorkbookDependency(input.formulaCell.sheetId, dependency, [], new Map(input.compiled.sheetBindings)),
      )
      .filter(isValidWorkbookReference);
    const brokenReferences = [
      ...input.compiled.brokenReferences,
      ...workbookShift.brokenReferences.map((reference) => ({
        kind: WorkbookFormulaGraphReferenceKind.Broken,
        reason: WorkbookFormulaBrokenReferenceReason.ReferenceDeleted,
        sheetId: reference.sheetId,
        reference,
      })),
    ];
    const changed =
      localAst !== input.compiled.ast ||
      workbookShift.changed ||
      brokenReferences.length !== input.compiled.brokenReferences.length;
    if (!changed) return { compiled: input.compiled, changed: false };
    return {
      compiled: {
        ...input.compiled,
        ast,
        dependencies,
        brokenReferences,
      },
      changed: true,
    };
  }

  /** Formats workbook formula source with current sheet names while keeping stable sheet-id bindings. */
  public formatFormulaSource(
    compiled: CompiledWorkbookFormula,
    workbookState: WorkbookDocumentState<SheetDocumentState>,
  ): string {
    if (!compiled.hasWorkbookReferences || compiled.hasExpandedObjects) return compiled.source;
    return this.#formatter.format(compiled.ast, {
      missingSheetName: FormulaErrorCode.Reference.slice(0, -1),
      resolveSheetName: (formulaSheetName) => {
        const sheetId = compiled.sheetBindings.get(formulaSheetName);
        if (!sheetId) return formulaSheetName;
        return workbookState.sheets.find((sheet) => sheet.id === sheetId)?.name;
      },
    });
  }

  /** Recalculates dirty formula cells whose dependencies are currently clean. */
  public recalculateDirty(input: {
    graph: WorkbookFormulaDependencyGraph;
    runtime: WorkbookPluginRuntime;
    formulas: ReadonlyMap<WorkbookCellKey, CompiledWorkbookFormula>;
  }): WorkbookFormulaRecalculationResult {
    const recalculatedCells: WorkbookCellReference[] = [];
    const remaining = new Set(input.graph.getDirtyFormulaCells().map(createWorkbookCellKey));
    let madeProgress = true;

    while (remaining.size > 0 && madeProgress) {
      madeProgress = false;
      for (const formulaKey of [...remaining]) {
        const formulaCell = parseWorkbookCellKey(formulaKey);
        const compiled = input.formulas.get(formulaKey);
        if (!compiled) {
          remaining.delete(formulaKey);
          continue;
        }
        if (!this.#canEvaluate(formulaCell, input.graph, input.formulas)) continue;
        const value = input.graph.hasBrokenReferences(formulaCell)
          ? createFormulaError(FormulaErrorCode.Reference)
          : this.#evaluator.evaluate(
              compiled.ast,
              this.#createEvalContext(formulaCell, compiled, input.graph, input.runtime),
            );
        input.graph.setFormulaResult(formulaCell, value);
        remaining.delete(formulaKey);
        recalculatedCells.push(formulaCell);
        madeProgress = true;
      }
    }

    for (const formulaKey of remaining) {
      const formulaCell = parseWorkbookCellKey(formulaKey);
      input.graph.setFormulaResult(formulaCell, createFormulaError(FormulaErrorCode.Reference));
      recalculatedCells.push(formulaCell);
    }

    return {
      recalculatedCells,
      remainingDirtyCells: input.graph.getDirtyFormulaCells(),
    };
  }

  #toWorkbookDependency(
    formulaSheetId: string,
    dependency: Dependency,
    sheets: readonly WorkbookSheetDescriptor[],
    sheetBindings: Map<string, string>,
  ): WorkbookFormulaReference {
    if (dependency.kind === FormulaNodeKind.Cell) {
      return { sheetId: formulaSheetId, row: dependency.row, col: dependency.col };
    }
    if (dependency.kind === FormulaNodeKind.Range) {
      return { sheetId: formulaSheetId, start: dependency.start, end: dependency.end };
    }
    if (dependency.kind === FormulaNodeKind.WorkbookCell) {
      return {
        sheetId: this.#resolveSheetBinding(dependency.sheetName, sheets, sheetBindings),
        row: dependency.row,
        col: dependency.col,
      };
    }
    if (dependency.kind === FormulaNodeKind.WorkbookRange) {
      return {
        sheetId: this.#resolveSheetBinding(dependency.sheetName, sheets, sheetBindings),
        start: dependency.start,
        end: dependency.end,
      };
    }
    if (dependency.kind === FormulaNodeKind.ColumnRange) {
      return { sheetId: formulaSheetId, startCol: dependency.startCol, endCol: dependency.endCol };
    }
    return { sheetId: formulaSheetId, startRow: dependency.startRow, endRow: dependency.endRow };
  }

  #resolveSheetBinding(
    sheetName: string,
    sheets: readonly WorkbookSheetDescriptor[],
    sheetBindings: Map<string, string>,
  ): string {
    const existing = sheetBindings.get(sheetName);
    if (existing) return existing;
    const sheet = sheets.find((candidate) => candidate.name === sheetName);
    if (!sheet) throw new SearError(`Unknown workbook sheet referenced by formula: ${sheetName}`);
    sheetBindings.set(sheetName, sheet.id);
    return sheet.id;
  }

  #canEvaluate(
    formulaCell: WorkbookCellReference,
    graph: WorkbookFormulaDependencyGraph,
    formulas: ReadonlyMap<WorkbookCellKey, CompiledWorkbookFormula>,
  ): boolean {
    return !graph
      .getDependencies(formulaCell)
      .some((dependency) => this.#referencesDirtyFormula(dependency, graph, formulas));
  }

  #referencesDirtyFormula(
    dependency: WorkbookFormulaGraphReference,
    graph: WorkbookFormulaDependencyGraph,
    formulas: ReadonlyMap<WorkbookCellKey, CompiledWorkbookFormula>,
  ): boolean {
    if (isWorkbookFormulaBrokenReference(dependency)) return false;
    if (isWorkbookCellReference(dependency)) return graph.hasFormulaCell(dependency) && graph.isDirty(dependency);
    if (isWorkbookRangeReference(dependency)) {
      const [startRow, startCol] = dependency[WorkbookReferenceField.start];
      const [endRow, endCol] = dependency[WorkbookReferenceField.end];
      for (const formulaKey of formulas.keys()) {
        const candidate = parseWorkbookCellKey(formulaKey);
        if (candidate.sheetId !== dependency[WorkbookReferenceField.sheetId] || !graph.isDirty(candidate)) continue;
        if (
          candidate.row >= startRow &&
          candidate.row <= endRow &&
          candidate.col >= startCol &&
          candidate.col <= endCol
        ) {
          return true;
        }
      }
    }
    return false;
  }

  #createEvalContext(
    formulaCell: WorkbookCellReference,
    compiled: CompiledWorkbookFormula,
    graph: WorkbookFormulaDependencyGraph,
    runtime: WorkbookPluginRuntime,
  ): EvalContext {
    const sheetData = this.#readSheetData(formulaCell.sheetId, runtime);
    const [rowCount, colCount] = sheetData?.shape ?? [0, 0];
    const isLocalCellInBounds = (row: number, col: number): boolean =>
      row >= 0 && row < rowCount && col >= 0 && col < colCount;
    const readWorkbookCellValue = (sheetName: string, row: number, col: number): FormulaValue => {
      const sheetId = compiled.sheetBindings.get(sheetName);
      if (!sheetId) return createFormulaError(FormulaErrorCode.Reference);
      return this.#readWorkbookCellValue({ sheetId, row, col }, graph, runtime);
    };
    const services = this.#contextServices();
    const workbookState = runtime.document.getState();
    const sheets = workbookState.sheets;
    const currentSheet = sheets.find((sheet) => sheet.id === formulaCell.sheetId);
    return {
      ...services,
      currentCell: { row: formulaCell.row, col: formulaCell.col },
      metadata: {
        readCell: ({ row, col, sheetName }) => {
          const target = sheetName === undefined ? currentSheet : sheets.find((sheet) => sheet.name === sheetName);
          if (!target) return undefined;
          const targetData = this.#readSheetData(target.id, runtime);
          const cell = targetData?.getItem(row, col);
          if (!targetData || row < 0 || col < 0 || row >= targetData.shape[0] || col >= targetData.shape[1]) {
            return undefined;
          }
          const source =
            !cell || cell.type === CellType.Empty ? 'empty' : cell.type === CellType.Formula ? 'formula' : 'value';
          const value = this.#cellToFormulaValue({ sheetId: target.id, row, col }, cell, graph);
          const formula =
            cell?.type === CellType.Formula && typeof cell.formula === 'string' ? cell.formula : undefined;
          const numberFormat = cellFormatToExcelCode(this.#readSheetFormats(target.id, runtime)?.getItem(row, col));
          return {
            reference: { row, col, sheetName: target.name },
            source,
            value,
            ...(formula === undefined ? {} : { formula }),
            ...(numberFormat === undefined ? {} : { numberFormat }),
          };
        },
        readWorkbook: () => ({
          ...(currentSheet === undefined
            ? {}
            : { currentSheetId: currentSheet.id, currentSheetName: currentSheet.name }),
          sheets: sheets.map((sheet, index) => ({
            id: sheet.id,
            name: sheet.name,
            index: index + 1,
            visible: !sheet.hidden,
          })),
        }),
      },
      isCellInBounds: isLocalCellInBounds,
      getSheetShape: () => [rowCount, colCount],
      getCellValue: (row, col) => {
        if (!isLocalCellInBounds(row, col)) return createFormulaError(FormulaErrorCode.Reference);
        return this.#cellToFormulaValue({ sheetId: formulaCell.sheetId, row, col }, sheetData?.getItem(row, col), graph);
      },
      getWorkbookCellValue: readWorkbookCellValue,
      getSpillValue: (row, col, sheetName) => {
        const sheetId = sheetName === undefined ? formulaCell.sheetId : compiled.sheetBindings.get(sheetName);
        if (!sheetId) return undefined;
        const targetData = this.#readSheetData(sheetId, runtime);
        const [targetRows, targetCols] = targetData?.shape ?? [0, 0];
        if (row < 0 || col < 0 || row >= targetRows || col >= targetCols) return undefined;
        return graph.getFormulaResult({ sheetId, row, col });
      },
      iterateRange: (startRow, startCol, endRow, endCol): Iterable<FormulaValue> => {
        if (!isLocalCellInBounds(startRow, startCol) || !isLocalCellInBounds(endRow, endCol)) {
          return [createFormulaError(FormulaErrorCode.Reference)];
        }
        const readCellValue = this.#cellToFormulaValue.bind(this);
        return {
          *[Symbol.iterator]() {
            for (let row = startRow; row <= endRow; row++) {
              for (let col = startCol; col <= endCol; col++) {
                yield readCellValue({ sheetId: formulaCell.sheetId, row, col }, sheetData?.getItem(row, col), graph);
              }
            }
          },
        };
      },
      iterateWorkbookRange: (sheetName, startRow, startCol, endRow, endCol): Iterable<FormulaValue> => {
        const sheetId = compiled.sheetBindings.get(sheetName);
        if (!sheetId) return [createFormulaError(FormulaErrorCode.Reference)];
        const targetData = this.#readSheetData(sheetId, runtime);
        const [targetRowCount, targetColCount] = targetData?.shape ?? [0, 0];
        if (!targetData || startRow < 0 || startCol < 0 || endRow >= targetRowCount || endCol >= targetColCount) {
          return [createFormulaError(FormulaErrorCode.Reference)];
        }
        const readCellValue = this.#cellToFormulaValue.bind(this);
        return {
          *[Symbol.iterator]() {
            for (let row = startRow; row <= endRow; row++) {
              for (let col = startCol; col <= endCol; col++) {
                yield readCellValue({ sheetId, row, col }, targetData.getItem(row, col), graph);
              }
            }
          },
        };
      },
    };
  }

  #readWorkbookCellValue(
    reference: WorkbookCellReference,
    graph: WorkbookFormulaDependencyGraph,
    runtime: WorkbookPluginRuntime,
  ): FormulaValue {
    const sheetData = this.#readSheetData(reference.sheetId, runtime);
    if (!sheetData) return createFormulaError(FormulaErrorCode.Reference);
    const [rowCount, colCount] = sheetData.shape;
    if (reference.row < 0 || reference.row >= rowCount || reference.col < 0 || reference.col >= colCount) {
      return createFormulaError(FormulaErrorCode.Reference);
    }
    return this.#cellToFormulaValue(reference, sheetData.getItem(reference.row, reference.col), graph);
  }

  #readSheetData(sheetId: string, runtime: WorkbookPluginRuntime): SheetCellDataReader | null {
    const activeEditor = runtime.sheets.getEditor(sheetId);
    if (activeEditor) return activeEditor.queries.run(ReadSheetCellDataQuery, void 0);
    return runtime.document.getState().sheetStates[sheetId]?.sheetData ?? null;
  }

  #readSheetFormats(sheetId: string, runtime: WorkbookPluginRuntime): SheetCellFormatReader | null {
    const activeEditor = runtime.sheets.getEditor(sheetId);
    if (activeEditor) return activeEditor.queries.run(ReadSheetCellFormatQuery, void 0);
    const formats = runtime.document.getState().sheetStates[sheetId]?.cellFormats;
    if (!formats) return null;
    return {
      shape: [formats.shape[0], formats.shape[1]],
      getItem: (row, column) => formats.getItem(row, column),
    };
  }

  #cellToFormulaValue(
    reference: WorkbookCellReference,
    cell: CellMatrixElement | null | undefined,
    graph: WorkbookFormulaDependencyGraph,
  ): FormulaValue {
    if (!cell) return 0;
    const error = readFormulaErrorValue(cell.value);
    if (error) return error;
    if (cell.type === CellType.Formula) return graph.getFormulaResult(reference) ?? 0;
    if (cell.type === CellType.Number || cell.type === 'currency' || cell.type === 'percent') {
      const value = Number(cell.value);
      return Number.isNaN(value) ? createFormulaError(FormulaErrorCode.Value) : value;
    }
    if (typeof cell.value === 'boolean') return cell.value;
    if (cell.type === CellType.RichText) return textValue(extractRichText(cell.value), 'allow');
    if (cell.type === 'phone') return textValue(cell.value, 'deny');
    return textValue(cell.value, 'allow');
  }
}

function textValue(value: unknown, numericCoercion: FormulaText['numericCoercion']): FormulaText {
  return {
    kind: 'text',
    value: typeof value === 'string' ? value : String(value ?? ''),
    numericCoercion,
  };
}

function readFormulaErrorValue(value: unknown): FormulaValue | null {
  if (!value || typeof value !== 'object' || (value as { kind?: unknown }).kind !== 'error') return null;
  const code = (value as { code?: unknown }).code;
  return createFormulaError(isFormulaErrorCode(code) ? code : FormulaErrorCode.Value);
}
