import { approximateFraction } from './approximateFraction';
import { applyPlaceholderWidth } from './applyPlaceholderWidth';

export function formatFractionPattern(value: number, numericPattern: string): string {
  const slash = numericPattern.indexOf('/');
  if (slash < 0) return String(value);
  const numeratorPattern = numericPattern.slice(0, slash);
  const denominatorPattern = numericPattern.slice(slash + 1);
  const wholePattern = numeratorPattern.replace(/[0#?]+\s*$/, '');
  const numeratorPlaceholders = numeratorPattern.slice(wholePattern.length);
  const denominatorPlaceholders = denominatorPattern.match(/[0#?]+/)?.[0] ?? '';
  const fixedDenominator = /^[1-9]\d*$/.test(denominatorPattern.trim()) ? Number(denominatorPattern.trim()) : null;
  const maxDenominator = fixedDenominator ?? Math.max(1, Math.pow(10, denominatorPlaceholders.length) - 1);
  let whole = wholePattern.trim() ? Math.floor(value) : 0;
  const fractionValue = wholePattern.trim() ? value - whole : value;
  const fraction =
    fixedDenominator === null
      ? approximateFraction(fractionValue, maxDenominator)
      : { numerator: Math.round(fractionValue * fixedDenominator), denominator: fixedDenominator };
  if (wholePattern.trim() && fraction.numerator === fraction.denominator) {
    whole += 1;
    fraction.numerator = 0;
  }
  if (fraction.numerator === 0) {
    const wholeText = wholePattern.trim() ? String(whole) : '0';
    if (!numericPattern.includes('?')) return wholeText;
    const denominatorWidth = fixedDenominator === null ? denominatorPlaceholders.length : String(fixedDenominator).length;
    return `${wholeText}${' '.repeat((wholePattern.trim() ? 1 : 0) + numeratorPlaceholders.length + 1 + denominatorWidth)}`;
  }
  const numerator = applyPlaceholderWidth(String(fraction.numerator), numeratorPlaceholders);
  const denominator =
    fixedDenominator === null
      ? applyPlaceholderWidth(String(fraction.denominator), denominatorPlaceholders)
      : String(fixedDenominator);
  const wholeText = wholePattern.trim() ? `${whole === 0 && !wholePattern.includes('0') ? '' : whole} ` : '';
  return `${wholeText}${numerator}/${denominator}`;
}
