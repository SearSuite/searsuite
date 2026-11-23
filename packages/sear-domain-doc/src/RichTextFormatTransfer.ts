import { type Schema } from '@searsuite/sear-domain-doc-schema';
import { TextNode } from './TextNode';
import { type RichTextInlineStyleRegistry } from './RichTextInlineStyleRegistry';

/** Captures the leading text run's explicit registered styles, excluding host defaults. */
export function captureRichTextFormat(
  document: readonly Schema[],
  registry: RichTextInlineStyleRegistry,
): Readonly<Record<string, unknown>> {
  for (const node of document) {
    if (node.type === TextNode.nodeType) return registry.readTextNodeStyle(new TextNode(node)) ?? {};
    if (node.content) {
      const first = findText(node.content);
      if (first) return registry.readTextNodeStyle(new TextNode(first)) ?? {};
    }
  }
  return {};
}

/** Replaces registered styles while retaining text, structure and unrelated attributes. */
export function applyRichTextFormat(
  document: readonly Schema[],
  format: Readonly<Record<string, unknown>>,
  registry: RichTextInlineStyleRegistry,
): Schema[] {
  return document.map((node) => {
    const copy = JSON.parse(JSON.stringify(node)) as Schema;
    if (copy.type === TextNode.nodeType) {
      let attrs: Record<string, unknown> = copy.attrs ?? {};
      for (const key of registry.getMutationKeys())
        attrs = registry.requireMutation(key).apply({ attrs, value: format[key] ?? null });
      if (Object.keys(attrs).length) copy.attrs = attrs;
      else delete copy.attrs;
    }
    if (copy.content) copy.content = applyRichTextFormat(copy.content, format, registry);
    return copy;
  });
}

function findText(nodes: readonly Schema[]): Schema | undefined {
  for (const node of nodes) {
    if (node.type === TextNode.nodeType) return node;
    const child = node.content && findText(node.content);
    if (child) return child;
  }
  return undefined;
}
