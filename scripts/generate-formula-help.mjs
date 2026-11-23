import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const functionsDir = path.join(root, 'packages/sear-domain-formula-engine-ts/src/functions');
const output = path.join(root, 'packages/sear-domain-formula-engine-ts/src/generated/builtInFunctionHelp.ts');
const categoryGroups = JSON.parse(fs.readFileSync(path.join(root, 'scripts/fixtures/formula-help-categories.json'), 'utf8'));
const categories = new Map(
  Object.entries(categoryGroups).flatMap(([category, names]) => names.map((name) => [name, category])),
);

const namedParameters = {
  ABS: ['number'],
  ACOS: ['number'],
  ACOSH: ['number'],
  ACOT: ['number'],
  ACOTH: ['number'],
  ADD: ['value1', 'value2'],
  AGGREGATE: ['function_num', 'options', 'ref1', 'ref2'],
  AND: ['logical'],
  ASIN: ['number'],
  ASINH: ['number'],
  ATAN: ['number'],
  ATAN2: ['x_num', 'y_num'],
  ATANH: ['number'],
  SUM: ['number'],
  AVERAGE: ['number'],
  AVERAGEA: ['value'],
  AVERAGEIF: ['range', 'criteria', 'average_range'],
  AVERAGEIFS: ['average_range', 'criteria_range', 'criteria'],
  COUNT: ['value'],
  COUNTA: ['value'],
  COUNTBLANK: ['range'],
  COUNTIF: ['range', 'criteria'],
  COUNTIFS: ['criteria_range', 'criteria'],
  COUNTUNIQUE: ['value'],
  'COVARIANCE.P': ['array1', 'array2'],
  'COVARIANCE.S': ['array1', 'array2'],
  MIN: ['number'],
  MAX: ['number'],
  IF: ['logical_test', 'value_if_true', 'value_if_false'],
  IFERROR: ['value', 'value_if_error'],
  IFNA: ['value', 'value_if_na'],
  SUMIF: ['range', 'criteria', 'sum_range'],
  SUMIFS: ['sum_range', 'criteria_range', 'criteria'],
  CHAR: ['number'],
  CHOOSE: ['index_num', 'value'],
  CHOOSECOLS: ['array', 'col_num'],
  CHOOSEROWS: ['array', 'row_num'],
  CLEAN: ['text'],
  CODE: ['text'],
  CONCAT: ['text'],
  CONCATENATE: ['text'],
  COS: ['number'],
  COSH: ['number'],
  COT: ['number'],
  COTH: ['number'],
  CSC: ['number'],
  CSCH: ['number'],
  DEGREES: ['angle'],
  DIVIDE: ['dividend', 'divisor'],
  EVEN: ['number'],
  EXP: ['number'],
  FACT: ['number'],
  FACTDOUBLE: ['number'],
  FIND: ['find_text', 'within_text', 'start_num'],
  FIXED: ['number', 'decimals', 'no_commas'],
  GROUPBY: ['row_fields', 'values', 'function'],
  FLOOR: ['number', 'significance'],
  'FLOOR.MATH': ['number', 'significance', 'mode'],
  'FLOOR.PRECISE': ['number', 'significance'],
  HYPERLINK: ['link_location', 'friendly_name'],
  IFS: ['logical_test', 'value_if_true'],
  ISBLANK: ['value'],
  ISERR: ['value'],
  ISERROR: ['value'],
  ISEVEN: ['number'],
  ISFORMULA: ['reference'],
  ISLOGICAL: ['value'],
  ISNA: ['value'],
  ISNUMBER: ['value'],
  ISODD: ['number'],
  ISTEXT: ['value'],
  LEN: ['text'],
  LOWER: ['text'],
  MOD: ['number', 'divisor'],
  NOT: ['logical'],
  OFFSET: ['reference', 'rows', 'cols', 'height', 'width'],
  OR: ['logical'],
  POWER: ['number', 'power'],
  PIVOTBY: ['row_fields', 'col_fields', 'values', 'function'],
  PRODUCT: ['number'],
  QUOTIENT: ['numerator', 'denominator'],
  RANDBETWEEN: ['bottom', 'top'],
  REPLACE: ['old_text', 'start_num', 'num_chars', 'new_text'],
  REPT: ['text', 'number_times'],
  ROUND: ['number', 'num_digits'],
  ROUNDDOWN: ['number', 'num_digits'],
  ROUNDUP: ['number', 'num_digits'],
  SEARCH: ['find_text', 'within_text', 'start_num'],
  SEC: ['number'],
  SECH: ['number'],
  SIGN: ['number'],
  SERIESSUM: ['x', 'n', 'm', 'coefficients'],
  SIN: ['number'],
  SINH: ['number'],
  SQRT: ['number'],
  SQRTPI: ['number'],
  SUBSTITUTE: ['text', 'old_text', 'new_text', 'instance_num'],
  SUMPRODUCT: ['array'],
  SUMSQ: ['number'],
  SWITCH: ['expression', 'value', 'result', 'default'],
  TAN: ['number'],
  TANH: ['number'],
  TRIM: ['text'],
  TOCOL: ['array', 'ignore', 'scan_by_column'],
  TOROW: ['array', 'ignore', 'scan_by_column'],
  TRUNC: ['number', 'num_digits'],
  UPPER: ['text'],
  VALUE: ['text'],
  VLOOKUP: ['lookup_value', 'table_array', 'col_index_num', 'range_lookup'],
  HLOOKUP: ['lookup_value', 'table_array', 'row_index_num', 'range_lookup'],
  XLOOKUP: ['lookup_value', 'lookup_array', 'return_array', 'if_not_found', 'match_mode', 'search_mode'],
  INDEX: ['array', 'row_num', 'column_num'],
  MATCH: ['lookup_value', 'lookup_array', 'match_type'],
  XMATCH: ['lookup_value', 'lookup_array', 'match_mode', 'search_mode'],
  FILTER: ['array', 'include', 'if_empty'],
  SORT: ['array', 'sort_index', 'sort_order', 'by_col'],
  UNIQUE: ['array', 'by_col', 'exactly_once'],
  INDIRECT: ['ref_text', 'a1'],
  TEXT: ['value', 'format_text'],
  LEFT: ['text', 'num_chars'],
  RIGHT: ['text', 'num_chars'],
  MID: ['text', 'start_num', 'num_chars'],
  DATE: ['year', 'month', 'day'],
  XIRR: ['values', 'dates', 'guess'],
  XNPV: ['rate', 'values', 'dates'],
  CALL: ['procedure', 'argument'],
  EUROCONVERT: ['number', 'source', 'target', 'full_precision', 'triangulation_precision'],
  'REGISTER.ID': ['module', 'procedure', 'type_text'],
  SHEET: ['value'],
  SHEETS: ['reference'],
};
const repeatingParameters = new Set([
  'SUM',
  'AVERAGE',
  'COUNT',
  'MIN',
  'MAX',
  'AND',
  'OR',
  'CONCAT',
  'CONCATENATE',
  'PRODUCT',
  'AVERAGEA',
  'COUNTA',
  'COUNTUNIQUE',
  'SUMPRODUCT',
  'SUMSQ',
  'CHOOSE',
  'CHOOSECOLS',
  'CHOOSEROWS',
  'IFS',
  'COUNTIFS',
  'SUMIFS',
]);

