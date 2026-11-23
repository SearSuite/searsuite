import { type FormulaRangeCell, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { isFormulaError, isFormulaText, toNumberOrError } from '@searsuite/sear-foundation-utils';
import { textOf } from './FormulaTruthiness';

interface ParsedCriteria {
  operator: '=' | '<>' | '<' | '>' | '<=' | '>=';
  operand: string;
}

export function matchesCriteria(
  value: FormulaValue,
  criteria: FormulaValue,
  source?: FormulaRangeCell['source'],
): boolean {
  if (isFormulaError(criteria)) return isFormulaError(value) && value.code === criteria.code;
  if (isFormulaError(value)) {
    const rawCriteria = isFormulaText(criteria) ? criteria.value : String(criteria);
    const { operator, operand } = parseCriteria(rawCriteria);
    return operator === '=' && operand.toUpperCase() === value.code;
  }
  if (Array.isArray(criteria) || Array.isArray(value)) return false;
  const raw = isFormulaText(criteria) ? criteria.value : String(criteria);
  const { operator, operand } = parseCriteria(raw);
  if (operand === '' && source !== undefined && (operator === '=' || operator === '<>')) {
    const equal = source === 'empty' || textOf(value) === '';
    return operator === '=' ? equal : !equal;
  }
  if (/^(true|false)$/i.test(operand) && (operator === '=' || operator === '<>')) {
    const equal = typeof value === 'boolean' && value === /^true$/i.test(operand);
    return operator === '=' ? equal : !equal;
  }
  if (typeof value === 'number' && isLeadingZeroDecimalNumberText(operand)) {
    return matchesNumericCriteria(value, Number(operand), operator);
  }
  const numericOperand = isDecimalNumberText(operand) ? Number(operand) : NaN;
  const valueText = textOf(value);
  const valueNumber = (typeof value === 'string' || isFormulaText(value)) && !isDecimalNumberText(valueText)
    ? NaN
    : toNumberOrError(value);
  if (Number.isFinite(numericOperand) && !isFormulaError(valueNumber)) {
    return matchesNumericCriteria(valueNumber, numericOperand, operator);
  }
  if (
    (operator === '<' || operator === '>' || operator === '<=' || operator === '>=') &&
    (typeof value === 'string' || isFormulaText(value)) &&
    !Number.isFinite(numericOperand) &&
    !/[*?~]/.test(operand)
  ) {
    const candidate = valueText.toLowerCase();
    const target = operand.toLowerCase();
    if (operator === '<') return candidate < target;
    if (operator === '>') return candidate > target;
    if (operator === '<=') return candidate <= target;
    return candidate >= target;
  }
  if (/[*?~]/.test(operand) && typeof value !== 'string' && !isFormulaText(value)) return operator === '<>';
  const equal = /[*?~]/.test(operand)
    ? wildcardMatch(valueText, operand)
    : valueText.toLowerCase() === operand.toLowerCase();
  return operator === '=' ? equal : operator === '<>' ? !equal : false;
}

function parseCriteria(criteria: string): ParsedCriteria {
  const match = /^(<=|>=|<>|=|<|>)(.*)$/.exec(criteria);
  return match
    ? { operator: match[1] as ParsedCriteria['operator'], operand: match[2] }
    : { operator: '=', operand: criteria };
}

function isDecimalNumberText(value: string): boolean {
  return /^[+-]?(?:(?:0|[1-9]\d*)(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value);
}

function isLeadingZeroDecimalNumberText(value: string): boolean {
  return /^[+-]?0\d+(?:\.\d*)?(?:[eE][+-]?\d+)?$/.test(value);
}

function matchesNumericCriteria(value: number, operand: number, operator: ParsedCriteria['operator']): boolean {
  if (operator === '=') return value === operand;
  if (operator === '<>') return value !== operand;
  if (operator === '<') return value < operand;
  if (operator === '>') return value > operand;
  if (operator === '<=') return value <= operand;
  return value >= operand;
}

function wildcardMatch(value: string, pattern: string): boolean {
  let expression = '';
  for (let index = 0; index < pattern.length; index++) {
    const ch = pattern[index];
    if (ch === '~' && index + 1 < pattern.length && /[*?~]/.test(pattern[index + 1]!))
      expression += pattern[++index].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    else if (ch === '*') expression += '.*';
    else if (ch === '?') expression += '.';
    else expression += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${expression}$`, 'is').test(value);
}
