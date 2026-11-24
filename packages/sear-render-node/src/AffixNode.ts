import { FixBoxNode } from './FixBoxNode';
import { NodeProperties } from './types';

/** Sticky box node used for row/column headers and other affixed sheet regions. */
export class AffixNode<T extends NodeProperties> extends FixBoxNode<T> {
  /** Affix nodes render in the sticky strategy instead of the scrolled content layer. */
  public override sticky = true;
}

export { AffixTextNode } from './AffixTextNode';
