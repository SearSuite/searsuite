import { SearError } from '@searsuite/sear-foundation-error';

import { DocNodeRegistry } from './DocNodeRegistry';
import { type TextNode } from './TextNode';
import { type Schema } from './RichDocSchema';

/**
 * Base value for a rich-document node in layout and persisted document state.
 *
 * Concrete node types supply schema creation through `DocNodeRegistry`. Each
 * node carries a type, attributes, and child content; an optional stable id
 * connects the persisted structure to retained layout and collaboration
 * positions. Use the registry to create nodes from schema data.
 */
export abstract class RichDocNode {
  /** Stable structural identity for layout, retained render nodes, and collaboration mapping. */
  id: string | undefined;
  /** Domain node type identifier. */
  type: string;
  /** Node attributes such as text styles or block metadata. */
  attrs: Record<string, any>;
  /** Child rich-document nodes. */
  content: RichDocNode[] | TextNode[];

  protected constructor(type: string) {
    this.type = type;
    this.attrs = {};
    this.content = [];
  }

  /** Creates a concrete rich-document node from persisted schema. */
  static create(_schema: Schema): RichDocNode {
    // Concrete creation logic is implemented by subclasses.
    throw new SearError('RichDocNode.create is abstract; use DocNodeRegistry.create or a concrete node class.');
  }

  protected initialize(schema: Schema): void {
    this.id = schema.id;
    this.attrs = schema.attrs || {};
    this.content = (schema.content || []).map((child) => DocNodeRegistry.create(child));
  }
}
