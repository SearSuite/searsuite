import { DocNodeRegistry } from './DocNodeRegistry';
import { type RichDocNode } from './RichDocNode';
import { type TextNode } from './TextNode';

/** Returns true when a rich-document node is a text leaf. */
export function isTextNode(node: RichDocNode | TextNode): node is TextNode {
  return DocNodeRegistry.isTextType(node.type) && 'text' in node;
}
