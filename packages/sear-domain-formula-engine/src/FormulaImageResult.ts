import { type FormulaImageResource } from './FormulaImageResource';

/** Host-neutral image result projected by a formula renderer. */
export interface FormulaImageResult {
  readonly kind: 'image';
  readonly resource: FormulaImageResource;
  readonly altText?: string;
  readonly sizing?: number;
  readonly height?: number;
  readonly width?: number;
}
