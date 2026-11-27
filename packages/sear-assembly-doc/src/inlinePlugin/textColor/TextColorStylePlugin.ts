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

/** Persisted style key owned by the text-color style plugin. */
export enum TextColorStyleKey {
  Color = 'color',
}

/** Input accepted by SetDocTextColorCommand. A null or empty value clears the text color. */
export interface SetDocTextColorInput {
  readonly color: string | null;
}

/** Sets the text color on the selected document text. */
export const SetDocTextColorCommand = defineDocCommand<SetDocTextColorInput>('doc.setTextColor');

/** Contributes text-color rendering and mutation for text nodes. */
@Injectable()
export class TextColorStylePlugin extends InlineTextStylePluginBase {
  /** DI token for resolving TextColorStylePlugin. */
  public static readonly symbol = Symbol.for('TextColorStylePlugin');

  /** Creates a TextColorStylePlugin instance. */
  public constructor() {
    super(new PluginKey('DocTextColorStyle'), createTextColorContribution());
  }

  public override registerCommands(commands: DocCommandBus): void {
    commands.register(SetDocTextColorCommand, this.#createSetTextColorCommand.bind(this));
  }

  #createSetTextColorCommand(input: SetDocTextColorInput) {
    const color = normalizeTextColor(input?.color);
    return createDocCommand(SetDocTextColorCommand.id, () => {
      const runtime = this.requireRuntime();
      const mutation = runtime.document.inlineStyles.requireMutation(TextColorStyleKey.Color);
      return runtime.document.input.createTransaction(
        (transaction, currentState) =>
          transaction.setInlineTextStyle(
            currentState.pendingDoc,
            currentState.docSelection,
            TextColorStyleKey.Color,
            color,
            (attrs) => mutation.apply({ attrs, value: color }),
          ),
        new DocTransaction().setMeta('doc.changedInlineStyles', ['color']),
      );
    });
  }
}

/** Creates the shared text-color inline style contribution. */
export function createTextColorContribution(): RichTextInlineStyleContribution {
  return {
    key: `text.${TextColorStyleKey.Color}`,
    read: readTextColor,
    mutations: [{ styleKey: TextColorStyleKey.Color, apply: applyTextColorMutation }],
  };
}

function readTextColor(input: { readonly attrs: Record<string, unknown> }): RichTextInlineStyle | undefined {
  const style = readTextStyleAttrs(input.attrs);
  return typeof style[TextColorStyleKey.Color] === 'string'
    ? { [TextColorStyleKey.Color]: style[TextColorStyleKey.Color] }
    : void 0;
}

function applyTextColorMutation(input: {
  readonly attrs: Record<string, unknown>;
  readonly value: unknown | null;
}): Record<string, unknown> {
  return applyInlineTextStylePropertyMutation(input.attrs, TextColorStyleKey.Color, normalizeTextColor(input.value));
}

function normalizeTextColor(value: unknown): string | null {
  if (value === null || value === void 0) return null;
  if (typeof value !== 'string') throw new TypeError('SetDocTextColorCommand.color must be a string or null.');
  const color = value.trim();
  return color.length > 0 ? color : null;
}
