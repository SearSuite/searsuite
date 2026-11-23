import {
  isFormulaArgumentKind,
  FormulaErrorCode,
  FormulaFunctionArguments,
  FormulaNodeKind,
  FormulaRangeSourceKind,
  FormulaServiceCacheStatus,
  FormulaStockHistoryServiceDefinition,
  createFormulaError,
  isFormulaError,
  type EvalContext,
  type FormulaArg,
  type FormulaFunction,
  type FormulaMetadataCellReference,
  type FormulaValue,
} from '@searsuite/sear-domain-formula-engine';
import { isFormulaText } from '@searsuite/sear-foundation-utils';
import { inspectExcelCellFormat } from '@searsuite/sear-domain-format';
import { readArg } from '../shared/helpers';
import { mapArrayValues, readArrayArgument } from '../shared/arrayArgumentValues';
import { resolveConditionalReference, resolveUnionReferenceAreas } from '../shared/conditionalReference';
import { isBlankScalarInput } from '../shared/blankScalarInput';
import { readScalar, isFormulaErrorValue } from '../math/shared/mathUtils';
import { dateTimeParseOptions } from '../dateTime/shared/dateTimeFunctionUtils';
import { parseExcelDate } from '../dateTime/shared/dateTimeUtils';

/** Creates an information function backed by value inspection, metadata projections, or host caches. */
export function createInformationFunction(name: string): FormulaFunction {
  return {
    name,
    ...(name === 'INFO' ? { volatileOnViewport: true } : {}),
    ...(name === 'STOCKHISTORY'
      ? {
          descriptor: {
            version: 1 as const,
            summary: 'Returns cached historical market data.',
            category: 'Information',
            example: '=STOCKHISTORY("MSFT",DATE(2024,1,1))',
            parameters: [],
            returnKind: 'array' as const,
            externalServices: [FormulaStockHistoryServiceDefinition.id],
          },
        }
      : {}),
    evaluate: (args, context) => evaluateInformation(name, args, context),
  };
}

function evaluateInformation(name: string, args: FormulaArg[], context: EvalContext): FormulaValue {
  if (name === 'NA') return args.length === 0 ? createFormulaError(FormulaErrorCode.NotAvailable) : valueError();
  if (name === 'CELL') return evaluateCell(args, context);
  if (name === 'INFO') return evaluateInfo(args, context);
  if (name === 'SHEET' || name === 'SHEETS') return evaluateSheet(name, args, context);
  if (name === 'STOCKHISTORY') return evaluateStockHistory(args, context);
  if (name === 'ISREF') return args.length === 1 ? isReference(args[0], context) : valueError();
  if (name === 'ISBLANK') return evaluateIsBlank(args, context);
  if (name === 'ISFORMULA') return evaluateIsFormula(args, context);
  if (args.length !== 1) return valueError();
  const predicate = isTypePredicate(name);
  const value = predicate ? readArrayArgument(args[0], context, true) : readArg(args[0], context);
  if (predicate && Array.isArray(value))
    return mapArrayValues(value, (item) => evaluateTypePredicate(name, item, false));
  if (name === 'ERROR.TYPE') return errorType(value);
  if (predicate) return evaluateTypePredicate(name, value, isBlankScalarInput(args[0], context));
  if (name === 'ISEVEN' || name === 'ISODD') {
    if (isFormulaErrorValue(value)) return value;
    let number = typeof value === 'boolean' ? Number(value)
      : readScalar(args, 0, context, undefined, true, false);
    if (isFormulaErrorValue(number)) {
      const dateSerial = typeof value === 'string' || isFormulaText(value)
        ? parseExcelDate(value, dateTimeParseOptions(context))
        : null;
      if (dateSerial === null) return number;
      number = dateSerial;
    }
    return Math.abs(Math.trunc(number)) % 2 === (name === 'ISODD' ? 1 : 0);
  }
  if (name === 'N') return numericProjection(value);
  if (name === 'TYPE') return typeCode(value);
  return createFormulaError(FormulaErrorCode.Name);
}

function isTypePredicate(name: string): boolean {
  return name === 'ISERR' || name === 'ISERROR' || name === 'ISNA' ||
    name === 'ISLOGICAL' || name === 'ISNUMBER' || name === 'ISTEXT' || name === 'ISNONTEXT';
}

function evaluateTypePredicate(name: string, value: FormulaValue, blank: boolean): boolean {
  if (name === 'ISERR') return isErrorValue(value) && value.code !== FormulaErrorCode.NotAvailable;
  if (name === 'ISERROR') return isErrorValue(value);
  if (name === 'ISNA') return isErrorValue(value) && value.code === FormulaErrorCode.NotAvailable;
  if (name === 'ISLOGICAL') return typeof value === 'boolean';
  if (name === 'ISNUMBER') return typeof value === 'number' && !blank;
  const text = typeof value === 'string' || isFormulaText(value);
  return name === 'ISTEXT' ? text : !text;
}

