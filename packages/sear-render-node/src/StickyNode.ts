import { BoxNode } from './BoxNode';
import { NodeProperties } from './types';

/** Box node specialization reserved for sticky-layer rendering. */
export class StickyNode<T extends NodeProperties> extends BoxNode<T> {}
