import { TextNode } from './TextNode';
import { NodeProperties } from './types';

/** Sticky text node used inside affixed header cells. */
export class AffixTextNode<T extends NodeProperties> extends TextNode<T> {
  /** Affix text renders in the sticky strategy together with its parent. */
  public override sticky = true;
}