function evaluateCell(args: FormulaArg[], context: EvalContext): FormulaValue {
  if (args.length < 1 || args.length > 2) return valueError();
  if (args[1] && isFormulaArgumentKind(args[1], 'value') && isFormulaError(args[1].value)) {
    const reference = resolveConditionalReference(args[1], context);
    if (isFormulaError(reference)) return reference;
    if (!reference) return args[1].value;
  }
  const reader = new FormulaFunctionArguments(args, context);
  const info = reader.text(0);
  if (isFormulaError(info)) return info;
  const reference = args[1] ? metadataReference(args[1], context) : context.currentCell;
  if (!reference) return valueError();
  const metadata = context.metadata?.readCell(reference);
  if (!metadata) return createFormulaError(FormulaErrorCode.NotAvailable);
  const infoType = info.toLowerCase();
  if (infoType === 'format' || infoType === 'color' || infoType === 'parentheses')
    return inspectExcelCellFormat(metadata.numberFormat)[infoType];
  switch (infoType) {
    case 'address':
      return `$${columnName(reference.col)}$${reference.row + 1}`;
    case 'col':
      return reference.col + 1;
    case 'contents':
      return metadata.value;
    case 'filename':
      return context.metadata?.readWorkbook?.()?.currentSheetName ?? '';
    case 'prefix':
      return metadata.labelPrefix ?? '';
    case 'protect':
      return metadata.locked === false ? 0 : 1;
    case 'row':
      return reference.row + 1;
    case 'type':
      return metadata.source === 'empty'
        ? 'b'
        : typeof metadata.value === 'string' || isFormulaText(metadata.value)
        ? 'l'
        : 'v';
    case 'width':
      return metadata.width ?? 0;
    default:
      return valueError();
  }
}

function evaluateInfo(args: FormulaArg[], context: EvalContext): FormulaValue {
  if (args.length !== 1) return valueError();
  const type = new FormulaFunctionArguments(args, context).text(0);
  if (isFormulaError(type)) return type;
  const environment = context.metadata?.readEnvironment?.();
  const workbook = context.metadata?.readWorkbook?.();
  switch (type.toLowerCase()) {
    case 'directory':
      return environment?.directory ?? '';
    case 'numfile':
      return workbook?.sheets.length ?? 1;
    case 'origin': {
      const visible = context.metadata?.readVisibleOrigin?.();
      return `$${columnName(visible?.col ?? 0)}$${(visible?.row ?? 0) + 1}`;
    }
    case 'osversion':
      return environment?.operatingSystem ?? createFormulaError(FormulaErrorCode.NotAvailable);
    case 'recalc':
      return context.textLocale?.calculationModeLabel?.(environment?.calculationMode ?? 'Automatic')
        ?? environment?.calculationMode ?? 'Automatic';
    case 'release':
      return environment?.version ?? createFormulaError(FormulaErrorCode.NotAvailable);
    case 'system':
      return environment?.system ?? createFormulaError(FormulaErrorCode.NotAvailable);
    default:
      return valueError();
  }
}

function evaluateSheet(name: string, args: FormulaArg[], context: EvalContext): FormulaValue {
  if (args.length > 1) return valueError();
  const argument = args[0];
  if (argument && argument.kind !== 'missing' && isFormulaArgumentKind(argument, 'value')) {
    if (isErrorValue(argument.value)) return argument.value;
  }
  const workbook = context.metadata?.readWorkbook?.();
  if (name === 'SHEETS') {
    if (!argument || argument.kind === 'missing') return workbook?.sheets.length ?? 1;
    if (isReference(argument, context)) return 1;
    return workbook ? valueError() : createFormulaError(FormulaErrorCode.NotAvailable);
  }
  if (!workbook) {
    if (!argument || argument.kind === 'missing') return 1;
    const localReference = metadataReference(argument, context);
    return localReference && !localReference.sheetName ? 1 : createFormulaError(FormulaErrorCode.NotAvailable);
  }
  const reference = argument && argument.kind !== 'missing' ? metadataReference(argument, context) : undefined;
  if (argument && argument.kind !== 'missing' && !reference) {
    const value = readArg(argument, context);
    if (isErrorValue(value)) return value;
    const name = isFormulaText(value) ? value.value : value;
    if (typeof name !== 'string') return createFormulaError(FormulaErrorCode.NotAvailable);
    return workbook.sheets.find((sheet) => sheet.name.toLowerCase() === name.toLowerCase())?.index
      ?? createFormulaError(FormulaErrorCode.NotAvailable);
  }
  const sheetName = reference?.sheetName ?? workbook.currentSheetName;
  const sheet =
    sheetName === undefined
      ? workbook.sheets.find((candidate) => candidate.id === workbook.currentSheetId)
      : workbook.sheets.find((candidate) => candidate.name === sheetName);
  return sheet?.index ?? createFormulaError(FormulaErrorCode.NotAvailable);
}

