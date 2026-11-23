/**
 * Rich-document nodes, selections, schema helpers, inline styles, and layout contracts.
 *
 * @packageDocumentation
 */

/**
 * @referenceChapter 0 document-tree Read and create the document tree
 * @referenceBody
 * A rich document is a tree of `RichDocNode` values. Paragraphs, text runs, tables, rows, and cells are node types
 * in that tree. `DocNodeRegistry` creates nodes from schema data; `Schema`, `NodeSchema`, and the node guards describe which
 * shapes the runtime accepts. Use the built-in node types when reading or constructing document content, then add
 * custom node behavior through the registry used by your Doc assembly.
 *
 * The tree is document data. Layout measurements and painted nodes are computed later by the editor and render
 * packages, so storing a document does not require a visual host.
 */

/**
 * @referenceChapter 1 selections Address text in the tree
 * @referenceBody
 * `DocCursorPos` identifies a text node with a path from the document root and an offset inside that node.
 * `DocSelection` holds an anchor and a head; when they point to the same position, the selection is a cursor.
 * Commands use these positions to target edits, and OT paths follow the same tree structure.
 *
 * Start with `DocSelection` when moving a caret or selecting text. Use the layout contracts only when a host needs
 * geometry for rendering or hit testing.
 */

export * from './applyTextAttributeRanges';
export * from './ApplyInlineTextStylePropertyMutation';
export * from './BuiltinDocNodes';
export * from './cloneRichDocument';
export * from './DocNodeRegistry';
export * from './DocNodeId';
export * from './DocSelection';
export * from './LayoutUtils';
export * from './ParagraphNode';
export * from './RichDocNode';
export * from './RichDocNodeGuards';
export * from './RichDocSchema';
export * from './RichTextLayout';
export * from './RichTextParagraphLayout';
export * from './RichTextBlockFlowRegistry';
export * from './RichTextInlineStyleRegistry';
export * from './RichTextLineBoxRegistry';
export * from './RichTextStyleUtils';
export * from './TableCellNode';
export * from './TableNode';
export * from './TableRowNode';
export * from './TextNode';

/** Public contract for TextSelection. */
export interface TextSelection {
  anchor: (number | string)[];
  head: (number | string)[];
}

export { captureRichTextFormat, applyRichTextFormat } from './RichTextFormatTransfer';
export { segmentTextGraphemes, type TextGraphemeRange } from './TextGraphemeRange';
