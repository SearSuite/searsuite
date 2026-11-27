import { DocCommandBus, defineDocCommand } from '@searsuite/sear-assembly-commands';
import { PluginKey } from '@searsuite/sear-assembly-plugin';
import { DocTransaction } from '@searsuite/sear-domain-commands';
import {
  buildInlineTextRangePatchPlan,
  applyInlineTextStylePropertyMutation,
  readTextStyleAttrs,
  type RichTextInlineStyle,
  type RichTextInlineStyleContribution,
} from '@searsuite/sear-domain-doc';
import { Injectable } from '@searsuite/sear-foundation-di';
import { InlineTextStylePluginBase } from '../InlineTextStylePluginBase';

import { createDocCommand } from '../../plugin/DocPluginCommandUtils';

/** Persisted style key owned by the bold text-style plugin. */
export enum BoldTextStyleKey {
  Bold = 'bold',
}

/** Input accepted by SetDocBoldCommand. A null or false value clears bold. */
export interface SetDocBoldInput {
  readonly bold: boolean | null;
}

/** Sets whether the selected document text is bold. */
export const SetDocBoldCommand = defineDocCommand<SetDocBoldInput>('doc.setBold');

/** Toggles bold on the selected document text. */
export const ToggleDocBoldCommand = defineDocCommand<void>('doc.toggleBold');

/** Contributes bold rendering and bold document commands. */
@Injectable()
export class BoldTextStylePlugin extends InlineTextStylePluginBase {
  /** DI token for resolving BoldTextStylePlugin. */
  public static readonly symbol = Symbol.for('BoldTextStylePlugin');

  public constructor() {
    super(new PluginKey('DocBoldTextStyle'), createBoldContribution());
  }

  public override registerCommands(commands: DocCommandBus): void {
    commands.register(SetDocBoldCommand, this.#createSetBoldCommand.bind(this));
    commands.register(ToggleDocBoldCommand, this.#createToggleBoldCommand.bind(this));
  }

  #createSetBoldCommand(input: SetDocBoldInput) {
    const bold = normalizeBold(input?.bold);
    return createDocCommand(SetDocBoldCommand.id, () => this.#createBoldTransaction(bold));
  }

  #createToggleBoldCommand() {
    return createDocCommand(ToggleDocBoldCommand.id, () => {
      const runtime = this.requireRuntime();
      const state = runtime.document.input.getState();
      const patches = buildInlineTextRangePatchPlan(state.pendingDoc, state.docSelection, () => ({}));
      const allBold = patches.length > 0 && patches.every((patch) => isBold(readTextStyleAttrs(patch.oldNode.attrs)));
      return this.#createBoldTransaction(allBold ? null : true);
    });
  }

  #createBoldTransaction(bold: boolean | null) {
    const runtime = this.requireRuntime();
    const mutation = runtime.document.inlineStyles.requireMutation(BoldTextStyleKey.Bold);
    return runtime.document.input.createTransaction(
      (transaction, currentState) =>
        transaction.setInlineTextStyle(
          currentState.pendingDoc,
          currentState.docSelection,
          BoldTextStyleKey.Bold,
          bold,
          (attrs) => mutation.apply({ attrs, value: bold }),
        ),
      new DocTransaction(),
    );
  }
}

/** Creates the shared bold inline style contribution. */
export function createBoldContribution(): RichTextInlineStyleContribution {
  return {
    key: `text.${BoldTextStyleKey.Bold}`,
    read: readBold,
    mutations: [{ styleKey: BoldTextStyleKey.Bold, apply: applyBoldMutation }],
  };
}

function readBold(input: { readonly attrs: Record<string, unknown> }): RichTextInlineStyle | undefined {
  return isBold(readTextStyleAttrs(input.attrs)) ? { [BoldTextStyleKey.Bold]: true } : void 0;
}

function normalizeBold(value: unknown): boolean | null {
  if (value === null || value === void 0 || value === false) return null;
  if (value !== true) throw new TypeError('SetDocBoldCommand.bold must be a boolean or null.');
  return true;
}

function applyBoldMutation(input: {
  readonly attrs: Record<string, unknown>;
  readonly value: unknown | null;
}): Record<string, unknown> {
  return applyInlineTextStylePropertyMutation(input.attrs, BoldTextStyleKey.Bold, normalizeBold(input.value));
}

function isBold(style: Readonly<Record<string, unknown>>): boolean {
  return style[BoldTextStyleKey.Bold] === true;
}
