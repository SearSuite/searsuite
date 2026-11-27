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

/** Persisted style key owned by the font-size text-style plugin. */
export enum FontSizeTextStyleKey {
  FontSize = 'fontSize',
}

/** Input accepted by SetDocFontSizeCommand. A null or empty value clears the font size. */
export interface SetDocFontSizeInput {
  readonly fontSize: number | null;
}

/** Sets the font size in pixels on the selected document text. */
export const SetDocFontSizeCommand = defineDocCommand<SetDocFontSizeInput>('doc.setFontSize');

/** Contributes font-size rendering and the set-font-size document command. */
@Injectable()
export class FontSizeTextStylePlugin extends InlineTextStylePluginBase {
  /** DI token for resolving FontSizeTextStylePlugin. */
  public static readonly symbol = Symbol.for('FontSizeTextStylePlugin');

  public constructor() {
    super(new PluginKey('DocFontSizeTextStyle'), createFontSizeContribution());
  }

  public override registerCommands(commands: DocCommandBus): void {
    commands.register(SetDocFontSizeCommand, this.#createSetFontSizeCommand.bind(this));
  }

  #createSetFontSizeCommand(input: SetDocFontSizeInput) {
    const fontSize = normalizeFontSize(input?.fontSize);
    return createDocCommand(SetDocFontSizeCommand.id, () => {
      const runtime = this.requireRuntime();
      const mutation = runtime.document.inlineStyles.requireMutation(FontSizeTextStyleKey.FontSize);
      return runtime.document.input.createTransaction(
        (transaction, currentState) =>
          transaction.setInlineTextStyle(
            currentState.pendingDoc,
            currentState.docSelection,
            FontSizeTextStyleKey.FontSize,
            fontSize,
            (attrs) => mutation.apply({ attrs, value: fontSize }),
          ),
        new DocTransaction(),
      );
    });
  }
}

/** Creates the shared font-size inline style contribution. */
export function createFontSizeContribution(): RichTextInlineStyleContribution {
  return {
    key: `text.${FontSizeTextStyleKey.FontSize}`,
    read: readFontSize,
    mutations: [{ styleKey: FontSizeTextStyleKey.FontSize, apply: applyFontSizeMutation }],
  };
}

function readFontSize(input: { readonly attrs: Record<string, unknown> }): RichTextInlineStyle | undefined {
  const fontSize = readTextStyleAttrs(input.attrs)[FontSizeTextStyleKey.FontSize];
  return typeof fontSize === 'number' && Number.isFinite(fontSize) && fontSize > 0
    ? { [FontSizeTextStyleKey.FontSize]: fontSize }
    : void 0;
}

function normalizeFontSize(value: unknown): number | null {
  if (value === null || value === void 0) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new TypeError('SetDocFontSizeCommand.fontSize must be a positive finite number or null.');
  }
  return value;
}

function applyFontSizeMutation(input: {
  readonly attrs: Record<string, unknown>;
  readonly value: unknown | null;
}): Record<string, unknown> {
  return applyInlineTextStylePropertyMutation(
    input.attrs,
    FontSizeTextStyleKey.FontSize,
    normalizeFontSize(input.value),
  );
}
