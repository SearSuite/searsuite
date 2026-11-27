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

export enum StrikethroughTextStyleKey {
  Strikethrough = 'strikethrough',
}

export interface SetDocStrikethroughInput {
  readonly strikethrough: boolean | null;
}

export const SetDocStrikethroughCommand = defineDocCommand<SetDocStrikethroughInput>('doc.setStrikethrough');
export const ToggleDocStrikethroughCommand = defineDocCommand<void>('doc.toggleStrikethrough');

/** Contributes strikethrough rendering, mutation, and keyboard commands. */
@Injectable()
export class StrikethroughTextStylePlugin extends InlineTextStylePluginBase {
  public static readonly symbol = Symbol.for('StrikethroughTextStylePlugin');
  public constructor() {
    super(new PluginKey('DocStrikethroughTextStyle'), createStrikethroughContribution());
  }

  public override registerCommands(commands: DocCommandBus): void {
    commands.register(SetDocStrikethroughCommand, this.#createSetStrikethroughCommand.bind(this));
    commands.register(ToggleDocStrikethroughCommand, this.#createToggleStrikethroughCommand.bind(this));
  }

  #createSetStrikethroughCommand(input: SetDocStrikethroughInput) {
    const strikethrough = normalizeBoolean(input?.strikethrough, 'SetDocStrikethroughCommand.strikethrough');
    return createDocCommand(SetDocStrikethroughCommand.id, () => this.#createStrikethroughTransaction(strikethrough));
  }

  #createToggleStrikethroughCommand() {
    return createDocCommand(ToggleDocStrikethroughCommand.id, () => {
      const runtime = this.requireRuntime();
      const state = runtime.document.input.getState();
      const patches = buildInlineTextRangePatchPlan(state.pendingDoc, state.docSelection, () => ({}));
      const allStrikethrough =
        patches.length > 0 && patches.every((patch) => isStrikethrough(readTextStyleAttrs(patch.oldNode.attrs)));
      return this.#createStrikethroughTransaction(allStrikethrough ? null : true);
    });
  }

  #createStrikethroughTransaction(strikethrough: boolean | null) {
    const runtime = this.requireRuntime();
    const mutation = runtime.document.inlineStyles.requireMutation(StrikethroughTextStyleKey.Strikethrough);
    return runtime.document.input.createTransaction(
      (transaction, currentState) =>
        transaction.setInlineTextStyle(
          currentState.pendingDoc,
          currentState.docSelection,
          StrikethroughTextStyleKey.Strikethrough,
          strikethrough,
          (attrs) => mutation.apply({ attrs, value: strikethrough }),
        ),
      new DocTransaction(),
    );
  }
}

export function createStrikethroughContribution(): RichTextInlineStyleContribution {
  return {
    key: `text.${StrikethroughTextStyleKey.Strikethrough}`,
    read: (input) =>
      isStrikethrough(readTextStyleAttrs(input.attrs)) ? { [StrikethroughTextStyleKey.Strikethrough]: true } : void 0,
    mutations: [{ styleKey: StrikethroughTextStyleKey.Strikethrough, apply: applyStrikethroughMutation }],
  };
}

function applyStrikethroughMutation(input: {
  attrs: Record<string, unknown>;
  value: unknown | null;
}): Record<string, unknown> {
  return applyInlineTextStylePropertyMutation(
    input.attrs,
    StrikethroughTextStyleKey.Strikethrough,
    normalizeBoolean(input.value, 'strikethrough'),
  );
}

function normalizeBoolean(value: unknown, name: string): boolean | null {
  if (value === null || value === void 0 || value === false) return null;
  if (value !== true) throw new TypeError(`${name} must be a boolean or null.`);
  return true;
}

function isStrikethrough(style: Readonly<Record<string, unknown>>): boolean {
  return style[StrikethroughTextStyleKey.Strikethrough] === true;
}
