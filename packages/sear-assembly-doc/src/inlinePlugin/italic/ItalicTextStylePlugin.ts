import { DocCommandBus, defineDocCommand } from '@searsuite/sear-assembly-commands';
import { PluginKey } from '@searsuite/sear-assembly-plugin';
import { DocTransaction } from '@searsuite/sear-domain-commands';
import {
  buildInlineTextRangePatchPlan,
  applyInlineTextStylePropertyMutation,
  readTextStyleAttrs,
  type RichTextInlineStyleContribution,
} from '@searsuite/sear-domain-doc';
import { Injectable } from '@searsuite/sear-foundation-di';

import { createDocCommand } from '../../plugin/DocPluginCommandUtils';
import { InlineTextStylePluginBase } from '../InlineTextStylePluginBase';

export enum ItalicTextStyleKey {
  Italic = 'italic',
}

export interface SetDocItalicInput {
  readonly italic: boolean | null;
}

export const SetDocItalicCommand = defineDocCommand<SetDocItalicInput>('doc.setItalic');
export const ToggleDocItalicCommand = defineDocCommand<void>('doc.toggleItalic');

/** Contributes italic rendering, mutation, and keyboard commands. */
@Injectable()
export class ItalicTextStylePlugin extends InlineTextStylePluginBase {
  public static readonly symbol = Symbol.for('ItalicTextStylePlugin');
  public constructor() {
    super(new PluginKey('DocItalicTextStyle'), createItalicContribution());
  }

  public override registerCommands(commands: DocCommandBus): void {
    commands.register(SetDocItalicCommand, this.#createSetItalicCommand.bind(this));
    commands.register(ToggleDocItalicCommand, this.#createToggleItalicCommand.bind(this));
  }

  #createSetItalicCommand(input: SetDocItalicInput) {
    const italic = normalizeBoolean(input?.italic, 'SetDocItalicCommand.italic');
    return createDocCommand(SetDocItalicCommand.id, () => this.#createItalicTransaction(italic));
  }

  #createToggleItalicCommand() {
    return createDocCommand(ToggleDocItalicCommand.id, () => {
      const runtime = this.requireRuntime();
      const state = runtime.document.input.getState();
      const patches = buildInlineTextRangePatchPlan(state.pendingDoc, state.docSelection, () => ({}));
      const allItalic =
        patches.length > 0 && patches.every((patch) => isItalic(readTextStyleAttrs(patch.oldNode.attrs)));
      return this.#createItalicTransaction(allItalic ? null : true);
    });
  }

  #createItalicTransaction(italic: boolean | null) {
    const runtime = this.requireRuntime();
    const mutation = runtime.document.inlineStyles.requireMutation(ItalicTextStyleKey.Italic);
    return runtime.document.input.createTransaction(
      (transaction, currentState) =>
        transaction.setInlineTextStyle(
          currentState.pendingDoc,
          currentState.docSelection,
          ItalicTextStyleKey.Italic,
          italic,
          (attrs) => mutation.apply({ attrs, value: italic }),
        ),
      new DocTransaction(),
    );
  }
}

export function createItalicContribution(): RichTextInlineStyleContribution {
  return {
    key: `text.${ItalicTextStyleKey.Italic}`,
    read: (input) => (isItalic(readTextStyleAttrs(input.attrs)) ? { [ItalicTextStyleKey.Italic]: true } : void 0),
    mutations: [{ styleKey: ItalicTextStyleKey.Italic, apply: applyItalicMutation }],
  };
}

function applyItalicMutation(input: {
  attrs: Record<string, unknown>;
  value: unknown | null;
}): Record<string, unknown> {
  return applyInlineTextStylePropertyMutation(
    input.attrs,
    ItalicTextStyleKey.Italic,
    normalizeBoolean(input.value, 'italic'),
  );
}

function normalizeBoolean(value: unknown, name: string): boolean | null {
  if (value === null || value === void 0 || value === false) return null;
  if (value !== true) throw new TypeError(`${name} must be a boolean or null.`);
  return true;
}

function isItalic(style: Readonly<Record<string, unknown>>): boolean {
  return style[ItalicTextStyleKey.Italic] === true;
}
