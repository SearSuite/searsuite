import { Node } from './Node';
import { type NodeProperties } from './types';

/**
 * Abstract class for layout nodes.
 * Extend this for nodes that manage layout.
 */
export abstract class LayoutNode<T extends NodeProperties> extends Node<T> {}
