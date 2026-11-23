import { isFormulaError, type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { readReferenceMatrix } from './lookupHelpers';
import { resolveIndirectReference } from './dynamicReferenceResolution';
/** INDIRECT resolves text to a reference. Example: =INDIRECT("A1") returns A1. */
export const INDIRECT: FormulaFunction = {
  name: 'INDIRECT',
  volatile: true,
  evaluate(args, context) {
    const reference = resolveIndirectReference(args, context);
    if (isFormulaError(reference)) return reference;
    return readReferenceMatrix(reference, context);
  },
};
