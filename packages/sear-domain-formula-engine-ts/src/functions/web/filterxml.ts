import {
  FormulaErrorCode,
  FormulaFunctionArguments,
  FormulaWebLimits,
  createFormulaError,
  isFormulaError,
  type FormulaFunction,
} from '@searsuite/sear-domain-formula-engine';

/** Extracts XPath matches from XML as a spilling column. Example: FILTERXML("<r><v>A</v></r>","//v") returns A. */
export const FILTERXML: FormulaFunction = {
  name: 'FILTERXML',
  descriptor: {
    version: 1,
    summary: 'Extracts XML values selected by an XPath expression.',
    category: 'Web',
    example: '=FILTERXML("<r><v>A</v></r>","//v")',
    parameters: [
      { name: 'xml', description: 'Valid XML text.', accepts: ['text', 'cell'] },
      { name: 'xpath', description: 'XPath expression selecting values.', accepts: ['text', 'cell'] },
    ],
    returnKind: 'array',
  },
  evaluate(args, context) {
    if (args.length !== 2) return createFormulaError(FormulaErrorCode.Value);
    const reader = new FormulaFunctionArguments(args, context);
    const xml = reader.text(0);
    if (isFormulaError(xml)) return xml;
    const xpath = reader.text(1);
    if (isFormulaError(xpath)) return xpath;
    if (!context.xmlXPath || xml.length > FormulaWebLimits.textLength || !xpath.trim()) {
      return createFormulaError(FormulaErrorCode.Value);
    }
    try {
      const { values } = context.xmlXPath.evaluate(xml, xpath);
      if (values.length === 0) return createFormulaError(FormulaErrorCode.Value);
      return values.map((value) => [value]);
    } catch {
      return createFormulaError(FormulaErrorCode.Value);
    }
  },
};
