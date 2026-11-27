import { PluginKey } from '@searsuite/sear-assembly-plugin';

/** Shared identity for formula plugin state and configuration. */
export const formulaHighlightViewKey = new PluginKey('FormulaHighlightView');

/** Named palette entries stay compatible with the reactive configuration engine. */
export interface FormulaReferenceColorPalette {
  blue: string;
  teal: string;
  violet: string;
  orange: string;
  azure: string;
  green: string;
  rose: string;
  slate: string;
  indigo: string;
  emerald: string;
  brown: string;
  cyan: string;
}

/** Formula-reference overlay settings used while editing a formula. */
export interface FormulaReferenceHighlightConfig {
  /** Opacity of referenced-cell overlays when the cursor is elsewhere. */
  referenceFillOpacity: number;
  /** Opacity of the referenced-cell overlay under the formula cursor. */
  activeReferenceFillOpacity: number;
  /** Stable, high-contrast colors assigned to formula references. */
  referenceColors: FormulaReferenceColorPalette;
}

export const formulaReferenceHighlightConfig: FormulaReferenceHighlightConfig = {
  referenceFillOpacity: 0.05,
  activeReferenceFillOpacity: 0.1,
  // Avoid low-contrast yellow and visually dominant bright red.
  referenceColors: {
    blue: '#2563EB',
    teal: '#0F766E',
    violet: '#7C3AED',
    orange: '#C2410C',
    azure: '#0369A1',
    green: '#4D7C0F',
    rose: '#BE185D',
    slate: '#475569',
    indigo: '#4338CA',
    emerald: '#047857',
    brown: '#92400E',
    cyan: '#0E7490',
  },
};

/** Assigns a formula reference its Excel-style, position-based palette color. */
export function getFormulaReferenceColor(referenceIndex: number, colors?: FormulaReferenceColorPalette): string {
  const palette = Object.values(colors ?? formulaReferenceHighlightConfig.referenceColors);
  const fallbackPalette = Object.values(formulaReferenceHighlightConfig.referenceColors);
  const activePalette = palette.length > 0 ? palette : fallbackPalette;
  return activePalette[referenceIndex % activePalette.length];
}
