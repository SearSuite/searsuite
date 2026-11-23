import {
  FormulaErrorCode,
  FormulaFunctionArguments,
  FormulaWebLimits,
  createFormulaError,
  isFormulaError,
  type FormulaFunction,
} from '@searsuite/sear-domain-formula-engine';
import { formulaNumberText } from '../shared/formulaNumberText';
import { isBlankScalarInput } from '../shared/blankScalarInput';

/** Encodes text as an RFC 3986 UTF-8 URL component. Example: ENCODEURL("a b") returns "a%20b". */
export const ENCODEURL: FormulaFunction = {
  name: 'ENCODEURL',
  descriptor: {
    version: 1,
    summary: 'Encodes text as a UTF-8 URL component.',
    category: 'Web',
    example: '=ENCODEURL("a b")',
    parameters: [{ name: 'text', description: 'Text to URL-encode.', accepts: ['text', 'cell'] }],
    returnKind: 'scalar',
  },
  evaluate(args, context) {
    if (args.length !== 1) return createFormulaError(FormulaErrorCode.Value);
    if (isBlankScalarInput(args[0]!, context)) return '';
    const reader = new FormulaFunctionArguments(args, context);
    const value = reader.value(0);
    if (isFormulaError(value)) return value;
    const text = typeof value === 'number' ? formulaNumberText(value) : reader.text(0);
    if (isFormulaError(text)) return text;
    if (text.length > FormulaWebLimits.textLength) return createFormulaError(FormulaErrorCode.Value);
    try {
      const encoded = encodeURIComponent(text).replace(
        /[!'()*]/g,
        (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
      );
      return encoded.length <= FormulaWebLimits.textLength ? encoded : createFormulaError(FormulaErrorCode.Value);
    } catch {
      return createFormulaError(FormulaErrorCode.Value);
    }
  },
};
