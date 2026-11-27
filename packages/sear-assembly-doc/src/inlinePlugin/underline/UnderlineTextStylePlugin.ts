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

export enum UnderlineTextStyleKey {
  Underline = 'underline',
}

export interface SetDocUnderlineInput {
  readonly underline: boolean | null;
}

export const SetDocUnderlineCommand = defineDocCommand<SetDocUnderlineInput>('doc.setUnderline');
export const ToggleDocUnderlineCommand = defineDocCommand<void>('doc.toggleUnderline');

/** Contributes underline rendering, mutation, and keyboard commands. */
@Injectable()
export class UnderlineTextStylePlugin extends InlineTextStylePluginBase {
  public static readonly symbol = Symbol.for('UnderlineTextStylePlugin');
  public constructor() {
    super(new PluginKey('DocUnderlineTextStyle'), createUnderlineContribution());
  }

  public override registerCommands(commands: DocCommandBus): void {
    commands.register(SetDocUnderlineCommand, this.#createSetUnderlineCommand.bind(this));
    commands.register(ToggleDocUnderlineCommand, this.#createToggleUnderlineCommand.bind(this));
  }

  #createSetUnderlineCommand(input: SetDocUnderlineInput) {
    const underline = normalizeBoolean(input?.underline, 'SetDocUnderlineCommand.underline');
    return createDocCommand(SetDocUnderlineCommand.id, () => this.#createUnderlineTransaction(underline));
  }

  #createToggleUnderlineCommand() {
    return createDocCommand(ToggleDocUnderlineCommand.id, () => {
      const runtime = this.requireRuntime();
      const state = runtime.document.input.getState();
      const patches = buildInlineTextRangePatchPlan(state.pendingDoc, state.docSelection, () => ({}));
      const allUnderline =
        patches.length > 0 && patches.every((patch) => isUnderline(readTextStyleAttrs(patch.oldNode.attrs)));
      return this.#createUnderlineTransaction(allUnderline ? null : true);
    });
  }

  #createUnderlineTransaction(underline: boolean | null) {
    const runtime = this.requireRuntime();
    const mutation = runtime.document.inlineStyles.requireMutation(UnderlineTextStyleKey.Underline);
    return runtime.document.input.createTransaction(
      (transaction, currentState) =>
        transaction.setInlineTextStyle(
          currentState.pendingDoc,
          currentState.docSelection,
          UnderlineTextStyleKey.Underline,
          underline,
          (attrs) => mutation.apply({ attrs, value: underline }),
        ),
      new DocTransaction(),
    );
  }
}

export function createUnderlineContribution(): RichTextInlineStyleContribution {
  return {
    key: `text.${UnderlineTextStyleKey.Underline}`,
    read: (input) =>
      isUnderline(readTextStyleAttrs(input.attrs)) ? { [UnderlineTextStyleKey.Underline]: true } : void 0,
    mutations: [{ styleKey: UnderlineTextStyleKey.Underline, apply: applyUnderlineMutation }],
  };
}

function applyUnderlineMutation(input: {
  attrs: Record<string, unknown>;
  value: unknown | null;
}): Record<string, unknown> {
  return applyInlineTextStylePropertyMutation(
    input.attrs,
    UnderlineTextStyleKey.Underline,
    normalizeBoolean(input.value, 'underline'),
  );
}

function normalizeBoolean(value: unknown, name: string): boolean | null {
  if (value === null || value === void 0 || value === false) return null;
  if (value !== true) throw new TypeError(`${name} must be a boolean or null.`);
  return true;
}

function isUnderline(style: Readonly<Record<string, unknown>>): boolean {
  return style[UnderlineTextStyleKey.Underline] === true;
}
