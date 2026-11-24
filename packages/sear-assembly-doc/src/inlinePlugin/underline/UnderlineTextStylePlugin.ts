import { DocCommandBus, defineDocCommand } from '@searsuite/sear-assembly-commands';
import { PluginKey } from '@searsuite/sear-assembly-plugin';
import { ReflowDocTransaction } from '@searsuite/sear-domain-commands';
import {
  buildInlineTextRangePatchPlan,
  applyInlineTextStylePropertyMutation,
  readTextStyleAttrs,
  type RichTextInlineStyle,
  type RichTextInlineStyleContribution,
} from '@searsuite/sear-domain-doc';
import { type RichTextRunRenderContribution } from '@searsuite/sear-render-node';
import { Injectable } from '@searsuite/sear-foundation-di';
import { type DocKeyboardHandlerRegistrationContext } from '../../plugin/DocPluginContracts';
import { DocContentRenderPluginKey } from '../../plugin/DocFeaturePluginKeys';
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
    super(new PluginKey('DocUnderlineTextStyle'), createUnderlineContribution(), createUnderlineRenderContribution());
  }

  public override registerCommands(commands: DocCommandBus): void {
    commands.register(SetDocUnderlineCommand, this.#createSetUnderlineCommand.bind(this));
    commands.register(ToggleDocUnderlineCommand, this.#createToggleUnderlineCommand.bind(this));
  }

  public override registerKeyboardHandlers({ bindings, commands }: DocKeyboardHandlerRegistrationContext): void {
    bindings.registerKeyboardHandlers({
      onToggleUnderline: () => void commands.run(ToggleDocUnderlineCommand, void 0),
    });
  }

  #createSetUnderlineCommand(input: SetDocUnderlineInput) {
    const underline = normalizeBoolean(input?.underline, 'SetDocUnderlineCommand.underline');
    return createDocCommand(SetDocUnderlineCommand.id, DocContentRenderPluginKey, () =>
      this.#createUnderlineTransaction(underline),
    );
  }

  #createToggleUnderlineCommand() {
    return createDocCommand(ToggleDocUnderlineCommand.id, DocContentRenderPluginKey, () => {
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
      new ReflowDocTransaction(),
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

/** Creates the render-layer underline contribution. */
export function createUnderlineRenderContribution(): RichTextRunRenderContribution {
  return {
    key: `text.${UnderlineTextStyleKey.Underline}`,
    paintRun: ({ context, style, x, baselineY, width, height, fontDescent }) => {
      if (style?.[UnderlineTextStyleKey.Underline] !== true) return;
      context.setLineWidth(Math.max(1, height / 16));
      const y = baselineY + Math.max(1, fontDescent * 0.35);
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + width, y);
      context.stroke();
    },
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