const exampleOverrides = {
  COUNTIF: '=COUNTIF(A1:A3,">0")',
  COUNTIFS: '=COUNTIFS(A1:A3,">0",B1:B3,"yes")',
  SUMIF: '=SUMIF(A1:A3,">0",B1:B3)',
  SUMIFS: '=SUMIFS(C1:C3,A1:A3,">0",B1:B3,"yes")',
};

// Only these checked contracts can drive argument-count diagnostics. Other
// generated signatures are presentation hints derived from source examples.
const argumentBounds = {
  ABS: [1, 1], AND: [1, null], AVERAGE: [1, null], CHAR: [1, 1],
  CHOOSE: [2, null], CLEAN: [1, 1], CODE: [1, 1], CONCAT: [1, null],
  CONCATENATE: [1, null], COUNT: [1, null], COUNTA: [1, null],
  COUNTBLANK: [1, 1], COUNTIF: [2, 2], COUNTIFS: [2, null],
  DATE: [3, 3], DAY: [1, 1], FALSE: [0, 0], FILTER: [2, 3],
  FIND: [2, 3], HLOOKUP: [3, 4], HOUR: [1, 1], IF: [2, 3],
  IFERROR: [2, 2], IFNA: [2, 2], INDEX: [2, 4], INDIRECT: [1, 2],
  ISBLANK: [1, 1], ISERROR: [1, 1], ISNUMBER: [1, 1], ISTEXT: [1, 1],
  LEFT: [1, 2], LEN: [1, 1], LOWER: [1, 1], MATCH: [2, 3],
  MAX: [1, null], MID: [3, 3], MIN: [1, null], MINUTE: [1, 1],
  MOD: [2, 2], MONTH: [1, 1], NOT: [1, 1], NOW: [0, 0],
  OFFSET: [3, 5], OR: [1, null], PI: [0, 0], POWER: [2, 2],
  PRODUCT: [1, null], RAND: [0, 0], RANDBETWEEN: [2, 2],
  REPLACE: [4, 4], RIGHT: [1, 2], ROUND: [2, 2], ROUNDDOWN: [2, 2],
  ROUNDUP: [2, 2], ROW: [0, 1], ROWS: [1, 1], SEARCH: [2, 3],
  SECOND: [1, 1], SHEET: [0, 1], SHEETS: [0, 1], SORT: [1, 4],
  SUBSTITUTE: [3, 4], SUM: [1, null], SUMIF: [2, 3],
  SUMIFS: [3, null], TEXT: [2, 2], TODAY: [0, 0], TRIM: [1, 1],
  TRUE: [0, 0], UNIQUE: [1, 3], UPPER: [1, 1], VALUE: [1, 1],
  VLOOKUP: [3, 4], WEEKDAY: [1, 2], XLOOKUP: [3, 6],
  XMATCH: [2, 4], YEAR: [1, 1],
};

