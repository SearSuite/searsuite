import { Injectable } from '@searsuite/sear-foundation-di';
import { PluginKey } from '@searsuite/sear-assembly-plugin';
import { createBoldRenderContribution, createItalicRenderContribution, createUnderlineRenderContribution, createStrikethroughRenderContribution, createFontSizeRenderContribution, createFontFamilyRenderContribution, createTextColorRenderContribution, type RichTextRunRenderRegistry } from '@searsuite/sear-render-node';
import { ToggleDocBoldCommand, ToggleDocItalicCommand, ToggleDocUnderlineCommand, ToggleDocStrikethroughCommand, SplitDocParagraphCommand, UndoDocCommand, RedoDocCommand } from '@searsuite/sear-assembly-doc';
import { DocView, type DocKeyboardHandlerRegistrationContext } from './DocViewContracts';
@Injectable()
export class DocTextStyleView extends DocView {
  public static readonly symbol = Symbol.for('DocTextStyleView');
  public constructor() {
    super(new PluginKey('DocTextStyleView'));
  }
  public registerInlineStyleRenderers(registry: RichTextRunRenderRegistry): void {
    [
      createBoldRenderContribution,
      createItalicRenderContribution,
      createUnderlineRenderContribution,
      createStrikethroughRenderContribution,
      createFontSizeRenderContribution,
      createFontFamilyRenderContribution,
      createTextColorRenderContribution,
    ].forEach((create) => registry.register(create()));
  }
  public registerKeyboardHandlers({ bindings, commands }: DocKeyboardHandlerRegistrationContext): void {
    const run = (command: typeof ToggleDocBoldCommand) => () => {
      if (commands.has(command)) commands.run(command, undefined);
    };
    bindings.registerKeyboardHandlers({
      onToggleBold: run(ToggleDocBoldCommand),
      onToggleItalic: run(ToggleDocItalicCommand),
      onToggleUnderline: run(ToggleDocUnderlineCommand),
      onToggleStrikethrough: run(ToggleDocStrikethroughCommand),
      onEnter: run(SplitDocParagraphCommand),
      onSoftEnter: run(SplitDocParagraphCommand),
      onUndo: run(UndoDocCommand),
      onRedo: run(RedoDocCommand),
    });
  }
}