function evaluateStockHistory(args: FormulaArg[], context: EvalContext): FormulaValue {
  if (args.length < 2 || args.length > 9) return valueError();
  const reader = new FormulaFunctionArguments(args, context);
  const stock = reader.text(0);
  const startDate = reader.number(1);
  const endDate = reader.number(2, startDate as number);
  const interval = reader.integer(3, 0);
  const headers = reader.integer(4, 1);
  if ([stock, startDate, endDate, interval, headers].some(isFormulaError))
    return [stock, startDate, endDate, interval, headers].find(isFormulaError) as FormulaValue;
  if (![0, 1, 2].includes(interval as number) || ![0, 1, 2].includes(headers as number))
    return createFormulaError(FormulaErrorCode.Value);
  const properties: number[] = [];
  for (let index = 5; index < args.length; index++) {
    const property = reader.integer(index);
    if (isFormulaError(property)) return property;
    if (property < 0 || property > 5) return valueError();
    properties.push(property);
  }
  if (properties.length === 0) properties.push(0, 1);
  const result = context.externalServices?.get(FormulaStockHistoryServiceDefinition)?.read({
    stock: stock as string,
    startDate: startDate as number,
    endDate: endDate as number,
    interval: interval as 0 | 1 | 2,
    headers: headers as 0 | 1 | 2,
    properties,
  });
  return result?.status === FormulaServiceCacheStatus.Ready
    ? result.value
    : createFormulaError(FormulaErrorCode.NotAvailable);
}

function evaluateIsBlank(args: FormulaArg[], context: EvalContext): FormulaValue {
  if (args.length !== 1) return valueError();
  const reference = metadataReference(args[0], context);
  return reference ? context.metadata?.readCell(reference)?.source === 'empty' : false;
}

function evaluateIsFormula(args: FormulaArg[], context: EvalContext): FormulaValue {
  if (args.length !== 1) return valueError();
  const reference = metadataReference(args[0], context);
  return reference ? context.metadata?.readCell(reference)?.source === 'formula' : false;
}

function errorType(value: FormulaValue): FormulaValue {
  if (!isErrorValue(value)) return createFormulaError(FormulaErrorCode.NotAvailable);
  const codes: Partial<Record<string, number>> = {
    [FormulaErrorCode.NullIntersection]: 1,
    [FormulaErrorCode.DivisionByZero]: 2,
    [FormulaErrorCode.Value]: 3,
    [FormulaErrorCode.Reference]: 4,
    [FormulaErrorCode.Name]: 5,
    [FormulaErrorCode.Number]: 6,
    [FormulaErrorCode.NotAvailable]: 7,
    [FormulaErrorCode.Spill]: 9,
    [FormulaErrorCode.Calculation]: 14,
  };
  return codes[value.code] ?? createFormulaError(FormulaErrorCode.NotAvailable);
}

function numericProjection(value: FormulaValue): FormulaValue {
  if (isErrorValue(value)) return value;
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return 0;
}

function typeCode(value: FormulaValue): number {
  if (Array.isArray(value)) return 64;
  if (isErrorValue(value)) return 16;
  if (typeof value === 'boolean') return 4;
  if (typeof value === 'number') return 1;
  return 2;
}

function metadataReference(arg: FormulaArg, context: EvalContext): FormulaMetadataCellReference | undefined {
  if (isFormulaArgumentKind(arg, FormulaNodeKind.Cell)) return { row: arg.row, col: arg.col };
  if (isFormulaArgumentKind(arg, FormulaNodeKind.Range) && arg.start[0] === arg.end[0] && arg.start[1] === arg.end[1])
    return { row: arg.start[0], col: arg.start[1] };
  if (isFormulaArgumentKind(arg, FormulaNodeKind.WorkbookCell))
    return { row: arg.row, col: arg.col, sheetName: arg.sheetName };
  if (
    isFormulaArgumentKind(arg, FormulaNodeKind.WorkbookRange) &&
    arg.start[0] === arg.end[0] &&
    arg.start[1] === arg.end[1]
  )
    return { row: arg.start[0], col: arg.start[1], sheetName: arg.sheetName };
  const selected = resolveConditionalReference(arg, context);
  if (!selected || isFormulaError(selected) ||
    selected.startRow !== selected.endRow || selected.startCol !== selected.endCol) return undefined;
  return {
    row: selected.startRow,
    col: selected.startCol,
    ...(selected.source.kind === FormulaRangeSourceKind.WorkbookSheet
      ? { sheetName: selected.source.sheetName }
      : {}),
  };
}

function isReference(arg: FormulaArg, context: EvalContext): boolean {
  if (isFormulaArgumentKind(arg, 'reference')) return true;
  const areas = resolveUnionReferenceAreas(arg, context);
  if (areas !== undefined) return Array.isArray(areas);
  const reference = resolveConditionalReference(arg, context);
  return reference !== undefined && !isFormulaError(reference);
}
function isErrorValue(value: unknown): value is { kind: 'error'; code: string } {
  return typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'error';
}
function columnName(column: number): string {
  let value = column + 1;
  let result = '';
  while (value > 0) {
    value--;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}
function valueError() {
  return createFormulaError(FormulaErrorCode.Value);
}
