import { Injectable } from '@searsuite/sear-foundation-di';
import { SearError } from '@searsuite/sear-foundation-error';
import { ParagraphNode } from './ParagraphNode';
import { TableCellNode } from './TableCellNode';
import { TableNode } from './TableNode';
import { TableRowNode } from './TableRowNode';
import { TextNode } from './TextNode';

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

/** Editor-local node definitions; static helpers only materialize built-in schemas. */
@Injectable()
export class DocNodeRegistry {
  public static readonly symbol = Symbol.for('DocNodeRegistry');
  readonly #creators = new Map<string, (schema: Schema) => RichDocNode>([
    ['paragraph', (schema) => new ParagraphNode(schema)],
    ['text', (schema) => new TextNode(schema)],
    ['table', (schema) => new TableNode(schema)],
    ['tableRow', (schema) => new TableRowNode(schema)],
    ['tableCell', (schema) => new TableCellNode(schema)],
  ]);
  readonly #roles = new Map<string, DocNodeRole>([
    ['paragraph', DocNodeRole.Block],
    ['text', DocNodeRole.Text],
    ['table', DocNodeRole.Block],
  ]);
  #assertWrite: (() => void) | undefined;
  #defaultBlockType = 'paragraph';
  #defaultTextType = 'text';

  /** Reserves runtime registration changes for the owning editor's commands. */
  public enforceWriteBoundary(assertWrite: () => void): void {
    if (this.#assertWrite) throw new SearError('Doc node registry boundary is already installed.');
    this.#assertWrite = assertWrite;
    Object.freeze(this);
  }

  /** Installs a definition for this editor without changing other registries. */
  public register(definition: DocNodeDefinition): void {
    this.#assertWrite?.();
    this.#creators.set(definition.type, definition.create);
    if (definition.role) this.#roles.set(definition.type, definition.role);
    else this.#roles.delete(definition.type);
    if (definition.defaultBlock) this.#defaultBlockType = definition.type;
    if (definition.defaultText) this.#defaultTextType = definition.type;
  }

  /** Materializes the complete tree through this registry, including nested custom nodes. */
  public create(schema: Schema): RichDocNode {
    const creator = this.#creators.get(schema.type);
    if (!creator) throw new SearError(`Unknown node type: ${schema.type}`);
    const node = creator({ ...schema, content: [] });
    node.content = (schema.content ?? []).map((child) => this.create(child));
    return node;
  }
  public isTextType(type: string): boolean {
    return this.#roles.get(type) === DocNodeRole.Text;
  }
  public isBlockType(type: string): boolean {
    return this.#roles.get(type) === DocNodeRole.Block;
  }
  public requireDefaultBlockType(): string {
    return this.#defaultBlockType;
  }
  public requireDefaultTextType(): string {
    return this.#defaultTextType;
  }

  /** Creates built-in values without reading or mutating any editor's registrations. */
  public static create(schema: Schema): RichDocNode {
    if (!['paragraph', 'text', 'table', 'tableRow', 'tableCell'].includes(schema.type))
      throw new SearError(`Unknown node type: ${schema.type}`);
    const node = {
      id: schema.id,
      type: schema.type,
      attrs: schema.attrs ?? {},
      content: (schema.content ?? []).map((child) => DocNodeRegistry.create(child)),
      ...('text' in schema ? { text: schema.text } : {}),
    };
    return node as RichDocNode;
  }
  public static isTextType(type: string): boolean {
    return type === 'text';
  }
  public static isBlockType(type: string): boolean {
    return type === 'paragraph' || type === 'table';
  }
  public static requireDefaultBlockType(): string {
    return 'paragraph';
  }
  public static requireDefaultTextType(): string {
    return 'text';
  }
}
