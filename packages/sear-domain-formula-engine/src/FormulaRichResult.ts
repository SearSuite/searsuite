import { type FormulaHyperlinkResult } from './FormulaHyperlinkResult';
import { type FormulaImageResult } from './FormulaImageResult';

/** Host-neutral result projected by a formula cell renderer. */
export type FormulaRichResult = FormulaHyperlinkResult | FormulaImageResult;
