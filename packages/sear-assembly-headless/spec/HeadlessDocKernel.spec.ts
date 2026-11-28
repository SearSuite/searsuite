/** @jest-environment node */
import {
  defineDocCommand,
  defineDocQuery,
  type DocCommandBus,
  type DocQueryRegistry,
} from '@searsuite/sear-assembly-commands';
import {
  DocPlugin,
  InsertDocTextCommand,
  RedoDocCommand,
  SetDocSelectionCommand,
  UndoDocCommand,
} from '@searsuite/sear-assembly-doc';
import {
  CaptureDocSessionStateCommand,
  DocCommitObservation,
  DocDocumentObservation as DocumentObservation,
  ReadDocDocumentQuery,
  ReadDocSelectionQuery,
  ReadDocTextQuery,
  createDocKernelEditor,
} from '@searsuite/sear-assembly-doc-kernel';
import { Pipeline, PluginKey } from '@searsuite/sear-assembly-plugin';
import { DocNodeRegistry, ParagraphNode, TextNode, type RichDocNode } from '@searsuite/sear-domain-doc';
import { createTransaction, type Transaction } from '@searsuite/sear-domain-transaction';
import { Injectable, type Container } from '@searsuite/sear-foundation-di';
import { NodePlatform } from '@searsuite/sear-node-adapters';
import { createHeadlessDocEditor } from '../src';

function documentOf(text: string): RichDocNode[] {
  return [
    DocNodeRegistry.create({
      type: ParagraphNode.nodeType,
      attrs: {},
      content: [{ type: TextNode.nodeType, attrs: {}, content: [], text }],
    }),
  ];
}

const Increment = defineDocCommand<void>('test.doc.increment');
const FailAfterStaging = defineDocCommand<void>('test.doc.failAfterStaging');
const ReadCounter = defineDocQuery<void, { count: number }>('test.doc.counter');
let retainedCounter: CounterPlugin | undefined;

@Injectable()
class CounterPlugin extends DocPlugin<{ count: number }> {
  public static readonly symbol = Symbol.for('test.DocCounter');
  public static readonly pluginKey = new PluginKey('test.DocCounter');
  public constructor() {
    super({ key: CounterPlugin.pluginKey, state: { count: 0 } });
    retainedCounter = this;
  }
  public registerState() {
    return { key: this.key, state: this.getState() };
  }
  public apply(state: { count: number }, transaction: Transaction) {
    return transaction.pluginKey === this.key ? { count: state.count + 1 } : null;
  }
  public registerCommands(commands: DocCommandBus): void {
    commands.register(Increment, () => ({
      id: Increment.id,
      execute: () => ({
        pipeline: new Pipeline(Increment.id).addTransaction('increment', createTransaction(this.key, [])),
      }),
    }));
    commands.register(FailAfterStaging, () => ({
      id: FailAfterStaging.id,
      execute: () => ({
        pipeline: new Pipeline(FailAfterStaging.id)
          .addTransaction('increment', createTransaction(this.key, []))
          .addLocalAction('fail', () => {
            throw new Error('staging rejected');
          }),
      }),
    }));
  }
  public registerQueries(queries: DocQueryRegistry): void {
    queries.register(ReadCounter, () => this.getState());
  }
}

describe('independent document business runtime', () => {
  it('edits and performs undo/redo in Node without constructing any presentation services', () => {
    let localContainer: Container | undefined;
    const editor = createDocKernelEditor({
      adapters: {
        platform: NodePlatform,
        registerEnvironment: (container) => {
          localContainer = container;
        },
      },
      documentState: { document: documentOf('Hello') },
    });
    try {
      for (const name of [
        'RenderContext',
        'SceneGraph',
        'BlockManager',
        'RenderEngine',
        'DocRenderEngine',
        'TextShaper',
        'TextInput',
        'KeyboardRouter',
        'PointerCapture',
        'SearCoreDoc',
        'RenderCoordinatorManager',
      ]) {
        expect(localContainer!.hasBinding(Symbol.for(name))).toBe(false);
      }
      editor.commands.run(InsertDocTextCommand, { text: 'A' });
      expect(editor.getText()).toBe('AHello');
      editor.commands.run(UndoDocCommand, void 0);
      expect(editor.getText()).toBe('Hello');
      editor.commands.run(RedoDocCommand, void 0);
      expect(editor.getText()).toBe('AHello');
      expect(editor.queries.run(ReadDocTextQuery, void 0)).toBe('AHello');
    } finally {
      editor.destroy();
    }
  });

  it('owns third-party state, queries and atomic rollback independently of a view', () => {
    const editor = createHeadlessDocEditor({
      documentState: { document: documentOf('Hello') },
      plugins: [CounterPlugin],
    });
    try {
      expect(() => editor.commands.run(FailAfterStaging, void 0)).toThrow('staging rejected');
      expect(editor.queries.run(ReadCounter, void 0)).toEqual({ count: 0 });
      expect(editor.observations.getSnapshot(DocCommitObservation).revision).toBe(0);
      editor.commands.run(Increment, void 0);
      expect(editor.queries.run(ReadCounter, void 0)).toEqual({ count: 1 });
      expect(() => retainedCounter!.setState({ count: 99 })).toThrow();
      const detached = editor.queries.run(ReadCounter, void 0);
      try {
        detached.count = 99;
      } catch {
        /* Frozen snapshots are also detached. */
      }
      expect(editor.queries.run(ReadCounter, void 0).count).toBe(1);
    } finally {
      editor.destroy();
    }
  });

  it('publishes detached committed observations and isolates failing listeners', () => {
    const editor = createHeadlessDocEditor({ documentState: { document: documentOf('Hello') } });
    const revisions: number[] = [],
      texts: string[] = [];
    const dispose = editor.observations.subscribe(DocCommitObservation, (snapshot) => {
      revisions.push(snapshot.revision);
    });
    editor.observations.subscribe(DocumentObservation, (change) => {
      texts.push(change.text);
      throw new Error('consumer failed');
    });
    try {
      expect(() => editor.commands.run(InsertDocTextCommand, { text: 'A' })).not.toThrow();
      expect(revisions).toEqual([0, 1]);
      expect(texts).toEqual(['Hello', 'AHello']);
      const snapshot = editor.queries.run(ReadDocDocumentQuery, void 0);
      (snapshot.document[0]!.content[0] as TextNode).text = 'external mutation';
      expect(editor.getText()).toBe('AHello');
    } finally {
      dispose();
      editor.destroy();
      editor.destroy();
    }
    expect(() => editor.commands.run(InsertDocTextCommand, { text: 'late' })).toThrow();
  });

  it('restores business selection and history sessions without any layout or input adapter', () => {
    const first = createHeadlessDocEditor({ documentState: { document: documentOf('Hello') } });
    first.commands.run(InsertDocTextCommand, { text: 'A' });
    first.commands.run(SetDocSelectionCommand, {
      selection: { anchor: { path: [0, 0], offset: 2 }, head: { path: [0, 0], offset: 2 } },
    });
    const document = first.getDocument(),
      sessionState = first.commands.run(CaptureDocSessionStateCommand, void 0).sessionState;
    first.destroy();
    const restored = createHeadlessDocEditor({ documentState: { document }, sessionState });
    try {
      expect(restored.queries.run(ReadDocSelectionQuery, void 0).head.offset).toBe(2);
      restored.commands.run(UndoDocCommand, void 0);
      expect(restored.getText()).toBe('Hello');
    } finally {
      restored.destroy();
    }
  });
});
