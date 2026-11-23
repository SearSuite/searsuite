import {
  FormulaErrorCode,
  FormulaFunctionArguments,
  createFormulaError,
  isFormulaError,
  type EvalContext,
  type FormulaArg,
  type FormulaError,
  type FormulaFunction,
  type FormulaValue,
  type FormulaRangeCell,
} from '@searsuite/sear-domain-formula-engine';
import { isFormulaError as isErrorValue, isFormulaText } from '@searsuite/sear-foundation-utils';
import { matrixFromArg } from '../math/shared/mathUtils';
import { forEachFormulaRangeCellWithMetadata, matchesCriteria } from '../shared/helpers';
import { resolveConditionalReference } from '../shared/conditionalReference';
import { stableVariance } from '../shared/stableVariance';

/** Creates one Excel database formula backed by shared field and criteria evaluation. */
export function createDatabaseFunction(name: string): FormulaFunction {
  return { name, evaluate: (args, context) => evaluateDatabase(name, args, context) };
}

function evaluateDatabase(name: string, args: FormulaArg[], context: EvalContext): FormulaValue {
  if (args.length !== 3) return valueError();
  const databaseReference = resolveConditionalReference(args[0], context);
  if (databaseReference) {
    if (isFormulaError(databaseReference)) return databaseReference;
    if (databaseReference.endRow - databaseReference.startRow < 1) return valueError();
  }
  const database = matrixFromArg(args[0], context);
  if (isErrorValue(database)) return database;
  const criteria = matrixFromArg(args[2], context);
  if (isErrorValue(criteria)) return criteria;
  if (database.length < 2 || (database[0]?.length ?? 0) === 0 || criteria.length < 1) return valueError();
  const field = resolveField(args, context, database[0]);
  if (isFormulaError(field)) return field;
  const predicates = compileCriteria(criteria, database[0]);
  if (isFormulaError(predicates)) return predicates;
  const selected = database
    .slice(1)
    .map((row, index) => ({ row, rowOffset: index + 1 }))
    .filter(({ row }) => predicates.length === 0 || predicates.some((predicate) => predicate(row)));
  const values = selected.map(({ row }) => row[field]).filter((value): value is FormulaValue => value !== undefined);
  if (name === 'DCOUNT') return values.filter((value) => typeof value === 'number' && Number.isFinite(value)).length;
  if (name === 'DCOUNTA') {
    const sources = new Map<number, FormulaRangeCell['source']>();
    if (databaseReference && !isFormulaError(databaseReference)) {
      const readError = forEachFormulaRangeCellWithMetadata(databaseReference, context, (cell, rowOffset, colOffset) => {
        if (colOffset === field) sources.set(rowOffset, cell.source);
      });
      if (readError) return readError;
    }
    return selected.reduce((count, { row, rowOffset }) => {
      const source = sources.get(rowOffset);
      return count + (source === 'empty' ? 0 : source ? 1 : isBlank(row[field] ?? '') ? 0 : 1);
    }, 0);
  }
  const numbers: number[] = [];
  for (const value of values) {
    if (isErrorValue(value)) return value;
    if (typeof value === 'number' && Number.isFinite(value)) numbers.push(value);
  }
  if (name === 'DGET') {
    if (values.length === 0) return valueError();
    if (values.length > 1) return createFormulaError(FormulaErrorCode.Number);
    return values[0];
  }
  if (name === 'DSUM') return numbers.reduce((sum, value) => sum + value, 0);
  if (name === 'DPRODUCT') return numbers.length === 0 ? 0 : numbers.reduce((product, value) => product * value, 1);
  if (numbers.length === 0)
    return ['DAVERAGE', 'DVAR', 'DVARP', 'DSTDEV', 'DSTDEVP'].includes(name)
      ? createFormulaError(FormulaErrorCode.DivisionByZero)
      : name === 'DMAX' || name === 'DMIN' ? 0 : valueError();
  if (name === 'DAVERAGE') return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
  if (name === 'DMAX') return Math.max(...numbers);
  if (name === 'DMIN') return Math.min(...numbers);
  const sample = name === 'DSTDEV' || name === 'DVAR';
  if (numbers.length < (sample ? 2 : 1)) return createFormulaError(FormulaErrorCode.DivisionByZero);
  const result = stableVariance(numbers, sample);
  return name === 'DSTDEV' || name === 'DSTDEVP' ? result.deviation : result.variance;
}

function resolveField(
  args: FormulaArg[],
  context: EvalContext,
  headers: FormulaValue[],
): number | FormulaError {
  const value = new FormulaFunctionArguments(args, context).value(1);
  if (isFormulaError(value)) return value;
  if (Array.isArray(value) || typeof value === 'object') return valueError();
  if (typeof value === 'number') {
    const index = Math.trunc(value) - 1;
    return index >= 0 && index < headers.length ? index : valueError();
  }
  const label = String(value).toLowerCase();
  const index = headers.findIndex((header) => scalarText(header).toLowerCase() === label);
  return index >= 0 ? index : valueError();
}

type RowPredicate = (row: FormulaValue[]) => boolean;

function compileCriteria(
  criteria: FormulaValue[][],
  headers: FormulaValue[],
): RowPredicate[] | FormulaError {
  for (const row of criteria) {
    const originalError = row.find(isFormulaError);
    if (originalError) return originalError;
  }
  const criteriaHeaders = criteria[0] ?? [];
  const columns = criteriaHeaders.map((header) =>
    headers.findIndex((candidate) => scalarText(candidate).toLowerCase() === scalarText(header).toLowerCase()),
  );
  const predicates: RowPredicate[] = [];
  for (const criteriaRow of criteria.slice(1)) {
    const conditions = criteriaRow
      .map((criterion, index) => ({ criterion, field: columns[index] }))
      .filter(({ criterion }) => !isBlank(criterion));
    if (conditions.length === 0) continue;
    predicates.push((row) => conditions.every(({ criterion, field }) =>
      field !== undefined && field >= 0 && matchesCriteria(row[field] ?? '', criterion)));
  }
  return predicates;
}

function scalarText(value: FormulaValue): string {
  return isFormulaText(value) ? value.value : typeof value === 'object' ? '' : String(value);
}

function isBlank(value: FormulaValue): boolean {
  return value === '' || (isFormulaText(value) && value.value === '');
}

function valueError() {
  return createFormulaError(FormulaErrorCode.Value);
}
