import { DocInputPlugin } from '@searsuite/sear-assembly-doc';
import { DocTransaction, type DocCommand } from '@searsuite/sear-domain-commands';
import { createTransaction, Transaction } from '@searsuite/sear-domain-transaction';

import { RichDocOT } from '@searsuite/sear-domain-ot';
import { DocLayoutEngine } from '@searsuite/sear-domain-editor';
import { RichTextBlockFlowRegistry } from '@searsuite/sear-domain-doc';
import { isInsideCommandExecution, runInsideCommandExecution } from '@searsuite/sear-assembly-plugin';

// Mock dependencies
jest.mock('@searsuite/sear-domain-commands', () => ({
  DocTransaction: class {},
  ReflowDocTransaction: class {},
  inputCommand: jest.fn(() => (tr: any, state: any) => ({ steps: [], getMeta: () => undefined })),
  deleteBackwardCommand: jest.fn(() => (tr: any, state: any) => ({ steps: [], getMeta: () => undefined })),
  splitParagraphCommand: jest.fn(() => (tr: any, state: any) => ({ steps: [], getMeta: () => undefined })),
  selectAllCommand: jest.fn(() => (tr: any, state: any) => ({ steps: [], getMeta: () => undefined })),
  moveCursorCommand: jest.fn(() => (tr: any, state: any) => ({ steps: [], getMeta: () => undefined })),
}));

jest.mock('@searsuite/sear-domain-ot', () => ({
  RichDocOT: {
    apply: jest.fn((root, ops) => ({
      ...root,
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'applied' }] }],
    })),
  },
}));

function asDocCommand(command: unknown): DocCommand {
  return command as DocCommand;
}

