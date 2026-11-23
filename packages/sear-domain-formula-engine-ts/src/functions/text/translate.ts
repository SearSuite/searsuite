import {
  FormulaErrorCode,
  FormulaLanguageServiceDefinition,
  FormulaServiceCacheStatus,
  createFormulaError,
  type FormulaFunction,
} from '@searsuite/sear-domain-formula-engine';
import { isFormulaErrorValue, optionalTextArg, textArg } from './textFormat/FormulaTextValues';

/** Reads a previously loaded translation from the host cache. Example: TRANSLATE("hello", "en", "es") reads the cached result. */
export const TRANSLATE: FormulaFunction = {
  name: 'TRANSLATE',
  descriptor: {
    version: 1,
    summary: 'Translates text through a host-provided cached service.',
    category: 'Text',
    example: '=TRANSLATE("hello","en","zh-Hans")',
    parameters: [
      { name: 'text', description: 'Text to translate.', accepts: ['text'] },
      { name: 'sourceLanguage', description: 'Optional source language.', optional: true, accepts: ['text'] },
      { name: 'targetLanguage', description: 'Target language.', optional: true, accepts: ['text'] },
    ],
    returnKind: 'scalar',
    externalServices: [FormulaLanguageServiceDefinition.id],
  },
  evaluate(args, context) {
    const text = textArg(args, 0, context);
    if (isFormulaErrorValue(text)) return text;
    const source = optionalTextArg(args, 1, context, '');
    if (isFormulaErrorValue(source)) return source;
    const service = context.externalServices?.get(FormulaLanguageServiceDefinition) ?? context.languageService;
    const target = optionalTextArg(args, 2, context, service?.defaultTargetLanguage ?? '');
    if (isFormulaErrorValue(target)) return target;
    if (!target) return createFormulaError(FormulaErrorCode.Value);
    const result = service?.translate(text, source || undefined, target);
    return result?.status === FormulaServiceCacheStatus.Ready
      ? result.value
      : createFormulaError(FormulaErrorCode.NotAvailable);
  },
};
