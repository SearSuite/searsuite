import { SearError } from '@searsuite/sear-foundation-error';
import { Injectable } from '@searsuite/sear-foundation-di';

import { type TextNode } from './BuiltinDocNodes';

/** Domain-neutral inline style bag carried by measured rich-text chars. */
export type RichTextInlineStyle = Readonly<Record<string, unknown>>;

/** Input supplied when an inline-style contribution reads document attrs. */
export interface RichTextInlineStyleReadInput {
  readonly node: TextNode;
  readonly attrs: Record<string, unknown>;
}

/** Input supplied when an inline-style contribution mutates persisted text-node attrs. */
export interface RichTextInlineStyleMutationInput {
  readonly attrs: Record<string, unknown>;
  readonly value: unknown | null;
}

/** Plugin-owned mutation for one persisted inline text-style concern. */
export interface RichTextInlineStyleMutation {
  /** Stable style key used by commands to resolve this mutation. */
  readonly styleKey: string;
  /** Applies the normalized style value to a text node's persisted attrs. */
  apply(input: RichTextInlineStyleMutationInput): Record<string, unknown>;
}

/** Plugin-owned contribution for one inline text style concern. */
export interface RichTextInlineStyleContribution {
  /** Stable contribution key used for duplicate detection and unregister. */
  readonly key: string;
  /** Reads this contribution's style slice from a text node. */
  read?(input: RichTextInlineStyleReadInput): RichTextInlineStyle | undefined;
  /** Persisted inline text-style mutations owned by this contribution. */
  mutations?: readonly RichTextInlineStyleMutation[];
}

/** Ordered registry for plugin-owned rich-text inline style readers and mutations. */
@Injectable()
export class RichTextInlineStyleRegistry {
  /** DI token for resolving the inline style registry. */
  public static readonly symbol = Symbol.for('RichTextInlineStyleRegistry');

  readonly #contributions = new Map<string, RichTextInlineStyleContribution>();
  #assertWrite: (() => void) | null = null;

  public enforceWriteBoundary(assertWrite: () => void): void {
    if (this.#assertWrite) throw new SearError('Rich-text inline style write boundary is already installed.');
    this.#assertWrite = assertWrite;
    Object.freeze(this);
  }

  /** Registers one plugin-owned inline style contribution. */
  public register(contribution: RichTextInlineStyleContribution): () => void {
    this.#assertWrite?.();
    const key = contribution.key;
    if (this.#contributions.has(key)) {
      throw new SearError(`Rich-text inline style contribution "${contribution.key}" already exists.`);
    }
    const mutations = contribution.mutations?.map((mutation) => Object.freeze({
      styleKey: mutation.styleKey,
      apply: mutation.apply,
    }));
    for (const mutation of mutations ?? []) {
      const existing = this.findMutation(mutation.styleKey);
      if (existing) {
        throw new SearError(`Rich-text inline style mutation "${mutation.styleKey}" already exists.`);
      }
    }
    const registration = Object.freeze({
      key,
      ...(contribution.read ? { read: contribution.read } : {}),
      ...(mutations ? { mutations: Object.freeze(mutations) } : {}),
    });
    this.#contributions.set(key, registration);
    const registry = this;
    return function unregisterRichTextInlineStyleContribution(): void {
      registry.#assertWrite?.();
      if (registry.#contributions.get(key) === registration) registry.#contributions.delete(key);
    };
  }

  /** Reads all registered style slices from a text node. */
  public readTextNodeStyle(node: TextNode): RichTextInlineStyle | undefined {
    const attrs = node.attrs ?? {};
    const style: Record<string, unknown> = {};
    for (const contribution of this.#contributions.values()) {
      const partial = contribution.read?.({ node, attrs });
      if (!partial) continue;
      Object.assign(style, partial);
    }
    return Object.keys(style).length > 0 ? style : void 0;
  }

  /** Compares two style bags using stable key/value serialization. */
  public sameStyle(styleA: RichTextInlineStyle | undefined, styleB: RichTextInlineStyle | undefined): boolean {
    return stringifyInlineStyle(styleA) === stringifyInlineStyle(styleB);
  }

  /** Resolves a plugin-owned persisted inline style mutation by style key. */
  public requireMutation(styleKey: string): RichTextInlineStyleMutation {
    const mutation = this.findMutation(styleKey);
    if (!mutation) throw new SearError(`Rich-text inline style mutation "${styleKey}" is not registered.`);
    return mutation;
  }

  /** Resolves a plugin-owned persisted inline style mutation by style key when registered. */
  public getMutation(styleKey: string): RichTextInlineStyleMutation | undefined {
    return this.findMutation(styleKey);
  }

  /** Returns all registered persisted inline-style mutation keys in registration order. */
  public getMutationKeys(): readonly string[] {
    const keys: string[] = [];
    for (const contribution of this.#contributions.values()) {
      for (const mutation of contribution.mutations ?? []) keys.push(mutation.styleKey);
    }
    return keys;
  }

  private findMutation(styleKey: string): RichTextInlineStyleMutation | undefined {
    for (const contribution of this.#contributions.values()) {
      const mutation = contribution.mutations?.find((candidate) => candidate.styleKey === styleKey);
      if (mutation) return mutation;
    }
    return void 0;
  }
}

function stringifyInlineStyle(style: RichTextInlineStyle | undefined): string {
  if (!style) return '';
  const keys = Object.keys(style).sort();
  return JSON.stringify(keys.map((key) => [key, style[key]]));
}
