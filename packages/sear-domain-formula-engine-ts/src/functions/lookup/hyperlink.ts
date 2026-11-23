import { FormulaHyperlinkServiceDefinition, isFormulaError, type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { scalar, lookupValueError, toText } from './lookupHelpers';
/** HYPERLINK returns display text for a host-rendered link. Example: =HYPERLINK("https://example.com","Open"). */
export const HYPERLINK: FormulaFunction = {
  name: 'HYPERLINK',
  evaluate(args, context) {
    if (args.length < 1 || args.length > 2) return lookupValueError();
    const target = scalar(args[0], context);
    if (isFormulaError(target)) return target;
    const service = context.externalServices?.get(FormulaHyperlinkServiceDefinition);
    const targetText = toText(target);
    const normalized = service ? service.normalizeTarget(targetText) : targetText;
    const label = args[1] && args[1].kind !== 'missing' ? scalar(args[1], context) : normalized ?? targetText;
    context.publishRichResult?.(!isFormulaError(label) && normalized
      ? { kind: 'hyperlink', target: normalized, label: toText(label) }
      : undefined);
    return label;
  },
};
