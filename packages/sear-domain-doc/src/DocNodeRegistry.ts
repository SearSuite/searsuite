import { Injectable } from '@searsuite/sear-foundation-di';
import { SearError } from '@searsuite/sear-foundation-error';

import { type RichDocNode } from './RichDocNode';
import { type Schema } from './RichDocSchema';

/** Node roles used by generic rich-document editing and layout helpers. */
export const DocNodeRole = {
  Text: 'text',
  Block: 'block',
} as const;

/** Type contract for DocNodeRole. */
export type DocNodeRole = (typeof DocNodeRole)[keyof typeof DocNodeRole];

/** Registration contract for one persisted rich-document node type. */
export interface DocNodeDefinition {
  /** Persisted schema type owned by a document feature plugin. */
  readonly type: string;
  /** Factory that creates the runtime node instance for this persisted schema. */
  readonly create: (schema: Schema) => RichDocNode;
  /** Generic role consumed by core editing/layout helpers. */
  readonly role?: DocNodeRole;
  /** Whether this block is the default container for plain text editing. */
  readonly defaultBlock?: boolean;
  /** Whether this text-like node is the default leaf for plain text editing. */
  readonly defaultText?: boolean;
}

/** Registry that maps persisted rich-document node types to constructors. */
@Injectable()
export class DocNodeRegistry {
  /** DI token for resolving the document node registry. */
  public static readonly symbol = Symbol.for('DocNodeRegistry');
  private static creators: Record<string, (schema: Schema) => RichDocNode> = {
    paragraph: createDefaultDocNode,
    text: createDefaultDocNode,
  };
  private static roles = new Map<string, DocNodeRole>([
    ['paragraph', DocNodeRole.Block],
    ['text', DocNodeRole.Text],
  ]);
  private static defaultBlockType: string | null = 'paragraph';
  private static defaultTextType: string | null = 'text';

  /** Registers a node factory for a persisted node type. */
  static register(type: string, creator: (schema: Schema) => RichDocNode): void;
  /** Registers a complete node definition for a persisted node type. */
  static register(definition: DocNodeDefinition): void;
  static register(
    typeOrDefinition: string | DocNodeDefinition,
    creator?: (schema: Schema) => RichDocNode,
  ): void {
    if (typeof typeOrDefinition === 'string' && !creator) {
      throw new SearError(`Missing creator for document node type: ${typeOrDefinition}`);
    }
    const definition: DocNodeDefinition =
      typeof typeOrDefinition === 'string'
        ? createLegacyDefinition(typeOrDefinition, creator)
        : typeOrDefinition;
    this.creators[definition.type] = definition.create;
    if (definition.role) this.roles.set(definition.type, definition.role);
    if (definition.defaultBlock) this.defaultBlockType = definition.type;
    if (definition.defaultText) this.defaultTextType = definition.type;
  }

  /** Creates a rich-document node from persisted schema. */
  static create(schema: Schema): RichDocNode {
    const creator = this.creators[schema.type];
    if (!creator) throw new SearError(`Unknown node type: ${schema.type}`);
    return creator(schema);
  }

  /** Instance method: delegates to the static registry; used by DI-injected consumers. */
  create(schema: Schema): RichDocNode {
    return DocNodeRegistry.create(schema);
  }

  /** Registers a node factory on this registry instance. */
  register(definition: DocNodeDefinition): void {
    DocNodeRegistry.register(definition);
  }

  /** Returns whether the persisted type has been registered as text-like. */
  static isTextType(type: string): boolean {
    return this.roles.get(type) === DocNodeRole.Text;
  }

  /** Returns whether the persisted type has been registered as a block container. */
  static isBlockType(type: string): boolean {
    return this.roles.get(type) === DocNodeRole.Block;
  }

  /** Returns the registered default block type for generic text editing. */
  static requireDefaultBlockType(): string {
    if (!this.defaultBlockType) throw new SearError('No default document block node type has been registered.');
    return this.defaultBlockType;
  }

  /** Returns the registered default text type for generic text editing. */
  static requireDefaultTextType(): string {
    if (!this.defaultTextType) throw new SearError('No default document text node type has been registered.');
    return this.defaultTextType;
  }

  /** Instance method: returns whether the persisted type has been registered as text-like. */
  isTextType(type: string): boolean {
    return DocNodeRegistry.isTextType(type);
  }

  /** Instance method: returns whether the persisted type has been registered as a block container. */
  isBlockType(type: string): boolean {
    return DocNodeRegistry.isBlockType(type);
  }

  /** Instance method: returns the registered default block type for generic text editing. */
  requireDefaultBlockType(): string {
    return DocNodeRegistry.requireDefaultBlockType();
  }

  /** Instance method: returns the registered default text type for generic text editing. */
  requireDefaultTextType(): string {
    return DocNodeRegistry.requireDefaultTextType();
  }
}

function createLegacyDefinition(
  type: string,
  creator: ((schema: Schema) => RichDocNode) | undefined,
): DocNodeDefinition {
  if (!creator) throw new SearError(`Missing creator for document node type: ${type}`);
  return { type, create: creator };
}

function createDefaultDocNode(schema: Schema): RichDocNode {
  const node = {
    id: schema.id,
    type: schema.type,
    attrs: schema.attrs || {},
    content: (schema.content || []).map((child) => DocNodeRegistry.create(child)),
  } as RichDocNode & { text?: string };
  if ('text' in schema) node.text = schema.text;
  return node;
}
