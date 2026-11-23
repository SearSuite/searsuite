/**
 * The dependency-free JSON protocol shared by standalone and embedded rich documents.
 *
 * @packageDocumentation
 */

/** Persisted rich-document node schema shared by document runtime, commands, and OT. */
export interface NodeSchema {
  /** Stable structural identity for layout, retained render nodes, and collaboration mapping. */
  id?: string | undefined;
  /** Domain node type identifier. */
  type: string;
  /** Node attributes for styles, formatting, and feature-owned metadata. */
  attrs?: Record<string, any>;
  /** Child rich-document nodes. */
  content?: Schema[];
  /** Optional text content for leaf text nodes. */
  text?: string;
}

/** Persisted text-bearing rich-document node schema. */
export interface TextSchema extends NodeSchema {
  text: string;
}

/** Persisted rich-document schema node. */
export type Schema = NodeSchema | TextSchema;