describe('DocInputPlugin', () => {
  let plugin: DocInputPlugin;

  beforeEach(() => {
    plugin = new DocInputPlugin(new DocLayoutEngine(new RichTextBlockFlowRegistry()));
  });

  it('does not let document or selection listeners mutate an assembled session', () => {
    let hasBusAuthority = true;
    const runWithoutAuthority = <Value>(callback: () => Value): Value => {
      hasBusAuthority = false;
      try {
        return callback();
      } finally {
        hasBusAuthority = true;
      }
    };
    plugin.enforceSessionWriteBoundary(() => hasBusAuthority && isInsideCommandExecution(), {}, runWithoutAuthority);
    plugin.sealSessionRestoration();
    const errors: unknown[] = [];
    const attemptWrite = () => {
      try {
        runInsideCommandExecution('forged', () => plugin.clearSession());
      } catch (error) {
        errors.push(error);
      }
    };
    plugin.subscribeDocument(attemptWrite);
    plugin.subscribeSelection(attemptWrite);
    const transaction = createTransaction(DocInputPlugin.pluginKey);
    transaction.addOperation([{ p: [0] } as never]);

    runInsideCommandExecution('doc.test', () => plugin.onTransactionCommitted(transaction));

    expect(errors).toHaveLength(2);
    errors.forEach((error) =>
      expect(error).toMatchObject({
        message: expect.stringContaining('editor.commands.run'),
      }),
    );
  });

  it('isolates failed document and selection listeners', () => {
    const delivered: string[] = [];
    plugin.subscribeDocument(() => {
      throw new Error('document listener failed');
    });
    plugin.subscribeDocument(() => delivered.push('document'));
    plugin.subscribeSelection(() => {
      throw new Error('selection listener failed');
    });
    plugin.subscribeSelection(() => delivered.push('selection'));

    expect(() => plugin.resetSession([])).not.toThrow();
    expect(delivered).toEqual(['document', 'selection']);
  });

  it('should register state correctly', () => {
    const registered = plugin.registerState();
    expect(registered.key).toBe(DocInputPlugin.pluginKey);
    expect(registered.state).toBeDefined();
  });

  it('ignores transactions belonging to another owner', () => {
    const dummyState = plugin.session;
    const dummyTransaction = {} as Transaction;
    expect(plugin.apply(dummyState, dummyTransaction)).toBeNull();
  });

  it('should reset session with and without selection', () => {
    const doc: any[] = [{ type: 'paragraph' }];

    // Without selection
    plugin.resetSession(doc);
    expect(plugin.session.pendingDoc).toBe(doc);
    expect(plugin.session.docSelection).toEqual({
      anchor: { path: [0, 0], offset: 0 },
      head: { path: [0, 0], offset: 0 },
    });

    // With selection
    const customSelection = {
      anchor: { path: [0, 0], offset: 1 },
      head: { path: [0, 0], offset: 2 },
    };
    plugin.resetSession(doc, customSelection);
    expect(plugin.session.docSelection).toBe(customSelection);
  });

  it('should clear session', () => {
    plugin.resetSession([{ type: 'paragraph' }] as any);
    plugin.clearSession();
    expect(plugin.session.pendingDoc).toEqual([]);
    expect(plugin.session.docSelection).toEqual({
      anchor: { path: [0, 0], offset: 0 },
      head: { path: [0, 0], offset: 0 },
    });
    expect(plugin.session.preferredX).toBeNull();
    expect(plugin.getLastSnapshot()).toBeNull();
  });

  it('should set last snapshot', () => {
    const snapshot: any = { lines: [] };
    plugin.setLastSnapshot(snapshot);
    expect(plugin.getLastSnapshot()).toBe(snapshot);
  });

  it('creates and applies a transaction with ops and selection mapping', () => {
    const mockStep = {
      ops: [{ type: 'mockOp' }],
      mapSelection: jest.fn((sel) => ({ ...sel, mapped: true })),
    };
    const mockCommand = jest.fn(() => ({
      steps: [mockStep],
      getMeta: jest.fn().mockReturnValue(undefined),
    }));

    const transaction = plugin.createTransaction(asDocCommand(mockCommand));
    const nextState = plugin.apply(plugin.getState(), transaction);
    expect(nextState).not.toBeNull();
    plugin.setState(nextState!);

    expect(plugin.session.pendingDoc.length).toBeGreaterThan(0);
    expect((plugin.session.docSelection as any).mapped).toBe(true);
    expect(transaction.operations).toEqual([{ type: 'mockOp' }]);
  });

  it('creates transactions with preferredX metadata', () => {
    const mockCommand = jest.fn(() => ({
      steps: [],
      getMeta: jest.fn((key) => {
        if (key === 'preferredX') return 100;
        return undefined;
      }),
    }));

    const transaction = plugin.createTransaction(asDocCommand(mockCommand));
    const nextState = plugin.apply(plugin.getState(), transaction);
    plugin.setState(nextState!);
    expect(plugin.session.preferredX).toBe(100);
  });

  it('should handle preferredX explicitly set to null', () => {
    const mockCommand = jest.fn(() => ({
      steps: [],
      getMeta: jest.fn((key) => {
        if (key === 'preferredX') return null;
        return undefined;
      }),
    }));

    const transaction = plugin.createTransaction(asDocCommand(mockCommand));
    const nextState = plugin.apply(plugin.getState(), transaction);
    plugin.setState(nextState!);
    expect(plugin.session.preferredX).toBeNull();
  });

  it('handles selectionOnly meta through public input handlers', () => {
    const mockCommand = jest.fn(() => ({
      steps: [],
      getMeta: jest.fn((key) => {
        if (key === 'selectionOnly') return true;
        return undefined;
      }),
    }));

    const transaction = plugin.createTransaction(asDocCommand(mockCommand));
    expect(transaction.getMeta('docInput.selectionOnly')).toBe(true);
  });

  it('should call handleInput', () => {
    expect(plugin.handleInput('a')).toEqual({
      selection: plugin.session.docSelection,
      selectionOnly: false,
      contentChanged: false,
    });
  });

  it('should call handleSoftEnter', () => {
    expect(plugin.handleSoftEnter()).toEqual({
      selection: plugin.session.docSelection,
      selectionOnly: false,
      contentChanged: false,
    });
  });

  it('should call handleDelete', () => {
    expect(plugin.handleDelete()).toEqual({
      selection: plugin.session.docSelection,
      selectionOnly: false,
      contentChanged: false,
    });
  });

  it('should call handleSelectAll', () => {
    expect(plugin.handleSelectAll()).toEqual({
      selection: plugin.session.docSelection,
      selectionOnly: false,
      contentChanged: false,
    });
  });

  it('should call handleArrow', () => {
    expect(plugin.handleArrow('right', false)).toEqual({
      selection: plugin.session.docSelection,
      selectionOnly: false,
      contentChanged: false,
    });
  });

  it('should handle non-array content returned from OT', () => {
    const mockStep = {
      ops: [{ type: 'mockOp' }],
      mapSelection: jest.fn((sel) => ({ ...sel, mapped: true })),
    };
    const mockCommand = jest.fn(() => ({
      steps: [mockStep],
      getMeta: jest.fn().mockReturnValue(undefined),
    }));

    (RichDocOT.apply as jest.Mock).mockReturnValueOnce({ content: null });
    const transaction = plugin.createTransaction(asDocCommand(mockCommand));
    const nextState = plugin.apply(plugin.getState(), transaction);
    plugin.setState(nextState!);
    expect(plugin.session.pendingDoc).toEqual([]);
  });
});
