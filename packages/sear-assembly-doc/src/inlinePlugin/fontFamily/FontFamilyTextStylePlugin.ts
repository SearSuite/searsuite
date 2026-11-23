import { DocCommandBus, defineDocCommand } from '@searsuite/sear-assembly-commands';
import { PluginKey } from '@searsuite/sear-assembly-plugin';
import { ReflowDocTransaction } from '@searsuite/sear-domain-commands';
import {
  applyInlineTextStylePropertyMutation,
  readTextStyleAttrs,
  type RichTextInlineStyle,
  type RichTextInlineStyleContribution,
} from '@searsuite/sear-domain-doc';
import { Injectable } from '@searsuite/sear-foundation-di';
import { type RichTextRunRenderContribution } from '@searsuite/sear-render-node';
import { InlineTextStylePluginBase } from '../InlineTextStylePluginBase';
import { DocContentRenderPluginKey } from '../../plugin/DocFeaturePluginKeys';
import { createDocCommand } from '../../plugin/DocPluginCommandUtils';

/** Persisted style key owned by the font-family text-style plugin. */
export enum FontFamilyTextStyleKey {
  FontFamily = 'fontFamily',
}

/** Input accepted by SetDocFontFamilyCommand. A null or empty value clears the font family. */
export interface SetDocFontFamilyInput {
  readonly fontFamily: string | null;
}

/** Sets the font family on the selected document text. */
export const SetDocFontFamilyCommand = defineDocCommand<SetDocFontFamilyInput>('doc.setFontFamily');

/** Contributes font-family rendering and the set-font-family document command. */
@Injectable()
export class FontFamilyTextStylePlugin extends InlineTextStylePluginBase {
  /** DI token for resolving FontFamilyTextStylePlugin. */
  public static readonly symbol = Symbol.for('FontFamilyTextStylePlugin');

  public constructor() {
    super(
      new PluginKey('DocFontFamilyTextStyle'),
      createFontFamilyContribution(),
      createFontFamilyRenderContribution(),
    );
  }

  public override registerCommands(commands: DocCommandBus): void {
    commands.register(SetDocFontFamilyCommand, this.createSetFontFamilyCommand.bind(this));
  }

  private createSetFontFamilyCommand(input: SetDocFontFamilyInput) {
    const fontFamily = normalizeFontFamily(input?.fontFamily);
    return createDocCommand(SetDocFontFamilyCommand.id, DocContentRenderPluginKey, () => {
      const runtime = this.requireRuntime();
      const mutation = runtime.document.inlineStyles.requireMutation(FontFamilyTextStyleKey.FontFamily);
      return runtime.document.input.createTransaction(
        (transaction, currentState) =>
          transaction.setInlineTextStyle(
            currentState.pendingDoc,
            currentState.docSelection,
            FontFamilyTextStyleKey.FontFamily,
            fontFamily,
            (attrs) => mutation.apply({ attrs, value: fontFamily }),
          ),
        new ReflowDocTransaction(),
      );
    });
  }
}

/** Creates the shared font-family inline style contribution. */
export function createFontFamilyContribution(): RichTextInlineStyleContribution {
  return {
    key: `text.${FontFamilyTextStyleKey.FontFamily}`,
    read: readFontFamily,
    mutations: [{ styleKey: FontFamilyTextStyleKey.FontFamily, apply: applyFontFamilyMutation }],
  };
}

/** Creates the render-layer font-family contribution. */
export function createFontFamilyRenderContribution(): RichTextRunRenderContribution {
  return {
    key: `text.${FontFamilyTextStyleKey.FontFamily}`,
    resolveFont: ({ font, style }) => resolveFontFamily(font, style),
  };
}

function readFontFamily(input: { readonly attrs: Record<string, unknown> }): RichTextInlineStyle | undefined {
  const fontFamily = readTextStyleAttrs(input.attrs)[FontFamilyTextStyleKey.FontFamily];
  return typeof fontFamily === 'string' && fontFamily.trim()
    ? { [FontFamilyTextStyleKey.FontFamily]: fontFamily.trim() }
    : void 0;
}

function resolveFontFamily(font: string, style: Readonly<Record<string, unknown>> | undefined): string {
  const family =
    typeof style?.[FontFamilyTextStyleKey.FontFamily] === 'string'
      ? style[FontFamilyTextStyleKey.FontFamily].trim()
      : '';
  if (!family) return font;
  const separator = font.search(/\s/);
  return separator < 0 ? font : `${font.slice(0, separator + 1)}${family}`;
}

function normalizeFontFamily(value: string | null | undefined): string | null {
  if (value === null || value === void 0) return null;
  if (typeof value !== 'string') throw new TypeError('SetDocFontFamilyCommand.fontFamily must be a string or null.');
  const fontFamily = value.trim();
  return fontFamily.length > 0 ? fontFamily : null;
}

function applyFontFamilyMutation(input: {
  readonly attrs: Record<string, unknown>;
  readonly value: unknown | null;
}): Record<string, unknown> {
  return applyInlineTextStylePropertyMutation(input.attrs, FontFamilyTextStyleKey.FontFamily, input.value);
}
