import {
  isFormulaArgumentKind,
  FormulaCubeServiceDefinition,
  FormulaErrorCode,
  FormulaNodeKind,
  FormulaServiceCacheStatus,
  createFormulaError,
  isFormulaError,
  type EvalContext,
  type FormulaArg,
  type FormulaCubeMemberExpression,
  type FormulaCubeMemberValue,
  type FormulaCubeQuery,
  type FormulaCubeResult,
  type FormulaCubeSetValue,
  type FormulaError,
  type FormulaText,
  type FormulaTupleValue,
  type FormulaValue,
} from '@searsuite/sear-domain-formula-engine';

export const cubeValueError = (): FormulaError => createFormulaError(FormulaErrorCode.Value);

export function readCubeQuery(query: FormulaCubeQuery, context: EvalContext): FormulaCubeResult {
  const result = context.externalServices?.get(FormulaCubeServiceDefinition)?.read(query);
  return result?.status === FormulaServiceCacheStatus.Ready
    ? result.value
    : createFormulaError(FormulaErrorCode.NotAvailable);
}

export function readValue(arg: FormulaArg | undefined, context: EvalContext): FormulaValue {
  if (!arg || isFormulaArgumentKind(arg, 'missing')) return cubeValueError();
  if (isFormulaArgumentKind(arg, 'value')) return arg.value;
  if (isFormulaArgumentKind(arg, 'expression')) return context.evaluateFormula?.(arg.ast) ?? cubeValueError();
  if (isFormulaArgumentKind(arg, FormulaNodeKind.Cell)) return context.getCellValue(arg.row, arg.col);
  if (isFormulaArgumentKind(arg, FormulaNodeKind.WorkbookCell)) {
    return context.getWorkbookCellValue?.(arg.sheetName, arg.row, arg.col) ?? cubeValueError();
  }
  return cubeValueError();
}

export function readText(arg: FormulaArg | undefined, context: EvalContext): string | FormulaError {
  const value = readValue(arg, context);
  if (isFormulaError(value)) return value;
  if (typeof value === 'string') return value;
  if (isFormulaText(value)) return value.value;
  return cubeValueError();
}

export function readOptionalText(arg: FormulaArg | undefined, context: EvalContext): string | FormulaError | undefined {
  return !arg || isFormulaArgumentKind(arg, 'missing') ? undefined : readText(arg, context);
}

export function readInteger(arg: FormulaArg | undefined, context: EvalContext): number | FormulaError {
  const value = readValue(arg, context);
  if (isFormulaError(value)) return value;
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' || isFormulaText(value)
      ? Number(isFormulaText(value) ? value.value : value)
      : NaN;
  return Number.isFinite(numeric) ? Math.trunc(numeric) : cubeValueError();
}

export function readMemberExpression(
  arg: FormulaArg | undefined,
  context: EvalContext,
): FormulaCubeMemberExpression | FormulaError {
  if (!arg || isFormulaArgumentKind(arg, 'missing')) return cubeValueError();
  if (isFormulaArgumentKind(arg, FormulaNodeKind.Range)) {
    return readRange(arg.start[0], arg.start[1], arg.end[0], arg.end[1], context.iterateRange.bind(context));
  }
  if (isFormulaArgumentKind(arg, FormulaNodeKind.WorkbookRange)) {
    if (!context.iterateWorkbookRange) return createFormulaError(FormulaErrorCode.Reference);
    return readRange(arg.start[0], arg.start[1], arg.end[0], arg.end[1], (sr, sc, er, ec) =>
      context.iterateWorkbookRange!(arg.sheetName, sr, sc, er, ec),
    );
  }
  return toMemberExpression(readValue(arg, context));
}

export function readSet(
  arg: FormulaArg | undefined,
  context: EvalContext,
): string | FormulaCubeSetValue | FormulaError {
  const value = readValue(arg, context);
  if (isFormulaError(value)) return value;
  if (typeof value === 'string' || isCubeSet(value)) return value;
  if (isFormulaText(value)) return value.value;
  return cubeValueError();
}

export function isCubeMember(value: FormulaValue): value is FormulaCubeMemberValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && value.kind === 'cube-member';
}

export function isCubeSet(value: FormulaValue): value is FormulaCubeSetValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && value.kind === 'cube-set';
}

function readRange(
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number,
  iterate: (sr: number, sc: number, er: number, ec: number) => Iterable<FormulaValue>,
): FormulaCubeMemberExpression | FormulaError {
  const values: FormulaCubeMemberExpression[] = [];
  for (const value of iterate(startRow, startCol, endRow, endCol)) {
    const expression = toMemberExpression(value);
    if (isFormulaError(expression)) return expression;
    values.push(expression);
  }
  return values.length === 1 ? values[0] : values;
}

function toMemberExpression(value: FormulaValue): FormulaCubeMemberExpression | FormulaError {
  if (isFormulaError(value)) return value;
  if (typeof value === 'string' || isCubeMember(value)) return value;
  if (isFormulaText(value)) return value.value;
  if (isTuple(value)) {
    const items: FormulaCubeMemberExpression[] = [];
    for (const item of value.items) {
      const expression = toMemberExpression(item);
      if (isFormulaError(expression)) return expression;
      items.push(expression);
    }
    return items;
  }
  return cubeValueError();
}

function isTuple(value: FormulaValue): value is FormulaTupleValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && value.kind === 'tuple';
}

function isFormulaText(value: FormulaValue): value is FormulaText {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && value.kind === 'text';
}
