import {
  FormulaErrorCode,
  createFormulaError,
  isFormulaError,
  type FormulaValue,
} from '@searsuite/sear-domain-formula-engine';
import { isFormulaText } from '@searsuite/sear-foundation-utils';
import { parseQuery, type QueryPredicate } from './queryParser';

export function runQuery(data: FormulaValue[][], query: string, headers: number): FormulaValue {
  const clauses = parseQuery(query);
  if (!clauses) return createFormulaError(FormulaErrorCode.Value);
  const width = data.reduce((maximum, row) => Math.max(maximum, row.length), 0);
  if (
    clauses.columns?.some((column) => column >= width) ||
    clauses.order?.some((sort) => sort.column >= width) ||
    (clauses.where && !validPredicateColumns(clauses.where, width))
  ) return createFormulaError(FormulaErrorCode.Value);

  const headerCount = headers === -1 ? inferHeaders(data) : headers;
  const headerRows = data.slice(0, headerCount);
  let rows = data.slice(headerCount);
  if (clauses.where) rows = rows.filter((row) => testWhere(row, clauses.where!));
  if (clauses.order) {
    rows = [...rows].sort((left, right) => {
      for (const sort of clauses.order!) {
        const difference = compareValues(left[sort.column] ?? null, right[sort.column] ?? null);
        if (difference) return sort.direction * difference;
      }
      return 0;
    });
  }
  if (clauses.offset) rows = rows.slice(clauses.offset);
  if (clauses.limit !== undefined) rows = rows.slice(0, clauses.limit);
  const columns = clauses.columns ?? Array.from({ length: width }, (_, index) => index);
  const result = [...headerRows, ...rows].map((row) => columns.map((column) => row[column] ?? null));
  if (result.length === 0) return createFormulaError(FormulaErrorCode.NotAvailable);
  for (const row of result) for (const value of row) if (isFormulaError(value)) return value;
  return result;
}

function inferHeaders(data: FormulaValue[][]): number {
  if (data.length < 2) return 0;
  return data[0]!.some((value, column) => textValue(value) !== undefined &&
    data.slice(1).some((row) => typeof row[column] === 'number')) ? 1 : 0;
}

function validPredicateColumns(predicate: QueryPredicate, width: number): boolean {
  return predicate.kind === 'comparison'
    ? predicate.column < width
    : validPredicateColumns(predicate.left, width) && validPredicateColumns(predicate.right, width);
}

function testWhere(row: FormulaValue[], predicate: QueryPredicate): boolean {
  if (predicate.kind === 'and') return testWhere(row, predicate.left) && testWhere(row, predicate.right);
  if (predicate.kind === 'or') return testWhere(row, predicate.left) || testWhere(row, predicate.right);
  const left = row[predicate.column] ?? null;
  if (predicate.operator === 'contains') {
    const haystack = textValue(left);
    const needle = textValue(predicate.value);
    return haystack !== undefined && needle !== undefined && haystack.includes(needle);
  }
  const comparison = compareValues(left, predicate.value);
  if (comparison === undefined) return predicate.operator === '<>' || predicate.operator === '!=';
  switch (predicate.operator) {
    case '=': return comparison === 0;
    case '<>':
    case '!=': return comparison !== 0;
    case '<': return comparison < 0;
    case '>': return comparison > 0;
    case '<=': return comparison <= 0;
    case '>=': return comparison >= 0;
  }
}

function compareValues(left: FormulaValue, right: FormulaValue): number | undefined {
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  if (typeof left === 'boolean' && typeof right === 'boolean') return Number(left) - Number(right);
  const leftText = textValue(left);
  const rightText = textValue(right);
  if (leftText !== undefined && rightText !== undefined)
    return leftText === rightText ? 0 : leftText < rightText ? -1 : 1;
  return left === null && right === null ? 0 : undefined;
}

function textValue(value: FormulaValue): string | undefined {
  return typeof value === 'string' ? value : isFormulaText(value) ? value.value : undefined;
}
