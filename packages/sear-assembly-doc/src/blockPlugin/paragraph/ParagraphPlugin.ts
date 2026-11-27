import { SearError } from '@searsuite/sear-foundation-error';
import { DocCommandBus } from '@searsuite/sear-assembly-commands';
import { DocTransaction } from '@searsuite/sear-domain-commands';
import { PluginKey } from '@searsuite/sear-assembly-plugin';
import {
  DocNodeRegistry,
  registerParagraphDocNode,
  createDefaultRichTextBlockFlowContribution,
  createRichTextLineSpacingContribution,
  RichTextParagraphAttribute,
  type RichTextBlockFlowRegistry,
  type RichTextLineBoxRegistry,
  type RichTextLineSpacing,
} from '@searsuite/sear-domain-doc';
import { Injectable } from '@searsuite/sear-foundation-di';

import {
  LoadDocumentCommand,
  SplitDocParagraphCommand,
  type LoadDocumentInput,
} from '../../commands/DocEditingCommands';
import {
  DocPlugin,
  type DocPluginRuntime,
  type DocPluginServiceContext,
  type DocPluginSetupContext,
} from '../../plugin/DocPluginContracts';
import { createDocCommand } from '../../plugin/DocPluginCommandUtils';

import {
  SetDocLineSpacingCommand,
  SetDocParagraphSpacingAfterCommand,
  type SetDocLineSpacingInput,
  type SetDocParagraphSpacingAfterInput,
} from './ParagraphCommands';

/** Registers paragraph and text node model support plus block-level commands. */
@Injectable()
export class ParagraphPlugin extends DocPlugin<null> {
  /** DI token for resolving ParagraphPlugin. */
  public static readonly symbol = Symbol.for('ParagraphPlugin');

  #runtime: DocPluginRuntime | null = null;

  /** Creates a ParagraphPlugin instance. */
  public constructor() {
    super({ key: new PluginKey('DocParagraph'), state: null });
  }

  /** Registers paragraph node model support owned by this plugin. */
  public static registerServices(context: DocPluginServiceContext): void {
    registerParagraphDocNode(context.container.resolve<DocNodeRegistry>(DocNodeRegistry.symbol));
  }

  public registerState() {
    return { key: this.key, state: null };
  }

  public apply(_state: null, _transaction: unknown): null {
    return null;
  }

  public configure(context: DocPluginSetupContext): void {
    this.#runtime = context.runtime;
  }

  public registerLineBoxes(registry: RichTextLineBoxRegistry): void {
    registry.register(createRichTextLineSpacingContribution());
  }

  public registerBlockFlows(registry: RichTextBlockFlowRegistry): void {
    registry.register(createDefaultRichTextBlockFlowContribution());
  }

  public onEditorDestroy(): void {
    this.#runtime = null;
  }

  public registerCommands(commands: DocCommandBus): void {
    commands.register(LoadDocumentCommand, this.#createLoadDocumentCommand.bind(this));
    commands.register(SplitDocParagraphCommand, this.#createSplitParagraphCommand.bind(this));
    commands.register(SetDocLineSpacingCommand, this.#createSetLineSpacingCommand.bind(this));
    commands.register(SetDocParagraphSpacingAfterCommand, this.#createSetParagraphSpacingAfterCommand.bind(this));
  }

  #createLoadDocumentCommand(input: LoadDocumentInput) {
    const plugin = this;
    function createLoadDocumentTransaction() {
      return plugin.#requireRuntime().document.input.createReplaceDocumentTransaction(input.document);
    }
    return createDocCommand(LoadDocumentCommand.id, createLoadDocumentTransaction);
  }

  #createSplitParagraphCommand() {
    return createDocCommand(SplitDocParagraphCommand.id, this.#createSplitParagraphTransaction.bind(this), [
      { type: 'reset-caret-blink' },
    ]);
  }

  #createSetLineSpacingCommand(input: SetDocLineSpacingInput) {
    const lineSpacing = normalizeLineSpacing(input?.lineSpacing);
    return createDocCommand(SetDocLineSpacingCommand.id, () =>
      this.#createParagraphAttributeTransaction(RichTextParagraphAttribute.LineSpacing, lineSpacing),
    );
  }

  #createSetParagraphSpacingAfterCommand(input: SetDocParagraphSpacingAfterInput) {
    const spacingAfter = normalizeSpacingAfter(input?.spacingAfter);
    return createDocCommand(SetDocParagraphSpacingAfterCommand.id, () =>
      this.#createParagraphAttributeTransaction(RichTextParagraphAttribute.SpacingAfter, spacingAfter),
    );
  }

  #createParagraphAttributeTransaction(key: string, value: unknown | undefined) {
    const runtime = this.#requireRuntime();
    return runtime.document.input.createTransaction((transaction, currentState) => {
      const [start, end] = resolveSelectedParagraphRange(currentState.docSelection, currentState.pendingDoc.length);
      for (let index = start; index <= end; index++) {
        const paragraph = currentState.pendingDoc[index];
        if (!paragraph) continue;
        transaction.updateAttrs([index], key, value, paragraph.attrs[key]);
      }
      return transaction;
    }, new DocTransaction());
  }

  #createSplitParagraphTransaction() {
    return this.#requireRuntime().document.input.createSoftEnterTransaction();
  }

  #requireRuntime(): DocPluginRuntime {
    if (!this.#runtime) throw new SearError('ParagraphPlugin is not configured.');
    return this.#runtime;
  }
}

function normalizeLineSpacing(value: RichTextLineSpacing | null | undefined): RichTextLineSpacing | undefined {
  if (value === null || value === void 0) return void 0;
  if (
    !value ||
    (value.mode !== 'auto' && value.mode !== 'multiple' && value.mode !== 'atLeast' && value.mode !== 'exact')
  ) {
    throw new TypeError('SetDocLineSpacingCommand.lineSpacing has an unsupported mode.');
  }
  if (value.mode === 'auto') return { mode: 'auto' };
  if (typeof value.value !== 'number' || !Number.isFinite(value.value) || value.value <= 0) {
    throw new TypeError('SetDocLineSpacingCommand.lineSpacing.value must be a positive finite number.');
  }
  return { mode: value.mode, value: value.value };
}

function normalizeSpacingAfter(value: number | null | undefined): number | undefined {
  if (value === null || value === void 0) return void 0;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError(
      'SetDocParagraphSpacingAfterCommand.spacingAfter must be a non-negative finite number or null.',
    );
  }
  return value;
}

function resolveSelectedParagraphRange(
  selection: { readonly anchor: { readonly path: number[] }; readonly head: { readonly path: number[] } },
  blockCount: number,
): [number, number] {
  if (blockCount === 0) return [0, -1];
  const anchor = normalizeBlockIndex(selection.anchor.path[0], blockCount);
  const head = normalizeBlockIndex(selection.head.path[0], blockCount);
  return [Math.min(anchor, head), Math.max(anchor, head)];
}

function normalizeBlockIndex(value: number, blockCount: number): number {
  if (!Number.isInteger(value) || value < 0) return 0;
  return Math.min(value, blockCount - 1);
}
