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
    super(
      new PluginKey('DocStrikethroughTextStyle'),
      createStrikethroughContribution(),
      createStrikethroughRenderContribution(),
    );
  }

  public override registerCommands(commands: DocCommandBus): void {
    commands.register(SetDocStrikethroughCommand, this.#createSetStrikethroughCommand.bind(this));
    commands.register(ToggleDocStrikethroughCommand, this.#createToggleStrikethroughCommand.bind(this));
  }

  public override registerKeyboardHandlers({ bindings, commands }: DocKeyboardHandlerRegistrationContext): void {
    bindings.registerKeyboardHandlers({
      onToggleStrikethrough: () => void commands.run(ToggleDocStrikethroughCommand, void 0),
    });
  }

  #createSetStrikethroughCommand(input: SetDocStrikethroughInput) {
    const strikethrough = normalizeBoolean(input?.strikethrough, 'SetDocStrikethroughCommand.strikethrough');
    return createDocCommand(SetDocStrikethroughCommand.id, DocContentRenderPluginKey, () =>
      this.#createStrikethroughTransaction(strikethrough),
    );
  }

  #createToggleStrikethroughCommand() {
    return createDocCommand(ToggleDocStrikethroughCommand.id, DocContentRenderPluginKey, () => {
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
      new ReflowDocTransaction(),
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

/** Creates the render-layer strikethrough contribution. */
export function createStrikethroughRenderContribution(): RichTextRunRenderContribution {
  return {
    key: `text.${StrikethroughTextStyleKey.Strikethrough}`,
    paintRun: ({ context, style, x, baselineY, width, height, fontAscent }) => {
      if (style?.[StrikethroughTextStyleKey.Strikethrough] !== true) return;
      context.setLineWidth(Math.max(1, height / 16));
      const strikeY = baselineY - Math.max(1, fontAscent * 0.35);
      context.beginPath();
      context.moveTo(x, strikeY);
      context.lineTo(x + width, strikeY);
      context.stroke();
    },
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
