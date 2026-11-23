import {
  FormulaErrorCode,
  FormulaLanguageServiceDefinition,
  FormulaServiceCacheStatus,
  createFormulaError,
  type FormulaFunction,
} from '@searsuite/sear-domain-formula-engine';
import { isFormulaErrorValue, textArg } from './textFormat/FormulaTextValues';

/** Reads language detection from the host cache. Example: DETECTLANGUAGE("hello") commonly returns "en". */
export const DETECTLANGUAGE: FormulaFunction = {
  name: 'DETECTLANGUAGE',
  descriptor: {
    version: 1,
    summary: 'Detects the language of text through a host-provided cached service.',
    category: 'Text',
    example: '=DETECTLANGUAGE("hello")',
    parameters: [{ name: 'text', description: 'Text whose language should be detected.', accepts: ['text'] }],
    returnKind: 'scalar',
    externalServices: [FormulaLanguageServiceDefinition.id],
  },
  evaluate(args, context) {
    const text = textArg(args, 0, context);
    if (isFormulaErrorValue(text)) return text;
    const service = context.externalServices?.get(FormulaLanguageServiceDefinition) ?? context.languageService;
    const result = service?.detectLanguage(text);
    return result?.status === FormulaServiceCacheStatus.Ready
      ? result.value
      : createFormulaError(FormulaErrorCode.NotAvailable);
  },
};