function* sourceFiles(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(file);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.generated.ts')) yield file;
  }
}

function readExample(source, name) {
  const expression = new RegExp(`Example:\\s*(=?${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\()`, 'i').exec(
    source,
  );
  if (!expression) return null;
  const start = expression.index + expression[0].search(/=?[A-Z][A-Z0-9._]*\s*\(/i);
  let depth = 0;
  let quoted = false;
  for (let index = start; index < source.length; index++) {
    const char = source[index];
    if (char === '"') {
      if (quoted && source[index + 1] === '"') index++;
      else quoted = !quoted;
    }
    if (quoted) continue;
    if (char === '(') depth++;
    if (char === ')' && --depth === 0) return `=${source.slice(start, index + 1).replace(/^=/, '')}`;
  }
  return null;
}

function splitArguments(example) {
  const body = example.slice(example.indexOf('(') + 1, -1);
  if (!body.trim()) return [];
  const args = [];
  let start = 0;
  let nesting = 0;
  let quoted = false;
  for (let index = 0; index < body.length; index++) {
    const char = body[index];
    if (char === '"') {
      if (quoted && body[index + 1] === '"') index++;
      else quoted = !quoted;
    }
    if (quoted) continue;
    if ('({'.includes(char)) nesting++;
    else if (')}'.includes(char)) nesting--;
    else if (char === ',' && nesting === 0) {
      args.push(body.slice(start, index).trim());
      start = index + 1;
    }
  }
  args.push(body.slice(start).trim());
  return args;
}

function parameterIndex(node) {
  if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'args') {
    const index = node.argumentExpression;
    return index && ts.isNumericLiteral(index) ? Number(index.text) : null;
  }
  if (
    ts.isCallExpression(node) &&
    node.arguments.length >= 2 &&
    ts.isIdentifier(node.arguments[0]) &&
    node.arguments[0].text === 'args' &&
    ts.isNumericLiteral(node.arguments[1])
  ) {
    return Number(node.arguments[1].text);
  }
  return null;
}

