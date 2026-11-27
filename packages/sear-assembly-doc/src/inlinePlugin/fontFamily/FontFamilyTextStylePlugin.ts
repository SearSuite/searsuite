import { DocCommandBus, defineDocCommand } from '@searsuite/sear-assembly-commands';
import { PluginKey } from '@searsuite/sear-assembly-plugin';
import { DocTransaction } from '@searsuite/sear-domain-commands';
import {
  applyInlineTextStylePropertyMutation,
  readTextStyleAttrs,
  type RichTextInlineStyle,
  type RichTextInlineStyleContribution,
} from '@searsuite/sear-domain-doc';
import { Injectable } from '@searsuite/sear-foundation-di';
import { InlineTextStylePluginBase } from '../InlineTextStylePluginBase';

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
    super(new PluginKey('DocFontFamilyTextStyle'), createFontFamilyContribution());
  }

  public override registerCommands(commands: DocCommandBus): void {
    commands.register(SetDocFontFamilyCommand, this.#createSetFontFamilyCommand.bind(this));
  }

  #createSetFontFamilyCommand(input: SetDocFontFamilyInput) {
    const fontFamily = normalizeFontFamily(input?.fontFamily);
    return createDocCommand(SetDocFontFamilyCommand.id, () => {
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
        new DocTransaction(),
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

function readFontFamily(input: { readonly attrs: Record<string, unknown> }): RichTextInlineStyle | undefined {
  const fontFamily = readTextStyleAttrs(input.attrs)[FontFamilyTextStyleKey.FontFamily];
  return typeof fontFamily === 'string' && fontFamily.trim()
    ? { [FontFamilyTextStyleKey.FontFamily]: fontFamily.trim() }
    : void 0;
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
