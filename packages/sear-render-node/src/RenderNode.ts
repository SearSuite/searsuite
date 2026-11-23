import { Node } from './Node';
import { type NodeProperties } from './types';

/**
 * Abstract class for render nodes.
 * Extend this for nodes that manage rendering.
 */
export abstract class RenderNode<T extends NodeProperties> extends Node<T> {}
