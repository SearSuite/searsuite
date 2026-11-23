import {
  FormulaErrorCode,
  FormulaFunctionArguments,
  createFormulaError,
  isFormulaError,
  type FormulaFunction,
} from '@searsuite/sear-domain-formula-engine';

interface EuroCurrency {
  readonly rate: number;
  readonly calculationPrecision: number;
}

/** Fixed euro rates and calculation precision supported by Excel's EUROCONVERT add-in function. */
const EURO_CURRENCIES: Readonly<Record<string, EuroCurrency>> = Object.freeze({
  ATS: { rate: 13.7603, calculationPrecision: 2 },
  BEF: { rate: 40.3399, calculationPrecision: 0 },
  DEM: { rate: 1.95583, calculationPrecision: 2 },
  ESP: { rate: 166.386, calculationPrecision: 0 },
  EUR: { rate: 1, calculationPrecision: 2 },
  FIM: { rate: 5.94573, calculationPrecision: 2 },
  FRF: { rate: 6.55957, calculationPrecision: 2 },
  GRD: { rate: 340.75, calculationPrecision: 0 },
  IEP: { rate: 0.787564, calculationPrecision: 2 },
  ITL: { rate: 1936.27, calculationPrecision: 0 },
  LUF: { rate: 40.3399, calculationPrecision: 0 },
  NLG: { rate: 2.20371, calculationPrecision: 2 },
  PTE: { rate: 200.482, calculationPrecision: 0 },
  SIT: { rate: 239.64, calculationPrecision: 2 },
});

/**
 * Converts between the euro and legacy euro-member currencies using fixed EU rates.
 * Example: `=EUROCONVERT(1.2,"DEM","EUR")` returns `0.61`.
 */
export const EUROCONVERT: FormulaFunction = {
  name: 'EUROCONVERT',
  descriptor: {
    version: 1,
    summary: 'Converts between the euro and legacy euro-member currencies using fixed conversion rates.',
    category: 'Add-in and Automation',
    example: '=EUROCONVERT(1.2,"DEM","EUR")',
    parameters: [
      { name: 'number', description: 'Currency amount to convert.', accepts: ['number', 'cell'] },
      { name: 'source', description: 'Three-letter source currency code.', accepts: ['text', 'cell'] },
      { name: 'target', description: 'Three-letter target currency code.', accepts: ['text', 'cell'] },
      {
        name: 'full_precision',
        description: 'Whether to skip target-currency rounding.',
        optional: true,
        accepts: ['boolean', 'number', 'text', 'cell'],
      },
      {
        name: 'triangulation_precision',
        description: 'Significant digits for the intermediate euro value.',
        optional: true,
        accepts: ['number', 'cell'],
      },
    ],
    returnKind: 'scalar',
  },
  evaluate(args, context) {
    if (args.length < 3 || args.length > 5) return createFormulaError(FormulaErrorCode.Value);
    const reader = new FormulaFunctionArguments(args, context);
    const amount = reader.number(0);
    const sourceCode = reader.text(1);
    const targetCode = reader.text(2);
    const fullPrecision = reader.boolean(3, false);
    const triangulationPrecision = reader.isMissing(4) ? undefined : reader.number(4);
    if (isFormulaError(amount)) return amount;
    if (isFormulaError(sourceCode)) return sourceCode;
    if (isFormulaError(targetCode)) return targetCode;
    if (isFormulaError(fullPrecision)) return fullPrecision;
    if (isFormulaError(triangulationPrecision)) return triangulationPrecision;
    if (
      triangulationPrecision !== undefined &&
      (!Number.isInteger(triangulationPrecision) || triangulationPrecision < 3)
    ) {
      return createFormulaError(FormulaErrorCode.Value);
    }

    const source = EURO_CURRENCIES[sourceCode.toUpperCase()];
    const target = EURO_CURRENCIES[targetCode.toUpperCase()];
    if (!source || !target) return createFormulaError(FormulaErrorCode.Value);
    if (source === target) return amount;

    let euroValue = amount / source.rate;
    if (source.rate !== 1 && triangulationPrecision !== undefined) {
      euroValue = roundToSignificantDigits(euroValue, triangulationPrecision);
    }
    const rawConverted = euroValue * target.rate;
    if (!Number.isFinite(rawConverted)) return createFormulaError(FormulaErrorCode.Number);
    const converted = normalizeFloatingPoint(rawConverted);
    const result = fullPrecision ? converted : roundToDecimalPlaces(converted, target.calculationPrecision);
    return Number.isFinite(result) ? result : createFormulaError(FormulaErrorCode.Number);
  },
};

function roundToSignificantDigits(value: number, digits: number): number {
  if (value === 0) return 0;
  return Number(value.toPrecision(Math.min(digits, 15)));
}

function roundToDecimalPlaces(value: number, decimalPlaces: number): number {
  const factor = 10 ** decimalPlaces;
  return normalizeFloatingPoint(Math.round((value + Math.sign(value) * Number.EPSILON) * factor) / factor);
}

function normalizeFloatingPoint(value: number): number {
  return Number(value.toPrecision(15));
}
