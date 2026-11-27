/**
 * Composable rich-document plugins for nodes, layout, inline styles, commands, and observations.
 *
 * @packageDocumentation
 */

/**
 * @referenceChapter 0 doc-features Compose document behavior from plugins
 * @referenceBody
 * A Doc assembly chooses plugins for paragraphs, tables, inline styles, and line layout. For example,
 * `ParagraphPlugin` handles paragraph behavior and `BoldTextStylePlugin` contributes a bold inline style.
 * The Doc plugin contracts define what those plugins receive from the editor runtime; the node and selection values
 * they act on live in `@searsuite/sear-domain-doc`.
 *
 * Import a feature plugin when composing the editor. Host controls should call its registered commands instead of
 * changing document nodes directly.
 */

/**
 * @referenceChapter 1 extension-points Choose the extension point for a Doc feature
 * @referenceBody
 * Use `DocNodeRegistry` for document node creation, `RichTextInlineStyleRegistry` for inline style behavior,
 * `RichTextLineBoxRegistry` for line layout, and `RichTextBlockFlowRegistry` for block flow. A Doc plugin registers
 * its own contributions at assembly time. `DocRuntimeExtensionRegistry` exposes editor-local capabilities needed
 * by plugins and hosts without sharing one global runtime.
 */

export * from './commands/DocEditingCommands';
export {
  DocRuntimeExtensionRegistry,
  defineDocRuntimeCapability,
  type DocRuntimeCapability as DocRuntimeCapabilityToken,
  type DocRuntimeCapabilityReader,
} from './plugin/DocRuntimeExtensionRegistry';
export * from './plugin/DocPluginContracts';
export * from './plugin/DocStatePluginKeys';
export * from './plugin/DocPluginCommandUtils';
export * from './inlinePlugin/InlineTextStylePluginBase';
export * from './inlinePlugin/fontFamily/FontFamilyTextStylePlugin';
export * from './inlinePlugin/fontSize/FontSizeTextStylePlugin';
export * from './inlinePlugin/bold/BoldTextStylePlugin';
export * from './inlinePlugin/italic/ItalicTextStylePlugin';
export * from './inlinePlugin/underline/UnderlineTextStylePlugin';
export * from './inlinePlugin/strikethrough/StrikethroughTextStylePlugin';
export * from './inlinePlugin/textColor/TextColorStylePlugin';
export * from './layoutPlugin/lineBox/RichTextLineBoxPlugin';
export * from './blockPlugin/paragraph/ParagraphPlugin';
export * from './blockPlugin/paragraph/ParagraphCommands';
export * from './blockPlugin/table/TablePlugin';

export * from './input/DocInputPlugin';
export * from './input/lockCommittedDocInputState';

export * from './selection/DocSelectionPlugin';
export * from './input/DocTextPlugin';
export * from './input/DocNavigationPlugin';
export * from './history/HistoryPlugin';

export * from './input/DocEditInput';

export * from './input/DocEditModel';

export * from './embeddedPlugin/SheetEmbeddedEditorPlugin';
export * from './embeddedPlugin/SheetEmbeddedEditorPluginRegistry';
export * from './embeddedPlugin/clipboard/SheetClipboardPlugin';
export * from './embeddedPlugin/formulaReference/SheetFormulaReferencePlugin';
export * from './embeddedPlugin/shortcut/SheetShortcutPlugin';
