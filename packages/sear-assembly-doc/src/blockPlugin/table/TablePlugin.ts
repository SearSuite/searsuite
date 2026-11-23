import { SearError } from '@searsuite/sear-foundation-error';
import { DocCommandBus, defineDocCommand } from '@searsuite/sear-assembly-commands';
import { PluginKey } from '@searsuite/sear-assembly-plugin';
import {
  DocNodeRegistry,
  registerTableDocNodes,
  TableCellNode,
  TableNode,
  TableRowNode,
  normalizeDocForEdit,
  type RichDocNode,
} from '@searsuite/sear-domain-doc';
import { Injectable } from '@searsuite/sear-foundation-di';
import { type Node, type NodeProperties } from '@searsuite/sear-render-node';
import {
  DocPlugin,
  type DocPluginRuntime,
  type DocPluginServiceContext,
  type DocPluginSetupContext,
} from '../../plugin/DocPluginContracts';
import { DocContentRenderPluginKey } from '../../plugin/DocFeaturePluginKeys';
import { createDocCommand } from '../../plugin/DocPluginCommandUtils';

/** Input accepted by InsertDocTableCommand. */
export interface InsertDocTableInput {
  /** Number of rows in the inserted table. */
  readonly rows: number;
  /** Number of columns in the inserted table. */
  readonly columns: number;
}

/** Inserts a table block at the current document position. */
export const InsertDocTableCommand = defineDocCommand<InsertDocTableInput>('doc.insertTable');

/** Contributes table model and insertion command without adding table knowledge to Core. */
@Injectable()
export class TablePlugin extends DocPlugin<null> {
  /** DI token for resolving TablePlugin. */
  public static readonly symbol = Symbol.for('TablePlugin');

  private runtime: DocPluginRuntime | null = null;

  /** Creates a TablePlugin instance. */
  public constructor() {
    super({ key: new PluginKey('DocTable'), state: null });
  }

  /** Registers table node model support owned by this plugin. */
  public static registerServices(context: DocPluginServiceContext): void {
    registerTableDocNodes(context.container.resolve<DocNodeRegistry>(DocNodeRegistry.symbol));
  }

  public registerState() {
    return { key: this.key, state: null };
  }

  public apply(_state: null, _transaction: unknown): null {
    return null;
  }

  public getPluginConfig(): null {
    return null;
  }

  public render(): Node<NodeProperties>[] | null {
    return null;
  }

  public configure(context: DocPluginSetupContext): void {
    this.runtime = context.runtime;
  }

  public onEditorDestroy(): void {
    this.runtime = null;
  }

  public registerCommands(commands: DocCommandBus): void {
    commands.register(InsertDocTableCommand, this.createInsertTableCommand.bind(this));
  }

  private createInsertTableCommand(input: InsertDocTableInput) {
    const plugin = this;
    function createInsertTableTransaction() {
      return plugin.createInsertTableTransaction(input);
    }
    return createDocCommand(InsertDocTableCommand.id, DocContentRenderPluginKey, createInsertTableTransaction);
  }

  private createInsertTableTransaction(input: InsertDocTableInput) {
    const rows = Math.max(1, Math.floor(input.rows));
    const columns = Math.max(1, Math.floor(input.columns));
    const runtime = this.requireRuntime();
    const state = runtime.document.input.session;
    const insertIndex = Math.min(state.pendingDoc.length, this.currentBlockIndex() + 1);
    const table = createTableNode(rows, columns);
    return runtime.document.input.createTransaction((transaction, currentState) =>
      transaction.insertNode([insertIndex], table).setSelection(currentState.docSelection),
    );
  }

  private currentBlockIndex(): number {
    const selection = this.requireRuntime().document.input.session.docSelection;
    return Math.max(0, selection.head.path[0] ?? 0);
  }

  private requireRuntime(): DocPluginRuntime {
    if (!this.runtime) throw new SearError('TablePlugin is not configured.');
    return this.runtime;
  }
}

function createTableNode(rows: number, columns: number): RichDocNode {
  const content: RichDocNode[] = [];
  for (let rowIndex = 0; rowIndex < rows; rowIndex++) {
    const cells: RichDocNode[] = [];
    for (let columnIndex = 0; columnIndex < columns; columnIndex++) {
      cells.push(createTableCellNode());
    }
    content.push(
      DocNodeRegistry.create({
        type: TableRowNode.nodeType,
        content: cells,
      }),
    );
  }
  return DocNodeRegistry.create({
    type: TableNode.nodeType,
    attrs: { rows, columns },
    content,
  });
}

function createTableCellNode(): RichDocNode {
  return DocNodeRegistry.create({
    type: TableCellNode.nodeType,
    content: normalizeDocForEdit([]),
  });
}
