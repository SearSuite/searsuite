export function parseNumberValue(source: string, decimalSeparator = '.', groupSeparator = ','): number | null {
  decimalSeparator = decimalSeparator[0] ?? '';
  groupSeparator = groupSeparator[0] ?? '';
  if (!decimalSeparator || decimalSeparator === groupSeparator) return null;
  let text = source.trim().replace(/\s+/g, '');
  if (!text) return null;

  let percentCount = 0;
  while (text.endsWith('%')) {
    percentCount++;
    text = text.slice(0, -1);
  }

  if (!text) return null;
  const decimalIndex = text.indexOf(decimalSeparator);
  if (groupSeparator && decimalIndex >= 0 && text.indexOf(groupSeparator, decimalIndex) >= 0) return null;
  if (groupSeparator) text = text.split(groupSeparator).join('');
  if (!text && percentCount === 0) return 0;
  if (decimalSeparator !== '.') {
    const decimalParts = text.split(decimalSeparator);
    if (decimalParts.length > 2) return null;
    text = decimalParts.join('.');
  }

  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) return null;
  let result = parseSpreadsheetNumericLiteral(text);
  if (!Number.isFinite(result)) return null;
  while (percentCount > 0) {
    result /= 100;
    percentCount--;
  }
  return result;
}

/** Applies the spreadsheet's 15-significant-digit input limit before binary conversion. */
export function parseSpreadsheetNumericLiteral(source: string): number {
  const exponentIndex = source.search(/[eE]/);
  const mantissa = exponentIndex < 0 ? source : source.slice(0, exponentIndex);
  const exponent = exponentIndex < 0 ? '' : source.slice(exponentIndex);
  let significantDigits = 0;
  let started = false;
  const limitedMantissa = mantissa.replace(/\d/g, (digit) => {
    if (digit !== '0') started = true;
    if (!started) return digit;
    significantDigits++;
    return significantDigits > 15 ? '0' : digit;
  });
  return Number(limitedMantissa + exponent);
}
