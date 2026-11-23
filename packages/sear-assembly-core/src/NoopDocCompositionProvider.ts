import { type DocCompositionLayout, type DocCompositionProvider } from './DocCompositionManager';

/** Null provider used when no composition plugin is installed. */
export class NoopDocCompositionProvider implements DocCompositionProvider {
  /** Measures no composing text. */
  public measure(_font: string): DocCompositionLayout {
    return { active: false, text: '', textWidth: 0, caretPixelOffset: 0 };
  }
}
