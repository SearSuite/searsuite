import { RichDocNode } from '@searsuite/sear-domain-doc';
import { adoptCommittedDocInputState, lockCommittedDocInputState } from '@searsuite/sear-assembly-doc';
import { type DocInputState } from '@searsuite/sear-assembly-doc';

it('revalidates a document after a rejected lock attempt', () => {
  const attrs: Record<string, unknown> = { invalid: () => void 0 };
  const state = {
    pendingDoc: [{ type: 'paragraph', attrs, content: [] }],
    docSelection: {
      anchor: { path: [0, 0], offset: 0 },
      head: { path: [0, 0], offset: 0 },
    },
    preferredX: null,
  } as unknown as DocInputState;

  expect(() => lockCommittedDocInputState(state)).toThrow('functions');
  delete attrs['invalid'];
  lockCommittedDocInputState(state);

  expect(Object.isFrozen(state)).toBe(true);
  expect(() => {
    attrs['changed'] = true;
  }).toThrow();
});

it('detaches retained node-private data and reuses the document for selection changes', () => {
  class OpaqueNode extends RichDocNode {
    #hidden = 1;
    public constructor() {
      super('paragraph');
    }
    public readHidden(): number {
      return this.#hidden;
    }
    public changeHidden(value: number): void {
      this.#hidden = value;
    }
  }
  const node = new OpaqueNode();
  const state: DocInputState = {
    pendingDoc: [node],
    docSelection: {
      anchor: { path: [0, 0], offset: 0 },
      head: { path: [0, 0], offset: 0 },
    },
    preferredX: null,
  };

  const adopted = adoptCommittedDocInputState(state);
  node.changeHidden(9);
  const next = adoptCommittedDocInputState({ ...adopted, preferredX: 12 });

  expect(adopted.pendingDoc).not.toBe(state.pendingDoc);
  expect(next.pendingDoc).toBe(adopted.pendingDoc);
  expect(() => (adopted.pendingDoc[0] as OpaqueNode).readHidden()).toThrow();
  expect(() => {
    adopted.pendingDoc[0].type = 'changed';
  }).toThrow();
});

it('rejects opaque mutable values in document attributes', () => {
  const state = {
    pendingDoc: [{ type: 'paragraph', attrs: { updatedAt: new Date() }, content: [] }],
    docSelection: { anchor: { path: [0, 0], offset: 0 }, head: { path: [0, 0], offset: 0 } },
    preferredX: null,
  } as unknown as DocInputState;

  expect(() => adoptCommittedDocInputState(state)).toThrow('nodes and plain data');
});

it('does not retain virtual attributes backed by plugin-owned mutable data', () => {
  class ParagraphNode extends RichDocNode {
    public constructor() {
      super('paragraph');
    }
  }
  const external = { value: 1 };
  const node = new ParagraphNode();
  node.attrs = new Proxy<{ stored: number; virtual?: number }>(
    { stored: 1 },
    {
      get(target, key, receiver) {
        return key === 'virtual' ? external.value : Reflect.get(target, key, receiver);
      },
    },
  );
  const state: DocInputState = {
    pendingDoc: [node],
    docSelection: { anchor: { path: [0, 0], offset: 0 }, head: { path: [0, 0], offset: 0 } },
    preferredX: null,
  };

  const adopted = adoptCommittedDocInputState(state);
  external.value = 9;

  expect(node.attrs['virtual']).toBe(9);
  expect(adopted.pendingDoc[0].attrs['virtual']).toBeUndefined();
  expect(adopted.pendingDoc[0].attrs['stored']).toBe(1);
});
