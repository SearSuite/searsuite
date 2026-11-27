import { createFormulaError, FormulaErrorCode, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import {
  createWorkbookCellKey,
  isWorkbookCellReference,
  isWorkbookColumnRangeReference,
  isWorkbookRangeReference,
  isWorkbookRowRangeReference,
  normalizeWorkbookColumnRangeReference,
  normalizeWorkbookRangeReference,
  normalizeWorkbookRowRangeReference,
  parseWorkbookCellKey,
  WorkbookReferenceField,
  type WorkbookCellKey,
  type WorkbookCellReference,
  type WorkbookFormulaReference,
  type WorkbookSheetId,
} from '@searsuite/sear-domain-workbook';
import { lockFormulaResultValue } from '@searsuite/sear-plugin-formula';

/** Read surface returned to plugins without graph mutation methods. */
export type WorkbookFormulaDependencyGraphReader = Pick<
  WorkbookFormulaDependencyGraph,
  | 'getFormulaResult'
  | 'isDirty'
  | 'getDirtyFormulaCells'
  | 'hasFormulaCell'
  | 'getDependencies'
  | 'getBrokenReferences'
  | 'hasBrokenReferences'
  | 'getDependents'
  | 'getFormulaCells'
  | 'size'
  | 'dirtySize'
  | 'resultSize'
>;

/** Captures only bound graph reads; no mutable graph handle escapes. */
export function createWorkbookFormulaDependencyGraphReader(
  graph: WorkbookFormulaDependencyGraph,
): WorkbookFormulaDependencyGraphReader {
  return Object.freeze({
    getFormulaResult: graph.getFormulaResult.bind(graph),
    isDirty: graph.isDirty.bind(graph),
    getDirtyFormulaCells: graph.getDirtyFormulaCells.bind(graph),
    hasFormulaCell: graph.hasFormulaCell.bind(graph),
    getDependencies: graph.getDependencies.bind(graph),
    getBrokenReferences: graph.getBrokenReferences.bind(graph),
    hasBrokenReferences: graph.hasBrokenReferences.bind(graph),
    getDependents: graph.getDependents.bind(graph),
    getFormulaCells: graph.getFormulaCells.bind(graph),
    get size() {
      return graph.size;
    },
    get dirtySize() {
      return graph.dirtySize;
    },
    get resultSize() {
      return graph.resultSize;
    },
  });
}

/** Reason a workbook formula reference can no longer resolve. */
export const WorkbookFormulaBrokenReferenceReason = {
  SheetDeleted: 'sheetDeleted',
  ReferenceDeleted: 'referenceDeleted',
} as const;

/** Reason a workbook formula reference can no longer resolve. */
export type WorkbookFormulaBrokenReferenceReason =
  (typeof WorkbookFormulaBrokenReferenceReason)[keyof typeof WorkbookFormulaBrokenReferenceReason];

/** Dependency graph reference entry kinds that are not normal workbook formula references. */
export const WorkbookFormulaGraphReferenceKind = {
  Broken: 'broken',
} as const;

/** Dependency graph reference entry kind value. */
export type WorkbookFormulaGraphReferenceKind =
  (typeof WorkbookFormulaGraphReferenceKind)[keyof typeof WorkbookFormulaGraphReferenceKind];

/** Dependency entry retained after a workbook formula reference becomes invalid. */
export interface WorkbookFormulaBrokenReference {
  readonly kind: typeof WorkbookFormulaGraphReferenceKind.Broken;
  readonly reason: WorkbookFormulaBrokenReferenceReason;
  readonly sheetId: WorkbookSheetId;
  readonly reference: WorkbookFormulaReference;
}

/** Dependency entry stored by the workbook formula graph. */
export type WorkbookFormulaGraphReference = WorkbookFormulaReference | WorkbookFormulaBrokenReference;

/** Workbook-qualified dependency graph owned by WorkbookFormulaPlugin. */
export class WorkbookFormulaDependencyGraph {
  readonly #dependencies = new Map<WorkbookCellKey, readonly WorkbookFormulaGraphReference[]>();
  readonly #cellDependents = new Map<WorkbookCellKey, Set<WorkbookCellKey>>();
  readonly #dirtyFormulaCells = new Set<WorkbookCellKey>();
  readonly #formulaResults = new Map<WorkbookCellKey, FormulaValue>();

  /** Registers dependencies for one workbook-qualified formula cell. */
  public updateFormulaCell(
    formulaCell: WorkbookCellReference,
    dependencies: readonly WorkbookFormulaReference[],
  ): void {
    this.updateFormulaCellReferences(formulaCell, dependencies);
  }

  /** Registers graph references for one formula cell, including broken references. */
  public updateFormulaCellReferences(
    formulaCell: WorkbookCellReference,
    dependencies: readonly WorkbookFormulaGraphReference[],
  ): void {
    const formulaKey = createWorkbookCellKey(formulaCell);
    this.removeFormulaCell(formulaCell);
    const normalizedDependencies = dependencies.map((dependency) =>
      cloneWorkbookFormulaGraphReference(
        isWorkbookFormulaBrokenReference(dependency) ? dependency : normalizeFormulaReference(dependency),
      ),
    );
    this.#dependencies.set(formulaKey, normalizedDependencies);
    this.#dirtyFormulaCells.add(formulaKey);
    this.#rebuildReverseIndex();
  }

  /** Removes one formula cell and every reverse edge it owns. */
  public removeFormulaCell(formulaCell: WorkbookCellReference): void {
    const formulaKey = createWorkbookCellKey(formulaCell);
    const previousDependencies = this.#dependencies.get(formulaKey);
    if (!previousDependencies) return;
    this.#dependencies.delete(formulaKey);
    this.#dirtyFormulaCells.delete(formulaKey);
    this.#formulaResults.delete(formulaKey);
    this.#rebuildReverseIndex();
  }

  /** Removes formulas on a deleted sheet and marks references to that sheet as broken. */
  public removeSheet(sheetId: WorkbookSheetId): void {
    for (const formulaKey of [...this.#dependencies.keys()]) {
      if (parseWorkbookCellKey(formulaKey)[WorkbookReferenceField.sheetId] === sheetId) {
        this.removeFormulaCell(parseWorkbookCellKey(formulaKey));
      }
    }
    this.#dependencies.forEach((dependencies, formulaKey) => {
      this.#dependencies.set(
        formulaKey,
        dependencies.map((dependency) => markDeletedSheetReference(dependency, sheetId)),
      );
      if (this.hasBrokenReferences(parseWorkbookCellKey(formulaKey))) this.#dirtyFormulaCells.add(formulaKey);
    });
    this.#rebuildReverseIndex();
  }

  /** Marks formulas that depend on changed workbook cells as dirty, including transitive formula chains. */
  public markDirty(changedCells: readonly WorkbookCellReference[]): readonly WorkbookCellReference[] {
    const queue = changedCells.map(createWorkbookCellKey);
    const visited = new Set<WorkbookCellKey>(queue);
    const newlyDirty = new Set<WorkbookCellKey>();

    while (queue.length > 0) {
      const changedKey = queue.shift();
      if (changedKey === void 0) break;
      const dependents = this.getDependents(parseWorkbookCellKey(changedKey));
      for (const dependent of dependents) {
        const dependentKey = createWorkbookCellKey(dependent);
        if (!this.#dependencies.has(dependentKey)) continue;
        this.#dirtyFormulaCells.add(dependentKey);
        this.#formulaResults.delete(dependentKey);
        newlyDirty.add(dependentKey);
        if (!visited.has(dependentKey)) {
          visited.add(dependentKey);
          queue.push(dependentKey);
        }
      }
    }

    return [...newlyDirty].map(parseWorkbookCellKey);
  }

  /** Stores a derived workbook formula result and marks the formula clean. */
  public setFormulaResult(formulaCell: WorkbookCellReference, result: FormulaValue): void {
    lockFormulaResultValue(result);
    const formulaKey = createWorkbookCellKey(formulaCell);
    this.#formulaResults.set(formulaKey, result);
    this.#dirtyFormulaCells.delete(formulaKey);
  }

  /** Returns a derived workbook formula result, or #REF! when references are broken. */
  public getFormulaResult(formulaCell: WorkbookCellReference): FormulaValue | undefined {
    if (this.hasBrokenReferences(formulaCell)) return createFormulaError(FormulaErrorCode.Reference);
    return this.#formulaResults.get(createWorkbookCellKey(formulaCell));
  }

  /** Reports whether one workbook formula cell needs recalculation. */
  public isDirty(formulaCell: WorkbookCellReference): boolean {
    return this.#dirtyFormulaCells.has(createWorkbookCellKey(formulaCell));
  }

  /** Returns every workbook-qualified formula cell currently marked dirty. */
  public getDirtyFormulaCells(): readonly WorkbookCellReference[] {
    return [...this.#dirtyFormulaCells].map(parseWorkbookCellKey);
  }

  /** Marks formula cells themselves dirty after an external evaluation service changes. */
  public markFormulaCellsDirty(formulaCells: readonly WorkbookCellReference[]): void {
    formulaCells.forEach((formulaCell) => {
      const key = createWorkbookCellKey(formulaCell);
      if (!this.#dependencies.has(key)) return;
      this.#dirtyFormulaCells.add(key);
      this.#formulaResults.delete(key);
    });
  }

  /** Reports whether one workbook-qualified cell is registered as a formula cell. */
  public hasFormulaCell(formulaCell: WorkbookCellReference): boolean {
    return this.#dependencies.has(createWorkbookCellKey(formulaCell));
  }

  /** Returns workbook-qualified dependencies owned by one formula cell. */
  public getDependencies(formulaCell: WorkbookCellReference): readonly WorkbookFormulaGraphReference[] {
    return (this.#dependencies.get(createWorkbookCellKey(formulaCell)) ?? []).map(cloneWorkbookFormulaGraphReference);
  }

  /** Returns broken references owned by one formula cell. */
  public getBrokenReferences(formulaCell: WorkbookCellReference): readonly WorkbookFormulaBrokenReference[] {
    return this.getDependencies(formulaCell).filter(isWorkbookFormulaBrokenReference);
  }

  /** Reports whether one formula cell currently contains broken references. */
  public hasBrokenReferences(formulaCell: WorkbookCellReference): boolean {
    return this.getBrokenReferences(formulaCell).length > 0;
  }

  /** Returns formula cells that currently depend on the given workbook cell. */
  public getDependents(cell: WorkbookCellReference): readonly WorkbookCellReference[] {
    const key = createWorkbookCellKey(cell);
    const dependents = new Set<WorkbookCellKey>(this.#cellDependents.get(key) ?? []);
    this.#dependencies.forEach((dependencies, formulaKey) => {
      if (dependencies.some((dependency) => dependencyContainsCell(dependency, cell))) dependents.add(formulaKey);
    });
    return [...dependents].map(parseWorkbookCellKey);
  }

  /** Returns every workbook-qualified formula cell currently registered. */
  public getFormulaCells(): readonly WorkbookCellReference[] {
    return [...this.#dependencies.keys()].map(parseWorkbookCellKey);
  }

  /** Removes every formula and dependency edge. */
  public clear(): void {
    this.#dependencies.clear();
    this.#cellDependents.clear();
    this.#dirtyFormulaCells.clear();
    this.#formulaResults.clear();
  }

  /** Number of formula cells currently registered in the workbook graph. */
  public get size(): number {
    return this.#dependencies.size;
  }

  /** Number of formula cells currently marked dirty. */
  public get dirtySize(): number {
    return this.#dirtyFormulaCells.size;
  }

  /** Number of cached formula results currently retained by the workbook graph. */
  public get resultSize(): number {
    return this.#formulaResults.size;
  }

  #rebuildReverseIndex(): void {
    this.#cellDependents.clear();
    this.#dependencies.forEach((dependencies, formulaKey) => {
      dependencies.forEach((dependency) => {
        if (!isWorkbookCellReference(dependency)) return;
        const dependencyKey = createWorkbookCellKey(dependency);
        const dependents = this.#cellDependents.get(dependencyKey) ?? new Set<WorkbookCellKey>();
        dependents.add(formulaKey);
        this.#cellDependents.set(dependencyKey, dependents);
      });
    });
  }
}