function readParameterIndices(node) {
  const indices = new Set();
  function visit(current) {
    const index = parameterIndex(current);
    if (index !== null) indices.add(index);
    ts.forEachChild(current, visit);
  }
  visit(node);
  return indices;
}

function parameterNamesInNode(node) {
  const names = new Map();
  function visit(current) {
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name) && current.initializer) {
      const indices = readParameterIndices(current.initializer);
      if (indices.size === 1) {
        const index = [...indices][0];
        const name = current.name.text
          .replace(/(?:Value|Arg|Result)$/, '')
          .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
          .toLowerCase();
        if (!/^(?:arg|result|candidate|input|raw|item)$/.test(name) && !names.has(index)) {
          names.set(index, name);
        }
      }
    }
    ts.forEachChild(current, visit);
  }
  visit(node);
  return names;
}

function implementationNode(entry, name) {
  for (const statement of entry.ast.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
        const matchesName = declaration.name.text === name.replace(/\./g, '_') || declaration.name.text === name;
        const firstArgument = ts.isCallExpression(declaration.initializer)
          ? declaration.initializer.arguments[0]
          : undefined;
        if (matchesName || (firstArgument && ts.isStringLiteral(firstArgument) && firstArgument.text === name)) {
          return declaration.initializer;
        }
      }
    }
  }
  let result = null;
  function visit(node) {
    if (result) return;
    if (ts.isCaseClause(node) && ts.isStringLiteral(node.expression) && node.expression.text === name) {
      result = node;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(entry.ast);
  return result;
}

function inferredParameterNames(name, sourceEntry, sources) {
  const candidates = [
    sourceEntry,
    ...sources.filter((entry) => entry !== sourceEntry && entry.names.has(name)),
    ...sources.filter((entry) => entry !== sourceEntry && entry.file.endsWith('Runtime.ts')),
  ];
  for (const entry of candidates) {
    if (!entry) continue;
    const implementation = implementationNode(entry, name);
    if (!implementation) continue;
    const names = parameterNamesInNode(implementation);
    if (names.size) return names;
  }
  return new Map();
}

const sources = [];
for (const file of sourceFiles(functionsDir)) {
  const source = fs.readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const names = new Set();
  for (const statement of ast.statements) {
    if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      statement.exportClause.elements.forEach((element) => names.add(element.name.text));
    }
    if (
      ts.isVariableStatement(statement) &&
      statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue;
        names.add(declaration.name.text);
        if (declaration.initializer && ts.isCallExpression(declaration.initializer)) {
          const first = declaration.initializer.arguments[0];
          if (first && ts.isStringLiteral(first)) names.add(first.text);
        }
        if (declaration.initializer && ts.isObjectLiteralExpression(declaration.initializer)) {
          const property = declaration.initializer.properties.find(
            (item) => ts.isPropertyAssignment(item) && item.name.getText(ast) === 'name',
          );
          if (property && ts.isPropertyAssignment(property) && ts.isStringLiteral(property.initializer)) {
            names.add(property.initializer.text);
          }
        }
      }
    }
  }
  sources.push({ file, source, ast, names });
}

