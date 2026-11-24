import { SearError } from '@searsuite/sear-foundation-error';
import { Injectable } from '@searsuite/sear-foundation-di';
import { type RichDocNode } from './RichDocNode';
import { RichTextParagraphAttribute, parseRichTextParagraphSpacing } from './RichTextParagraphLayout';

/** Input used to resolve the flow spacing after one top-level document block. */
export interface RichTextBlockFlowResolveInput {
  readonly node: RichDocNode;
  readonly index: number;
  readonly blockCount: number;
  readonly spacingAfter: number;
}

/** Plugin-owned contribution that can refine block flow metrics. */
export interface RichTextBlockFlowContribution {
  readonly key: string;
  resolve(input: RichTextBlockFlowResolveInput): number;
}

/** Ordered registry for plugin-owned top-level block flow resolution. */
@Injectable()
export class RichTextBlockFlowRegistry {
  readonly #defaultSpacingAfter: number;

  public static readonly symbol = Symbol.for('RichTextBlockFlowRegistry');

  readonly #contributions = new Map<string, RichTextBlockFlowContribution>();
  #assertWrite: (() => void) | null = null;

  public constructor(defaultSpacingAfter: number = 0) {
    this.#defaultSpacingAfter = defaultSpacingAfter;
  }

  public enforceWriteBoundary(assertWrite: () => void): void {
    if (this.#assertWrite) throw new SearError('Rich-text block flow write boundary is already installed.');
    this.#assertWrite = assertWrite;
    Object.freeze(this);
  }

  public register(contribution: RichTextBlockFlowContribution): () => void {
    this.#assertWrite?.();
    const key = contribution.key;
    if (this.#contributions.has(key)) {
      throw new SearError(`Rich-text block flow contribution "${contribution.key}" already exists.`);
    }
    const registration = Object.freeze({ key, resolve: contribution.resolve });
    this.#contributions.set(key, registration);
    return () => {
      this.#assertWrite?.();
      if (this.#contributions.get(key) === registration) this.#contributions.delete(key);
    };
  }

  public resolve(input: { readonly node: RichDocNode; readonly index: number; readonly blockCount: number }): number {
    let spacingAfter = normalizeSpacing(this.#defaultSpacingAfter);
    for (const contribution of this.#contributions.values()) {
      spacingAfter = normalizeSpacing(contribution.resolve({ ...input, spacingAfter }));
    }
    return input.index === input.blockCount - 1 ? 0 : spacingAfter;
  }
}

/** Creates the paragraph-owned default after-spacing contribution. */
export function createDefaultRichTextBlockFlowContribution(): RichTextBlockFlowContribution {
  return {
    key: 'paragraph.defaultBlockFlow',
    resolve(input) {
      return (
        parseRichTextParagraphSpacing(input.node.attrs[RichTextParagraphAttribute.SpacingAfter]) ?? input.spacingAfter
      );
    },
  };
}

function normalizeSpacing(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}