function cloneWorkbookFormulaGraphReference(reference: WorkbookFormulaGraphReference): WorkbookFormulaGraphReference {
  if (isWorkbookFormulaBrokenReference(reference)) {
    return { ...reference, reference: cloneWorkbookFormulaReference(reference.reference) };
  }
  return cloneWorkbookFormulaReference(reference);
}

function cloneWorkbookFormulaReference(reference: WorkbookFormulaReference): WorkbookFormulaReference {
  if (isWorkbookRangeReference(reference)) {
    return {
      ...reference,
      start: [reference.start[0], reference.start[1]],
      end: [reference.end[0], reference.end[1]],
    };
  }
  return { ...reference };
}

function normalizeFormulaReference(reference: WorkbookFormulaReference): WorkbookFormulaReference {
  if (isWorkbookRangeReference(reference)) return normalizeWorkbookRangeReference(reference);
  if (isWorkbookColumnRangeReference(reference)) return normalizeWorkbookColumnRangeReference(reference);
  if (isWorkbookRowRangeReference(reference)) return normalizeWorkbookRowRangeReference(reference);
  return reference;
}

function dependencyContainsCell(dependency: WorkbookFormulaGraphReference, cell: WorkbookCellReference): boolean {
  if (isWorkbookFormulaBrokenReference(dependency)) return false;
  if (dependency[WorkbookReferenceField.sheetId] !== cell[WorkbookReferenceField.sheetId]) return false;
  if (isWorkbookCellReference(dependency)) {
    return (
      dependency[WorkbookReferenceField.row] === cell[WorkbookReferenceField.row] &&
      dependency[WorkbookReferenceField.col] === cell[WorkbookReferenceField.col]
    );
  }
  if (isWorkbookRangeReference(dependency)) {
    const normalized = normalizeWorkbookRangeReference(dependency);
    const [startRow, startCol] = normalized[WorkbookReferenceField.start];
    const [endRow, endCol] = normalized[WorkbookReferenceField.end];
    return (
      cell[WorkbookReferenceField.row] >= startRow &&
      cell[WorkbookReferenceField.row] <= endRow &&
      cell[WorkbookReferenceField.col] >= startCol &&
      cell[WorkbookReferenceField.col] <= endCol
    );
  }
  if (isWorkbookColumnRangeReference(dependency)) {
    const normalized = normalizeWorkbookColumnRangeReference(dependency);
    return (
      cell[WorkbookReferenceField.col] >= normalized[WorkbookReferenceField.startCol] &&
      cell[WorkbookReferenceField.col] <= normalized[WorkbookReferenceField.endCol]
    );
  }
  const normalized = normalizeWorkbookRowRangeReference(dependency);
  return (
    cell[WorkbookReferenceField.row] >= normalized[WorkbookReferenceField.startRow] &&
    cell[WorkbookReferenceField.row] <= normalized[WorkbookReferenceField.endRow]
  );
}

function markDeletedSheetReference(
  dependency: WorkbookFormulaGraphReference,
  sheetId: WorkbookSheetId,
): WorkbookFormulaGraphReference {
  if (isWorkbookFormulaBrokenReference(dependency)) return dependency;
  if (dependency[WorkbookReferenceField.sheetId] !== sheetId) return dependency;
  return {
    kind: WorkbookFormulaGraphReferenceKind.Broken,
    reason: WorkbookFormulaBrokenReferenceReason.SheetDeleted,
    sheetId,
    reference: dependency,
  };
}

/** Reports whether one workbook formula graph reference is a retained broken reference. */
export function isWorkbookFormulaBrokenReference(
  reference: WorkbookFormulaGraphReference,
): reference is WorkbookFormulaBrokenReference {
  return 'kind' in reference && reference.kind === WorkbookFormulaGraphReferenceKind.Broken;
}