const help = new Map();
for (const [name, group] of categories) {
  const sourceEntry =
    sources.find(
      (entry) =>
        path
          .basename(entry.file, '.ts')
          .replace(/[^a-z0-9]/gi, '')
          .toUpperCase() === name.replace(/[^a-z0-9]/gi, '') && readExample(entry.source, name),
    ) ??
    sources.find((entry) => entry.names.has(name) && readExample(entry.source, name)) ??
    sources.find(
      (entry) =>
        path
          .basename(entry.file, '.ts')
          .replace(/[^a-z0-9]/gi, '')
          .toUpperCase() === name.replace(/[^a-z0-9]/gi, ''),
    ) ??
    sources.find((entry) => entry.names.has(name));
  const source = sourceEntry?.source ?? '';
  const example = exampleOverrides[name] ?? readExample(source, name) ?? `=${name}(${(namedParameters[name] ?? []).join(',')})`;
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const summaryMatch = new RegExp(
    `(?:^|\\n)\\s*\\*?\\s*${escapedName}(?: compatibility formula)?:\\s*([^\\n]+)`,
    'i',
  ).exec(source);
  const comments = source.match(/\/\*\*[\s\S]*?\*\//g) ?? [];
  const comment =
    comments.find((item) => item.includes('Example:') && item.toUpperCase().includes(name)) ?? comments[0] ?? '';
  const firstSentence = comment
    .replace(/^\/\*\*\s*/, '')
    .replace(/\s*\*\//, '')
    .replace(/\n\s*\*\s*/g, ' ')
    .replace(/^\*\s*/, '')
    .split(/Example:/i)[0]
    .trim();
  const summary = (
    summaryMatch?.[1]?.replace(/\*\/$/, '').trim() ??
    (firstSentence && !firstSentence.startsWith('Example') ? firstSentence : `Calculates ${name}.`)
  )
    .replace(/^\*\s*/, '')
    .replace(new RegExp(`^${escapedName}:\\s*`, 'i'), '');
  const samples = splitArguments(example);
  const names = namedParameters[name] ?? [];
  const inferred = inferredParameterNames(name, sourceEntry, sources);
  const inferredCount = Math.max(names.length, samples.length, ...[...inferred.keys()].map((index) => index + 1), 0);
  const boundedCount = argumentBounds[name]?.[1] === null
    ? inferredCount
    : Math.min(inferredCount, argumentBounds[name]?.[1] ?? inferredCount);
  const parameterCount = repeatingParameters.has(name) && names.length > 0 ? names.length : boundedCount;
  help.set(name, {
    version: 1,
    category: group,
    summary,
    example,
    parameters: Array.from({ length: parameterCount }, (_, index) => ({
      name: names[index] ?? inferred.get(index) ?? `argument_${index + 1}`,
      description: samples[index] ? `Example: ${samples[index]}` : 'Optional argument.',
      ...(repeatingParameters.has(name) && (names.length === 1 || index >= (name === 'COUNTIFS' || name === 'IFS' ? 0 : 1))
        ? { repeating: true }
        : {}),
      ...(argumentBounds[name] && index >= argumentBounds[name][0] && argumentBounds[name][1] !== null ? { optional: true } : {}),
    })),
    ...(argumentBounds[name] ? { minArguments: argumentBounds[name][0] } : {}),
    ...(argumentBounds[name]?.[1] === null ? {} : argumentBounds[name] ? { maxArguments: argumentBounds[name][1] } : {}),
  });
}
const lines = [
  '// Generated by scripts/generate-formula-help.mjs from built-in function examples.',
  "import type { FormulaFunctionDescriptor } from '@searsuite/sear-domain-formula-engine';",
  '',
  'export const builtInFunctionHelp: Readonly<Record<string, FormulaFunctionDescriptor>> = {',
  ...[...help]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, descriptor]) => `  ${JSON.stringify(name)}: ${JSON.stringify(descriptor)},`),
  '};',
  '',
];
const generated = lines.join('\n');
if (process.argv.includes('--check')) {
  const current = fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : '';
  if (current !== generated) {
    const currentLines = current.split('\n');
    const changed = generated.split('\n').flatMap((line, index) => {
      if (line === currentLines[index]) return [];
      const name = /^  "([^"]+)":/.exec(line)?.[1];
      return name ? [name] : [];
    });
    throw new Error(`Built-in formula help is stale${changed.length ? `: ${changed.join(', ')}` : ''}. Run pnpm run generate:formula-help.`);
  }
  process.stdout.write(`Checked help for ${help.size} built-in functions.\n`);
} else {
  fs.writeFileSync(output, generated);
  process.stdout.write(`Generated help for ${help.size} built-in functions.\n`);
}
