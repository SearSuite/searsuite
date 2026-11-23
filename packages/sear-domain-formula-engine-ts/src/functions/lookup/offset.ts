import { isFormulaError, type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { readReferenceMatrix } from './lookupHelpers';
import { lookupValueError } from './lookupHelpers';
import { resolveConditionalReference } from '../shared/conditionalReference';
import { resolveOffsetReference } from './dynamicReferenceResolution';
/** OFFSET returns a shifted reference. Example: =OFFSET(A1,1,1) returns B2. */
export const OFFSET: FormulaFunction = {
  name: 'OFFSET',
  lazy: true,
  volatile: true,
  allowReferencesOutsideHostShape: true,
  evaluate(args, context) {
    const shifted = resolveOffsetReference(args, context, resolveConditionalReference);
    if (isFormulaError(shifted)) return shifted;
    if (shifted.source.kind === 'currentSheet' &&
      shifted.startRow === shifted.endRow && shifted.startCol === shifted.endCol &&
      !context.isCellInBounds(shifted.startRow, shifted.startCol)) return 0;
    if (context.rootFormulaCall && context.currentCell &&
      (shifted.startRow !== shifted.endRow || shifted.startCol !== shifted.endCol)) {
      const { row, col } = context.currentCell;
      if (shifted.startRow !== shifted.endRow && (row < shifted.startRow || row > shifted.endRow))
        return lookupValueError();
      if (shifted.startCol !== shifted.endCol && (col < shifted.startCol || col > shifted.endCol))
        return lookupValueError();
      return readReferenceMatrix({
        ...shifted,
        startRow: shifted.startRow === shifted.endRow ? shifted.startRow : row,
        endRow: shifted.startRow === shifted.endRow ? shifted.endRow : row,
        startCol: shifted.startCol === shifted.endCol ? shifted.startCol : col,
        endCol: shifted.startCol === shifted.endCol ? shifted.endCol : col,
      }, context);
    }
    return readReferenceMatrix(shifted, context);
  },
};
