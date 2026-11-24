import { adjustPathForNodeInsert, adjustPathForNodeDelete } from '../src/RichDocOTHelpers';
import { SearError } from '@searsuite/sear-foundation-error';
import { RichDocOT, RichDocOTActionName } from '../src/RichDocOT';
import { OTTransformPriority } from '../src/BaseOT';

import type {
  NodeSchema,
  RichDocOTOperation,
  InsertNodeOTOperation,
  DeleteNodeOTOperation,
  ReplaceNodeOTOperation,
  MoveNodeOTOperation,
  InsertStringOTOperation,
  DeleteStringOTOperation,
  UpdateAttrsOTOperation,
} from '../src/RichDocOT';

// ---------------------------------------------------------------------------
// Doc builder helpers
// ---------------------------------------------------------------------------

function makeDoc(...paragraphs: NodeSchema[]): NodeSchema {
  return { type: 'doc', content: [...paragraphs] };
}

function makeParagraph(attrs: Record<string, unknown>, ...children: NodeSchema[]): NodeSchema {
  return { type: 'paragraph', attrs, content: [...children] };
}

function makeText(text: string): NodeSchema {
  return { type: 'text', text };
}

function childAt(node: NodeSchema, index: number): NodeSchema {
  const child = node.content?.[index];
  if (!child) throw new SearError(`Expected child at index ${index}`);
  return child;
}

function textAt(node: NodeSchema, index: number): string | undefined {
  return childAt(node, index).text;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

// ---------------------------------------------------------------------------
// Sanity
// ---------------------------------------------------------------------------

describe('RichDocOT sanity', () => {
  it('S-1: instance name equals RichDocOT', () => {
    expect(new RichDocOT().name).toEqual('RichDocOT');
  });

  it('S-2: create() returns empty array', () => {
    expect(RichDocOT.create()).toEqual([]);
  });

  it('S-3: create([op]) returns deep copy', () => {
    const ops: RichDocOTOperation[] = [{ p: [0], [RichDocOTActionName.NodeDelete]: makeText('x') }];
    const result = RichDocOT.create(ops);
    expect(result).toEqual(ops);
    expect(result).not.toBe(ops);
  });

  it('S-4: checkValidOp throws on missing path', () => {
    expect(() =>
      RichDocOT.apply(makeDoc(), [
        {
          p: void 0,
          [RichDocOTActionName.NodeDelete]: makeText('x'),
        } as unknown as RichDocOTOperation,
      ]),
    ).toThrow('Missing path');
  });
});

describe('RichDocOT inversion', () => {
  it('restores an absent attribute after its first update', () => {
    const operation: UpdateAttrsOTOperation = {
      p: [0, 0, 'textStyle'],
      [RichDocOTActionName.UpdateAttrs]: { value: { fontFamily: 'Arial' }, prev: void 0 },
    };

    expect(RichDocOT.invert([operation])).toEqual([
      {
        p: [0, 0, 'textStyle'],
        [RichDocOTActionName.UpdateAttrs]: { value: void 0, prev: { fontFamily: 'Arial' } },
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// apply – NodeInsert (ni)
// ---------------------------------------------------------------------------

describe('RichDocOT apply – ni', () => {
  it('N1: insert paragraph at head (index 0)', () => {
    const doc = makeDoc(makeParagraph({}, makeText('a')));
    const newPara = makeParagraph({}, makeText('b'));
    const ops: InsertNodeOTOperation[] = [{ p: [0], [RichDocOTActionName.NodeInsert]: clone(newPara) }];
    const result = RichDocOT.apply(clone(doc), ops);
    expect(result.content!.length).toBe(2);
    expect(result.content![0]).toEqual(newPara);
    expect(childAt(result.content![1], 0)).toEqual(makeText('a'));
  });

  it('N2: insert paragraph in the middle (index 1)', () => {
    const doc = makeDoc(
      makeParagraph({}, makeText('a')),
      makeParagraph({}, makeText('b')),
      makeParagraph({}, makeText('c')),
    );
    const newPara = makeParagraph({}, makeText('NEW'));
    const ops: InsertNodeOTOperation[] = [{ p: [1], [RichDocOTActionName.NodeInsert]: clone(newPara) }];
    const result = RichDocOT.apply(clone(doc), ops);
    expect(result.content!.length).toBe(4);
    expect(result.content![1]).toEqual(newPara);
    expect(childAt(result.content![2], 0)).toEqual(makeText('b'));
  });

  it('N3: insert paragraph at tail (index = length)', () => {
    const doc = makeDoc(makeParagraph({}, makeText('a')), makeParagraph({}, makeText('b')));
    const newPara = makeParagraph({}, makeText('c'));
    const ops: InsertNodeOTOperation[] = [{ p: [2], [RichDocOTActionName.NodeInsert]: clone(newPara) }];
    const result = RichDocOT.apply(clone(doc), ops);
    expect(result.content!.length).toBe(3);
    expect(result.content![2]).toEqual(newPara);
  });

  it('N4: deep path – insert text node inside paragraph', () => {
    const doc = makeDoc(makeParagraph({}, makeText('a')));
    const newText = makeText('b');
    const ops: InsertNodeOTOperation[] = [{ p: [0, 1], [RichDocOTActionName.NodeInsert]: clone(newText) }];
    const result = RichDocOT.apply(clone(doc), ops);
    expect((result.content![0] as NodeSchema).content!.length).toBe(2);
    expect((result.content![0] as NodeSchema).content![1]).toEqual(newText);
  });
});

// ---------------------------------------------------------------------------
// apply – NodeDelete (nd)
// ---------------------------------------------------------------------------

describe('RichDocOT apply – nd', () => {
  it('D1: delete first paragraph', () => {
    const para0 = makeParagraph({}, makeText('a'));
    const para1 = makeParagraph({}, makeText('b'));
    const doc = makeDoc(para0, para1);
    const ops: DeleteNodeOTOperation[] = [{ p: [0], [RichDocOTActionName.NodeDelete]: clone(para0) }];
    const result = RichDocOT.apply(clone(doc), ops);
    expect(result.content!.length).toBe(1);
    expect(result.content![0]).toEqual(para1);
  });

  it('D2: delete middle paragraph', () => {
    const p0 = makeParagraph({}, makeText('a'));
    const p1 = makeParagraph({}, makeText('b'));
    const p2 = makeParagraph({}, makeText('c'));
    const doc = makeDoc(p0, p1, p2);
    const ops: DeleteNodeOTOperation[] = [{ p: [1], [RichDocOTActionName.NodeDelete]: clone(p1) }];
    const result = RichDocOT.apply(clone(doc), ops);
    expect(result.content!.length).toBe(2);
    expect(childAt(result.content![0], 0)).toEqual(makeText('a'));
    expect(childAt(result.content![1], 0)).toEqual(makeText('c'));
  });

  it('D3: delete last paragraph', () => {
    const p0 = makeParagraph({}, makeText('a'));
    const p1 = makeParagraph({}, makeText('b'));
    const doc = makeDoc(p0, p1);
    const ops: DeleteNodeOTOperation[] = [{ p: [1], [RichDocOTActionName.NodeDelete]: clone(p1) }];
    const result = RichDocOT.apply(clone(doc), ops);
    expect(result.content!.length).toBe(1);
  });

  it('D4: deep path – delete inner text node', () => {
    const doc = makeDoc(makeParagraph({}, makeText('a'), makeText('b')));
    const ops: DeleteNodeOTOperation[] = [{ p: [0, 0], [RichDocOTActionName.NodeDelete]: makeText('a') }];
    const result = RichDocOT.apply(clone(doc), ops);
    expect((result.content![0] as NodeSchema).content!.length).toBe(1);
    expect(textAt(result.content![0], 0)).toBe('b');
  });
});

describe('RichDocOT apply – node replacement (nd + ni)', () => {
  it('replaces exactly one list element without an intermediate delete', () => {
    const oldNode = makeText('Hello world');
    const newNode = makeText('H');
    const doc = makeDoc(makeParagraph({}, oldNode));
    const operation: ReplaceNodeOTOperation = {
      p: [0, 0],
      [RichDocOTActionName.NodeDelete]: clone(oldNode),
      [RichDocOTActionName.NodeInsert]: clone(newNode),
    };

    expect(RichDocOT.apply(clone(doc), [operation]).content![0].content).toEqual([newNode]);
    expect(RichDocOT.invert([operation])).toEqual([
      {
        p: [0, 0],
        [RichDocOTActionName.NodeDelete]: newNode,
        [RichDocOTActionName.NodeInsert]: oldNode,
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// apply – NodeMove (nm)
// ---------------------------------------------------------------------------

describe('RichDocOT apply – nm', () => {
  function docWithTexts(...texts: string[]) {
    return makeDoc(makeParagraph({}, ...texts.map(makeText)));
  }

  it('M1: forward move (from=0, to=2)', () => {
    const doc = docWithTexts('a', 'b', 'c');
    const ops: MoveNodeOTOperation[] = [{ p: [0, 0], [RichDocOTActionName.NodeMove]: [2] }];
    const result = RichDocOT.apply(clone(doc), ops);
    const texts = result.content![0].content!.map((node) => node.text);
    expect(texts).toEqual(['b', 'c', 'a']);
  });

  it('M2: backward move (from=2, to=0)', () => {
    const doc = docWithTexts('a', 'b', 'c');
    const ops: MoveNodeOTOperation[] = [{ p: [0, 2], [RichDocOTActionName.NodeMove]: [0] }];
    const result = RichDocOT.apply(clone(doc), ops);
    const texts = result.content![0].content!.map((node) => node.text);
    expect(texts).toEqual(['c', 'a', 'b']);
  });

  it('M3: no-op move (from=1, to=1)', () => {
    const doc = docWithTexts('a', 'b', 'c');
    const ops: MoveNodeOTOperation[] = [{ p: [0, 1], [RichDocOTActionName.NodeMove]: [1] }];
    const result = RichDocOT.apply(clone(doc), ops);
    const texts = result.content![0].content!.map((node) => node.text);
    expect(texts).toEqual(['a', 'b', 'c']);
  });
});

// ---------------------------------------------------------------------------
// apply – StringInsert (si)
// ---------------------------------------------------------------------------

describe('RichDocOT apply – si', () => {
  function docWithText(text: string) {
    return makeDoc(makeParagraph({}, makeText(text)));
  }

  it('I1: insert at offset 0 (head)', () => {
    const doc = docWithText('world');
    const ops: InsertStringOTOperation[] = [{ p: [0, 0, 0], [RichDocOTActionName.StringInsert]: 'Hello ' }];
    const result = RichDocOT.apply(clone(doc), ops);
    expect(textAt(result.content![0], 0)).toBe('Hello world');
  });

  it('I2: insert in the middle', () => {
    const doc = docWithText('acd');
    const ops: InsertStringOTOperation[] = [{ p: [0, 0, 1], [RichDocOTActionName.StringInsert]: 'b' }];
    const result = RichDocOT.apply(clone(doc), ops);
    expect(textAt(result.content![0], 0)).toBe('abcd');
  });

  it('I3: insert at tail', () => {
    const doc = docWithText('Hello');
    const ops: InsertStringOTOperation[] = [{ p: [0, 0, 5], [RichDocOTActionName.StringInsert]: '!' }];
    const result = RichDocOT.apply(clone(doc), ops);
    expect(textAt(result.content![0], 0)).toBe('Hello!');
  });
});

// ---------------------------------------------------------------------------
// apply – StringDelete (sd)
// ---------------------------------------------------------------------------

describe('RichDocOT apply – sd', () => {
  function docWithText(text: string) {
    return makeDoc(makeParagraph({}, makeText(text)));
  }

  it('E1: delete from offset 0', () => {
    const doc = docWithText('Hello');
    const ops: DeleteStringOTOperation[] = [{ p: [0, 0, 0], [RichDocOTActionName.StringDelete]: 'He' }];
    const result = RichDocOT.apply(clone(doc), ops);
    expect(textAt(result.content![0], 0)).toBe('llo');
  });

  it('E2: delete from middle', () => {
    const doc = docWithText('abcde');
    const ops: DeleteStringOTOperation[] = [{ p: [0, 0, 1], [RichDocOTActionName.StringDelete]: 'bc' }];
    const result = RichDocOT.apply(clone(doc), ops);
    expect(textAt(result.content![0], 0)).toBe('ade');
  });

  it('E3: delete to end', () => {
    const doc = docWithText('abcd');
    const ops: DeleteStringOTOperation[] = [{ p: [0, 0, 2], [RichDocOTActionName.StringDelete]: 'cd' }];
    const result = RichDocOT.apply(clone(doc), ops);
    expect(textAt(result.content![0], 0)).toBe('ab');
  });

  it('E4: mismatch throws', () => {
    const doc = docWithText('abcd');
    const ops: DeleteStringOTOperation[] = [{ p: [0, 0, 0], [RichDocOTActionName.StringDelete]: 'xyz' }];
    expect(() => RichDocOT.apply(clone(doc), ops)).toThrow('StringDelete mismatch');
  });
});

// ---------------------------------------------------------------------------
// apply – UpdateAttrs (ua)
// ---------------------------------------------------------------------------

describe('RichDocOT apply – ua', () => {
  it('A1: write new attribute key', () => {
    const doc = makeDoc(makeParagraph({}, makeText('a')));
    const ops: UpdateAttrsOTOperation[] = [
      {
        p: [0, 'indent'],
        [RichDocOTActionName.UpdateAttrs]: { value: 2, prev: void 0 },
      },
    ];
    const result = RichDocOT.apply(clone(doc), ops);
    expect((result.content![0] as NodeSchema).attrs!['indent']).toBe(2);
  });

  it('A2: overwrite existing attribute key', () => {
    const doc = makeDoc(makeParagraph({ align: 'left' }, makeText('a')));
    const ops: UpdateAttrsOTOperation[] = [
      {
        p: [0, 'align'],
        [RichDocOTActionName.UpdateAttrs]: { value: 'center', prev: 'left' },
      },
    ];
    const result = RichDocOT.apply(clone(doc), ops);
    expect((result.content![0] as NodeSchema).attrs!['align']).toBe('center');
  });
});

// ---------------------------------------------------------------------------
// apply – error branch
// ---------------------------------------------------------------------------

describe('RichDocOT apply – error branch', () => {
  it('X1: unknown operation key throws', () => {
    const doc = makeDoc(makeParagraph({}, makeText('a')));
    expect(() => RichDocOT.apply(clone(doc), [{ p: [0], xx: 1 } as unknown as RichDocOTOperation])).toThrow(
      'invalid / missing instruction in op',
    );
  });

  it('X2: resolveParent throws for non-number intermediate key', () => {
    const doc = makeDoc(makeParagraph({}, makeText('a')));
    const ops = [{ p: ['invalid', 0], [RichDocOTActionName.StringInsert]: 'x' }] as unknown as RichDocOTOperation[];
    expect(() => RichDocOT.apply(clone(doc), ops)).toThrow('Invalid RichDoc path');
  });

  it('X3: resolveParent throws for missing intermediate node', () => {
    const doc = makeDoc();
    const ops: InsertStringOTOperation[] = [{ p: [0, 0], [RichDocOTActionName.StringInsert]: 'x' }];
    expect(() => RichDocOT.apply(clone(doc), ops)).toThrow('Invalid RichDoc path');
  });

  it('X3b: resolveParent throws when intermediate node has no content field', () => {
    const doc: NodeSchema = { type: 'doc', content: [{ type: 'paragraph' }] };
    const ops: InsertStringOTOperation[] = [{ p: [0, 0, 0], [RichDocOTActionName.StringInsert]: 'x' }];
    expect(() => RichDocOT.apply(clone(doc), ops)).toThrow('Invalid RichDoc path');
  });

  it('X4: StringInsert uses empty-text fallback when parent.text is missing', () => {
    const doc = makeDoc(makeParagraph({}));
    const ops: InsertStringOTOperation[] = [{ p: [0, 0], [RichDocOTActionName.StringInsert]: 'x' }];
    const result = RichDocOT.apply(clone(doc), ops);
    expect(result.content![0].text).toBe('x');
  });

  it('X5: StringDelete uses empty-text fallback when parent.text is missing', () => {
    const doc = makeDoc(makeParagraph({}));
    const ops: DeleteStringOTOperation[] = [{ p: [0, 0], [RichDocOTActionName.StringDelete]: '' }];
    const result = RichDocOT.apply(clone(doc), ops);
    expect(result.content![0].text).toBe('');
  });

  it('X6: NodeInsert creates parent content when absent', () => {
    const doc: NodeSchema = { type: 'doc', content: [{ type: 'paragraph' }] };
    const ops: InsertNodeOTOperation[] = [{ p: [0, 0], [RichDocOTActionName.NodeInsert]: makeText('x') }];
    const result = RichDocOT.apply(clone(doc), ops);
    expect(result.content![0].content).toEqual([makeText('x')]);
  });

  it('X7: UpdateAttrs creates attrs object when absent', () => {
    const doc = makeDoc({ type: 'paragraph', content: [makeText('a')] });
    const ops: UpdateAttrsOTOperation[] = [
      {
        p: [0, 'align'],
        [RichDocOTActionName.UpdateAttrs]: { value: 'center', prev: void 0 },
      },
    ];
    const result = RichDocOT.apply(clone(doc), ops);
    expect(result.content![0].attrs).toEqual({ align: 'center' });
  });
});

// ---------------------------------------------------------------------------
// append
// ---------------------------------------------------------------------------

describe('RichDocOT append', () => {
  it('AP1: empty destination → push', () => {
    const dest: RichDocOTOperation[] = [];
    const op: InsertStringOTOperation = {
      p: [0, 0, 0],
      [RichDocOTActionName.StringInsert]: 'a',
    };
    RichDocOT.append(dest, op);
    expect(dest.length).toBe(1);
  });

  it('AP2: ni followed by nd same path same data → noop fold', () => {
    const node = makeText('x');
    const dest: RichDocOTOperation[] = [{ p: [0], [RichDocOTActionName.NodeInsert]: clone(node) }];
    RichDocOT.append(dest, {
      p: [0],
      [RichDocOTActionName.NodeDelete]: clone(node),
    });
    expect(dest.length).toBe(0);
  });

  it('AP3: ni followed by nd same path but different data → push', () => {
    const dest: RichDocOTOperation[] = [{ p: [0], [RichDocOTActionName.NodeInsert]: makeText('x') }];
    RichDocOT.append(dest, {
      p: [0],
      [RichDocOTActionName.NodeDelete]: makeText('y'),
    });
    expect(dest.length).toBe(2);
  });

  it('AP4: ni followed by nd different path → push', () => {
    const dest: RichDocOTOperation[] = [{ p: [0], [RichDocOTActionName.NodeInsert]: makeText('x') }];
    RichDocOT.append(dest, {
      p: [1],
      [RichDocOTActionName.NodeDelete]: makeText('x'),
    });
    expect(dest.length).toBe(2);
  });

  it('AP-replace: composes consecutive replacements into one ld + li component', () => {
    const oldNode = makeText('old');
    const middleNode = makeText('middle');
    const newNode = makeText('new');
    const result = RichDocOT.compose(
      [{
        p: [0],
        [RichDocOTActionName.NodeDelete]: oldNode,
        [RichDocOTActionName.NodeInsert]: middleNode,
      }],
      [{
        p: [0],
        [RichDocOTActionName.NodeDelete]: middleNode,
        [RichDocOTActionName.NodeInsert]: newNode,
      }],
    );

    expect(result).toEqual([{
      p: [0],
      [RichDocOTActionName.NodeDelete]: oldNode,
      [RichDocOTActionName.NodeInsert]: newNode,
    }]);
  });

  it('AP5: consecutive si same TextNode adjacent offsets → merge', () => {
    const dest: RichDocOTOperation[] = [{ p: [0, 0, 0], [RichDocOTActionName.StringInsert]: 'a' }];
    RichDocOT.append(dest, {
      p: [0, 0, 1],
      [RichDocOTActionName.StringInsert]: 'b',
    });
    expect(dest.length).toBe(1);
    expect((dest[0] as InsertStringOTOperation)[RichDocOTActionName.StringInsert]).toBe('ab');
  });

  it('AP6: si same TextNode non-adjacent offsets → push', () => {
    const dest: RichDocOTOperation[] = [{ p: [0, 0, 0], [RichDocOTActionName.StringInsert]: 'a' }];
    RichDocOT.append(dest, {
      p: [0, 0, 5],
      [RichDocOTActionName.StringInsert]: 'b',
    });
    expect(dest.length).toBe(2);
  });

  it('AP7: si different TextNode → push', () => {
    const dest: RichDocOTOperation[] = [{ p: [0, 0, 0], [RichDocOTActionName.StringInsert]: 'a' }];
    RichDocOT.append(dest, {
      p: [0, 1, 1],
      [RichDocOTActionName.StringInsert]: 'b',
    });
    expect(dest.length).toBe(2);
  });

  it('AP8: consecutive sd same TextNode same offset → merge', () => {
    const dest: RichDocOTOperation[] = [{ p: [0, 0, 2], [RichDocOTActionName.StringDelete]: 'c' }];
    RichDocOT.append(dest, {
      p: [0, 0, 2],
      [RichDocOTActionName.StringDelete]: 'd',
    });
    expect(dest.length).toBe(1);
    expect((dest[0] as DeleteStringOTOperation)[RichDocOTActionName.StringDelete]).toBe('cd');
  });

  it('AP9: sd same TextNode different offset → push', () => {
    const dest: RichDocOTOperation[] = [{ p: [0, 0, 2], [RichDocOTActionName.StringDelete]: 'c' }];
    RichDocOT.append(dest, {
      p: [0, 0, 3],
      [RichDocOTActionName.StringDelete]: 'd',
    });
    expect(dest.length).toBe(2);
  });

  it('AP10: ua same path → merge (keep prev, update value)', () => {
    const dest: RichDocOTOperation[] = [
      {
        p: [0, 'align'],
        [RichDocOTActionName.UpdateAttrs]: { value: 'center', prev: 'left' },
      },
    ];
    RichDocOT.append(dest, {
      p: [0, 'align'],
      [RichDocOTActionName.UpdateAttrs]: { value: 'right', prev: 'center' },
    });
    expect(dest.length).toBe(1);
    const ua = (dest[0] as UpdateAttrsOTOperation)[RichDocOTActionName.UpdateAttrs];
    expect(ua.prev).toBe('left');
    expect(ua.value).toBe('right');
  });

  it('AP11: ua different path → push', () => {
    const dest: RichDocOTOperation[] = [
      {
        p: [0, 'align'],
        [RichDocOTActionName.UpdateAttrs]: { value: 'center', prev: 'left' },
      },
    ];
    RichDocOT.append(dest, {
      p: [0, 'indent'],
      [RichDocOTActionName.UpdateAttrs]: { value: 2, prev: 0 },
    });
    expect(dest.length).toBe(2);
  });

  it('AP12: ni followed by si → push (different types)', () => {
    const dest: RichDocOTOperation[] = [{ p: [0], [RichDocOTActionName.NodeInsert]: makeText('x') }];
    RichDocOT.append(dest, {
      p: [0, 0, 0],
      [RichDocOTActionName.StringInsert]: 'a',
    });
    expect(dest.length).toBe(2);
  });

  it('AP13: consecutive si with different path lengths do not merge', () => {
    const dest: RichDocOTOperation[] = [{ p: [0, 0, 0], [RichDocOTActionName.StringInsert]: 'a' }];
    RichDocOT.append(dest, {
      p: [0, 0, 0, 1],
      [RichDocOTActionName.StringInsert]: 'b',
    } as unknown as InsertStringOTOperation);
    expect(dest.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// compose
// ---------------------------------------------------------------------------

describe('RichDocOT compose', () => {
  it('C1: empty + empty → empty', () => {
    expect(RichDocOT.compose([], [])).toEqual([]);
  });

  it('C2: [ni] + [] → [ni] (deep copy)', () => {
    const op: InsertNodeOTOperation = {
      p: [0],
      [RichDocOTActionName.NodeInsert]: makeText('x'),
    };
    const result = RichDocOT.compose([op], []);
    expect(result).toEqual([op]);
    expect(result[0]).not.toBe(op);
  });

  it('C3: [] + [si] → [si]', () => {
    const op: InsertStringOTOperation = {
      p: [0, 0, 0],
      [RichDocOTActionName.StringInsert]: 'a',
    };
    expect(RichDocOT.compose([], [op])).toEqual([op]);
  });

  it('C4: adjacent si compose → merged si', () => {
    const op1: InsertStringOTOperation[] = [{ p: [0, 0, 0], [RichDocOTActionName.StringInsert]: 'a' }];
    const op2: InsertStringOTOperation[] = [{ p: [0, 0, 1], [RichDocOTActionName.StringInsert]: 'b' }];
    const result = RichDocOT.compose(op1, op2);
    expect(result.length).toBe(1);
    expect((result[0] as InsertStringOTOperation)[RichDocOTActionName.StringInsert]).toBe('ab');
  });

  it('C5: heterogeneous ops compose without merge', () => {
    const ni: InsertNodeOTOperation = {
      p: [0],
      [RichDocOTActionName.NodeInsert]: makeText('x'),
    };
    const si: InsertStringOTOperation = {
      p: [0, 0, 0],
      [RichDocOTActionName.StringInsert]: 'a',
    };
    const ua: UpdateAttrsOTOperation = {
      p: [0, 'align'],
      [RichDocOTActionName.UpdateAttrs]: { value: 'center', prev: 'left' },
    };
    const result = RichDocOT.compose([ni], [si, ua]);
    expect(result.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// transform – otherOp = ni
// ---------------------------------------------------------------------------

describe('RichDocOT transform – other=ni', () => {
  it('T-NI-1: ni op.idx < other.idx → unchanged', () => {
    const op: InsertNodeOTOperation[] = [{ p: [0], [RichDocOTActionName.NodeInsert]: makeText('x') }];
    const other: InsertNodeOTOperation[] = [{ p: [2], [RichDocOTActionName.NodeInsert]: makeText('y') }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result[0].p[0]).toBe(0);
  });

  it('T-NI-2: ni op.idx > other.idx → +1', () => {
    const op: InsertNodeOTOperation[] = [{ p: [3], [RichDocOTActionName.NodeInsert]: makeText('x') }];
    const other: InsertNodeOTOperation[] = [{ p: [1], [RichDocOTActionName.NodeInsert]: makeText('y') }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result[0].p[0]).toBe(4);
  });

  it('T-NI-3: ni op.idx === other.idx LEFT → unchanged', () => {
    const op: InsertNodeOTOperation[] = [{ p: [1], [RichDocOTActionName.NodeInsert]: makeText('x') }];
    const other: InsertNodeOTOperation[] = [{ p: [1], [RichDocOTActionName.NodeInsert]: makeText('y') }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result[0].p[0]).toBe(1);
  });

  it('T-NI-4: ni op.idx === other.idx RIGHT → +1', () => {
    const op: InsertNodeOTOperation[] = [{ p: [1], [RichDocOTActionName.NodeInsert]: makeText('x') }];
    const other: InsertNodeOTOperation[] = [{ p: [1], [RichDocOTActionName.NodeInsert]: makeText('y') }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.RIGHT);
    expect(result[0].p[0]).toBe(2);
  });

  it('T-NI-5: nd op.idx > other.idx → +1', () => {
    const op: DeleteNodeOTOperation[] = [{ p: [3], [RichDocOTActionName.NodeDelete]: makeText('x') }];
    const other: InsertNodeOTOperation[] = [{ p: [1], [RichDocOTActionName.NodeInsert]: makeText('y') }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result[0].p[0]).toBe(4);
  });

  it('T-NI-6: nd op.idx === other.idx → +1', () => {
    const op: DeleteNodeOTOperation[] = [{ p: [1], [RichDocOTActionName.NodeDelete]: makeText('x') }];
    const other: InsertNodeOTOperation[] = [{ p: [1], [RichDocOTActionName.NodeInsert]: makeText('y') }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result[0].p[0]).toBe(2);
  });

  it('T-NI-7: nd op.idx < other.idx → unchanged', () => {
    const op: DeleteNodeOTOperation[] = [{ p: [0], [RichDocOTActionName.NodeDelete]: makeText('x') }];
    const other: InsertNodeOTOperation[] = [{ p: [2], [RichDocOTActionName.NodeInsert]: makeText('y') }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result[0].p[0]).toBe(0);
  });

  it('T-NI-8: nm from > other.idx → from+1', () => {
    const op: MoveNodeOTOperation[] = [{ p: [2], [RichDocOTActionName.NodeMove]: [3] }];
    const other: InsertNodeOTOperation[] = [{ p: [1], [RichDocOTActionName.NodeInsert]: makeText('y') }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result[0].p[0]).toBe(3);
  });

  it('T-NI-9: nm to > other.idx → to+1', () => {
    const op: MoveNodeOTOperation[] = [{ p: [0], [RichDocOTActionName.NodeMove]: [3] }];
    const other: InsertNodeOTOperation[] = [{ p: [1], [RichDocOTActionName.NodeInsert]: makeText('y') }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect((result[0] as MoveNodeOTOperation)[RichDocOTActionName.NodeMove][0]).toBe(4);
  });

  it('T-NI-10: si path crosses ni same parent → idx+1', () => {
    // si targets text at [1, 0, 0]; other inserts paragraph at [0] (doc level)
    const op: InsertStringOTOperation[] = [{ p: [1, 0, 3], [RichDocOTActionName.StringInsert]: 'x' }];
    const other: InsertNodeOTOperation[] = [{ p: [0], [RichDocOTActionName.NodeInsert]: makeParagraph({}) }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    // The first element of the path crosses the doc-level insertion
    expect(result[0].p[0]).toBe(2);
  });

  it('T-NI-11: si different parent → unchanged', () => {
    const op: InsertStringOTOperation[] = [{ p: [0, 0, 3], [RichDocOTActionName.StringInsert]: 'x' }];
    const other: InsertNodeOTOperation[] = [{ p: [1], [RichDocOTActionName.NodeInsert]: makeParagraph({}) }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result[0].p[0]).toBe(0);
  });

  it('T-NI-12: node-op path length mismatch falls back to cross-tree path adjustment', () => {
    const op: InsertNodeOTOperation[] = [{ p: [0, 0], [RichDocOTActionName.NodeInsert]: makeText('x') }];
    const other: InsertNodeOTOperation[] = [{ p: [0], [RichDocOTActionName.NodeInsert]: makeParagraph({}) }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result[0].p).toEqual([1, 0]);
  });

  it('T-NI-13: node-op same length but different parent stays unchanged', () => {
    const op: InsertNodeOTOperation[] = [{ p: [1, 0], [RichDocOTActionName.NodeInsert]: makeText('x') }];
    const other: InsertNodeOTOperation[] = [{ p: [0, 1], [RichDocOTActionName.NodeInsert]: makeText('y') }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result[0].p).toEqual([1, 0]);
  });

  it('T-NI-14: nm destination <= insert index keeps destination unchanged', () => {
    const op: MoveNodeOTOperation[] = [{ p: [2], [RichDocOTActionName.NodeMove]: [1] }];
    const other: InsertNodeOTOperation[] = [{ p: [2], [RichDocOTActionName.NodeInsert]: makeText('y') }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect((result[0] as MoveNodeOTOperation)[RichDocOTActionName.NodeMove][0]).toBe(1);
  });
});

describe('RichDocOT transform – node replacement (nd + ni)', () => {
  const oldNode = makeText('old');
  const ownNode = makeText('own');
  const otherNode = makeText('other');
  const replacement = (next: NodeSchema): ReplaceNodeOTOperation => ({
    p: [0],
    [RichDocOTActionName.NodeDelete]: clone(oldNode),
    [RichDocOTActionName.NodeInsert]: clone(next),
  });

  it('replacement vs replacement uses the left priority winner', () => {
    expect(RichDocOT.transform([replacement(ownNode)], [replacement(otherNode)], OTTransformPriority.LEFT)).toEqual([
      {
        p: [0],
        [RichDocOTActionName.NodeDelete]: otherNode,
        [RichDocOTActionName.NodeInsert]: ownNode,
      },
    ]);
  });

  it('replacement vs replacement becomes a noop for the right priority winner', () => {
    expect(RichDocOT.transform([replacement(ownNode)], [replacement(otherNode)], OTTransformPriority.RIGHT)).toEqual([]);
  });

  it('replacement vs concurrent delete becomes an insert', () => {
    const result = RichDocOT.transform(
      [replacement(ownNode)],
      [{ p: [0], [RichDocOTActionName.NodeDelete]: clone(oldNode) }],
      OTTransformPriority.LEFT,
    );
    expect(result).toEqual([{ p: [0], [RichDocOTActionName.NodeInsert]: ownNode }]);
  });

  it('replacement shifts after a concurrent insert at the same list index', () => {
    const result = RichDocOT.transform(
      [replacement(ownNode)],
      [{ p: [0], [RichDocOTActionName.NodeInsert]: otherNode }],
      OTTransformPriority.LEFT,
    );
    expect(result[0]).toMatchObject({ p: [1], nd: oldNode, ni: ownNode });
  });
});

// ---------------------------------------------------------------------------
// transform – otherOp = nd
// ---------------------------------------------------------------------------

describe('RichDocOT transform – other=nd', () => {
  it('T-ND-1: ni op.idx > other.idx → -1', () => {
    const op: InsertNodeOTOperation[] = [{ p: [3], [RichDocOTActionName.NodeInsert]: makeText('x') }];
    const other: DeleteNodeOTOperation[] = [{ p: [1], [RichDocOTActionName.NodeDelete]: makeText('y') }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result[0].p[0]).toBe(2);
  });

  it('T-ND-2: ni op.idx <= other.idx → unchanged', () => {
    const op: InsertNodeOTOperation[] = [{ p: [0], [RichDocOTActionName.NodeInsert]: makeText('x') }];
    const other: DeleteNodeOTOperation[] = [{ p: [2], [RichDocOTActionName.NodeDelete]: makeText('y') }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result[0].p[0]).toBe(0);
  });

  it('T-ND-3: nd op.idx === other.idx → noop', () => {
    const op: DeleteNodeOTOperation[] = [{ p: [1], [RichDocOTActionName.NodeDelete]: makeText('x') }];
    const other: DeleteNodeOTOperation[] = [{ p: [1], [RichDocOTActionName.NodeDelete]: makeText('x') }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result.length).toBe(0);
  });

  it('T-ND-4: nd op.idx > other.idx → -1', () => {
    const op: DeleteNodeOTOperation[] = [{ p: [3], [RichDocOTActionName.NodeDelete]: makeText('x') }];
    const other: DeleteNodeOTOperation[] = [{ p: [1], [RichDocOTActionName.NodeDelete]: makeText('y') }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result[0].p[0]).toBe(2);
  });

  it('T-ND-5: nd op.idx < other.idx → unchanged', () => {
    const op: DeleteNodeOTOperation[] = [{ p: [0], [RichDocOTActionName.NodeDelete]: makeText('x') }];
    const other: DeleteNodeOTOperation[] = [{ p: [2], [RichDocOTActionName.NodeDelete]: makeText('y') }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result[0].p[0]).toBe(0);
  });

  it('T-ND-6: nm from === other.idx → noop', () => {
    const op: MoveNodeOTOperation[] = [{ p: [1], [RichDocOTActionName.NodeMove]: [3] }];
    const other: DeleteNodeOTOperation[] = [{ p: [1], [RichDocOTActionName.NodeDelete]: makeText('y') }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result.length).toBe(0);
  });

  it('T-ND-7: nm from > other.idx → from-1', () => {
    const op: MoveNodeOTOperation[] = [{ p: [3], [RichDocOTActionName.NodeMove]: [5] }];
    const other: DeleteNodeOTOperation[] = [{ p: [1], [RichDocOTActionName.NodeDelete]: makeText('y') }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result[0].p[0]).toBe(2);
  });

  it('T-ND-8: nm to > other.idx → to-1', () => {
    const op: MoveNodeOTOperation[] = [{ p: [0], [RichDocOTActionName.NodeMove]: [4] }];
    const other: DeleteNodeOTOperation[] = [{ p: [2], [RichDocOTActionName.NodeDelete]: makeText('y') }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect((result[0] as MoveNodeOTOperation)[RichDocOTActionName.NodeMove][0]).toBe(3);
  });

  it('T-ND-9: si path through deleted node → noop', () => {
    const op: InsertStringOTOperation[] = [{ p: [1, 0, 3], [RichDocOTActionName.StringInsert]: 'x' }];
    const other: DeleteNodeOTOperation[] = [{ p: [1], [RichDocOTActionName.NodeDelete]: makeParagraph({}) }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result.length).toBe(0);
  });

  it('T-ND-10: si same parent, op idx > other idx → -1', () => {
    const op: InsertStringOTOperation[] = [{ p: [2, 0, 3], [RichDocOTActionName.StringInsert]: 'x' }];
    const other: DeleteNodeOTOperation[] = [{ p: [1], [RichDocOTActionName.NodeDelete]: makeParagraph({}) }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result[0].p[0]).toBe(1);
  });

  it('T-ND-11: nm source and destination both before deleted index remain unchanged', () => {
    const op: MoveNodeOTOperation[] = [{ p: [0], [RichDocOTActionName.NodeMove]: [0] }];
    const other: DeleteNodeOTOperation[] = [{ p: [2], [RichDocOTActionName.NodeDelete]: makeText('y') }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result[0].p[0]).toBe(0);
    expect((result[0] as MoveNodeOTOperation)[RichDocOTActionName.NodeMove][0]).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// transform – otherOp = nm
// ---------------------------------------------------------------------------

describe('RichDocOT transform – other=nm', () => {
  it('T-NM-1: ni in forward-move range gets adjusted', () => {
    // other moves from=0 to=2; ni at index 1 → should shift to 0
    const op: InsertNodeOTOperation[] = [{ p: [1], [RichDocOTActionName.NodeInsert]: makeText('x') }];
    const other: MoveNodeOTOperation[] = [{ p: [0], [RichDocOTActionName.NodeMove]: [2] }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    // After other moves index 0 to 2: element at 1 shifts to 0
    expect(result[0].p[0]).toBe(0);
  });

  it('T-NM-2: nd op.idx === from → follows to', () => {
    const op: DeleteNodeOTOperation[] = [{ p: [0], [RichDocOTActionName.NodeDelete]: makeText('x') }];
    const other: MoveNodeOTOperation[] = [{ p: [0], [RichDocOTActionName.NodeMove]: [2] }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result[0].p[0]).toBe(2);
  });

  it('T-NM-3: nd op.idx not affected by move → correctly adjusted', () => {
    // other moves 0→2 in list [a,b,c,d]; nd targets index 3 → after move, d is still at 3
    const op: DeleteNodeOTOperation[] = [{ p: [3], [RichDocOTActionName.NodeDelete]: makeText('d') }];
    const other: MoveNodeOTOperation[] = [{ p: [0], [RichDocOTActionName.NodeMove]: [2] }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    // transformIdxForMove(3, 0, 2): 3 > 2, no change → 3
    expect(result[0].p[0]).toBe(3);
  });

  it('T-NM-4: nm vs nm same from → adjusted', () => {
    const op: MoveNodeOTOperation[] = [{ p: [1], [RichDocOTActionName.NodeMove]: [3] }];
    const other: MoveNodeOTOperation[] = [{ p: [1], [RichDocOTActionName.NodeMove]: [0] }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    // transformIdxForMove(1, 1, 0) = 0 (idx===from → to)
    expect(result[0].p[0]).toBe(0);
  });

  it('T-NM-5: move with from===to leaves index unchanged', () => {
    const op: InsertNodeOTOperation[] = [{ p: [2], [RichDocOTActionName.NodeInsert]: makeText('x') }];
    const other: MoveNodeOTOperation[] = [{ p: [1], [RichDocOTActionName.NodeMove]: [1] }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result[0].p[0]).toBe(2);
  });

  it('T-NM-6: backward move shifts indexes in [to, from) right by one', () => {
    const op: InsertNodeOTOperation[] = [{ p: [2], [RichDocOTActionName.NodeInsert]: makeText('x') }];
    const other: MoveNodeOTOperation[] = [{ p: [3], [RichDocOTActionName.NodeMove]: [1] }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result[0].p[0]).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// transform – otherOp = si
// ---------------------------------------------------------------------------

describe('RichDocOT transform – other=si', () => {
  it('T-SI-1: si op.offset < other.offset → unchanged', () => {
    const op: InsertStringOTOperation[] = [{ p: [0, 0, 0], [RichDocOTActionName.StringInsert]: 'X' }];
    const other: InsertStringOTOperation[] = [{ p: [0, 0, 3], [RichDocOTActionName.StringInsert]: 'YY' }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result[0].p[2]).toBe(0);
  });

  it('T-SI-2: si op.offset > other.offset → +L', () => {
    const op: InsertStringOTOperation[] = [{ p: [0, 0, 5], [RichDocOTActionName.StringInsert]: 'X' }];
    const other: InsertStringOTOperation[] = [{ p: [0, 0, 2], [RichDocOTActionName.StringInsert]: 'YY' }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result[0].p[2]).toBe(7);
  });

  it('T-SI-3: si op.offset === other.offset LEFT → unchanged', () => {
    const op: InsertStringOTOperation[] = [{ p: [0, 0, 3], [RichDocOTActionName.StringInsert]: 'X' }];
    const other: InsertStringOTOperation[] = [{ p: [0, 0, 3], [RichDocOTActionName.StringInsert]: 'Y' }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result[0].p[2]).toBe(3);
  });

  it('T-SI-4: si op.offset === other.offset RIGHT → +L', () => {
    const op: InsertStringOTOperation[] = [{ p: [0, 0, 3], [RichDocOTActionName.StringInsert]: 'X' }];
    const other: InsertStringOTOperation[] = [{ p: [0, 0, 3], [RichDocOTActionName.StringInsert]: 'Y' }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.RIGHT);
    expect(result[0].p[2]).toBe(4);
  });

  it('T-SI-5: sd start >= other.end → +L', () => {
    const op: DeleteStringOTOperation[] = [{ p: [0, 0, 5], [RichDocOTActionName.StringDelete]: 'cd' }];
    const other: InsertStringOTOperation[] = [{ p: [0, 0, 2], [RichDocOTActionName.StringInsert]: 'XX' }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result[0].p[2]).toBe(7);
  });

  it('T-SI-6: sd start before other.offset → unchanged', () => {
    const op: DeleteStringOTOperation[] = [{ p: [0, 0, 0], [RichDocOTActionName.StringDelete]: 'ab' }];
    const other: InsertStringOTOperation[] = [{ p: [0, 0, 5], [RichDocOTActionName.StringInsert]: 'XX' }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result[0].p[2]).toBe(0);
  });

  it('T-SI-7: sd start inside inserted region → fold to k+L', () => {
    const op: DeleteStringOTOperation[] = [{ p: [0, 0, 3], [RichDocOTActionName.StringDelete]: 'x' }];
    const other: InsertStringOTOperation[] = [{ p: [0, 0, 2], [RichDocOTActionName.StringInsert]: 'YYY' }];
    // other inserts at 2, length 3, region [2..5); op start=3 is inside
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result[0].p[2]).toBe(5); // k + L = 2 + 3
  });

  it('T-SI-8: sd start before inserted region remains unchanged', () => {
    const op: DeleteStringOTOperation[] = [{ p: [0, 0, 1], [RichDocOTActionName.StringDelete]: 'x' }];
    const other: InsertStringOTOperation[] = [{ p: [0, 0, 3], [RichDocOTActionName.StringInsert]: 'YYY' }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result[0].p[2]).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// transform – otherOp = sd
// ---------------------------------------------------------------------------

describe('RichDocOT transform – other=sd', () => {
  it('T-SD-1: si op.offset <= other.offset → unchanged', () => {
    const op: InsertStringOTOperation[] = [{ p: [0, 0, 1], [RichDocOTActionName.StringInsert]: 'X' }];
    const other: DeleteStringOTOperation[] = [{ p: [0, 0, 3], [RichDocOTActionName.StringDelete]: 'bc' }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result[0].p[2]).toBe(1);
  });

  it('T-SD-2: si op.offset > other.end → -L', () => {
    const op: InsertStringOTOperation[] = [{ p: [0, 0, 7], [RichDocOTActionName.StringInsert]: 'X' }];
    const other: DeleteStringOTOperation[] = [{ p: [0, 0, 2], [RichDocOTActionName.StringDelete]: 'bcd' }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result[0].p[2]).toBe(4);
  });

  it('T-SD-3: si offset inside deleted region → fold to k', () => {
    const op: InsertStringOTOperation[] = [{ p: [0, 0, 4], [RichDocOTActionName.StringInsert]: 'X' }];
    const other: DeleteStringOTOperation[] = [{ p: [0, 0, 2], [RichDocOTActionName.StringDelete]: 'bcd' }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result[0].p[2]).toBe(2);
  });

  it('T-SD-4: sd op after other → offset -L', () => {
    // text = "abcdef"; other deletes "bc" at 1; op deletes "ef" at 4 → new offset = 2
    const op: DeleteStringOTOperation[] = [{ p: [0, 0, 4], [RichDocOTActionName.StringDelete]: 'ef' }];
    const other: DeleteStringOTOperation[] = [{ p: [0, 0, 1], [RichDocOTActionName.StringDelete]: 'bc' }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result[0].p[2]).toBe(2);
  });

  it('T-SD-5: sd op before other → unchanged', () => {
    const op: DeleteStringOTOperation[] = [{ p: [0, 0, 0], [RichDocOTActionName.StringDelete]: 'a' }];
    const other: DeleteStringOTOperation[] = [{ p: [0, 0, 3], [RichDocOTActionName.StringDelete]: 'bc' }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result[0].p[2]).toBe(0);
    expect((result[0] as DeleteStringOTOperation)[RichDocOTActionName.StringDelete]).toBe('a');
  });

  it('T-SD-6: sd partial overlap → shrink', () => {
    // text="abcde"; op deletes "bcd" at 1; other deletes "cde" at 2
    // overlap is "cd" [2..4); op should become "b" at 1
    const op: DeleteStringOTOperation[] = [{ p: [0, 0, 1], [RichDocOTActionName.StringDelete]: 'bcd' }];
    const other: DeleteStringOTOperation[] = [{ p: [0, 0, 2], [RichDocOTActionName.StringDelete]: 'cde' }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result.length).toBe(1);
    expect((result[0] as DeleteStringOTOperation)[RichDocOTActionName.StringDelete]).toBe('b');
  });

  it('T-SD-7: sd fully inside other → noop', () => {
    // text="abcde"; op deletes "bc" at 1; other deletes "abcde" at 0
    const op: DeleteStringOTOperation[] = [{ p: [0, 0, 1], [RichDocOTActionName.StringDelete]: 'bc' }];
    const other: DeleteStringOTOperation[] = [{ p: [0, 0, 0], [RichDocOTActionName.StringDelete]: 'abcde' }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result.length).toBe(0);
  });
});

describe('RichDocOT transformComponent coverage branches', () => {
  it('rebases an attribute across a sibling insert and delete', () => {
    const op: UpdateAttrsOTOperation = { p: [1, 'align'], [RichDocOTActionName.UpdateAttrs]: { value: 'center', prev: 'left' } };
    const insert = { p: [0], ni: makeText('x') };
    const del = { p: [0], nd: makeText('x') };
    const shifted = RichDocOT.transform([op], [insert], OTTransformPriority.LEFT);
    expect(shifted[0].p).toEqual([2, 'align']);
    expect(RichDocOT.transform(shifted, [del], OTTransformPriority.LEFT)).toEqual([op]);
  });
});

// ---------------------------------------------------------------------------
// transform – otherOp = ua
// ---------------------------------------------------------------------------

describe('RichDocOT transform – other=ua', () => {
  it('T-UA-1: ua same path LEFT → op preserved', () => {
    const op: UpdateAttrsOTOperation[] = [
      {
        p: [0, 'align'],
        [RichDocOTActionName.UpdateAttrs]: { value: 'center', prev: 'left' },
      },
    ];
    const other: UpdateAttrsOTOperation[] = [
      {
        p: [0, 'align'],
        [RichDocOTActionName.UpdateAttrs]: { value: 'right', prev: 'left' },
      },
    ];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result.length).toBe(1);
    expect((result[0] as UpdateAttrsOTOperation)[RichDocOTActionName.UpdateAttrs].value).toBe('center');
  });

  it('T-UA-2: ua same path RIGHT → noop', () => {
    const op: UpdateAttrsOTOperation[] = [
      {
        p: [0, 'align'],
        [RichDocOTActionName.UpdateAttrs]: { value: 'center', prev: 'left' },
      },
    ];
    const other: UpdateAttrsOTOperation[] = [
      {
        p: [0, 'align'],
        [RichDocOTActionName.UpdateAttrs]: { value: 'right', prev: 'left' },
      },
    ];
    const result = RichDocOT.transform(op, other, OTTransformPriority.RIGHT);
    expect(result.length).toBe(0);
  });

  it('T-UA-3: ua different path → unchanged', () => {
    const op: UpdateAttrsOTOperation[] = [
      {
        p: [0, 'align'],
        [RichDocOTActionName.UpdateAttrs]: { value: 'center', prev: 'left' },
      },
    ];
    const other: UpdateAttrsOTOperation[] = [
      {
        p: [1, 'align'],
        [RichDocOTActionName.UpdateAttrs]: { value: 'right', prev: 'left' },
      },
    ];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result.length).toBe(1);
    expect(result[0].p).toEqual([0, 'align']);
  });
});

// ---------------------------------------------------------------------------
// transform – cross-type no-conflict
// ---------------------------------------------------------------------------

describe('RichDocOT transform – cross-type no-conflict', () => {
  it('T-CROSS-1: ni vs si different paths → both unchanged', () => {
    const op: InsertNodeOTOperation[] = [{ p: [2], [RichDocOTActionName.NodeInsert]: makeParagraph({}) }];
    const other: InsertStringOTOperation[] = [{ p: [0, 0, 2], [RichDocOTActionName.StringInsert]: 'x' }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result[0].p).toEqual([2]);
  });

  it('T-CROSS-2: ua vs si → both unchanged', () => {
    const op: UpdateAttrsOTOperation[] = [
      {
        p: [0, 'align'],
        [RichDocOTActionName.UpdateAttrs]: { value: 'center', prev: 'left' },
      },
    ];
    const other: InsertStringOTOperation[] = [{ p: [0, 0, 2], [RichDocOTActionName.StringInsert]: 'x' }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result[0].p).toEqual([0, 'align']);
  });

  it('T-CROSS-3: nd vs ua different nodes → both unchanged', () => {
    const op: DeleteNodeOTOperation[] = [{ p: [1], [RichDocOTActionName.NodeDelete]: makeParagraph({}) }];
    const other: UpdateAttrsOTOperation[] = [
      {
        p: [0, 'align'],
        [RichDocOTActionName.UpdateAttrs]: { value: 'center', prev: 'left' },
      },
    ];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result[0].p).toEqual([1]);
  });

  it('T-CROSS-4: unknown other op key falls back to unchanged', () => {
    const op: InsertNodeOTOperation[] = [{ p: [1], [RichDocOTActionName.NodeInsert]: makeParagraph({}) }];
    const other = [{ p: [0], xx: true }] as unknown as RichDocOTOperation[];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result).toEqual(op);
  });
});

describe('RichDocOT private helpers through transform', () => {
  it('H1: adjustPathForNodeInsert returns unchanged when op path is shorter than parentLen', () => {
    const op = [{ p: [9], [RichDocOTActionName.UpdateAttrs]: { value: 1, prev: 0 } }] as RichDocOTOperation[];
    const other = [{ p: [0, 0], [RichDocOTActionName.NodeInsert]: makeText('x') }] as InsertNodeOTOperation[];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result[0].p).toEqual([9]);
  });

  it('H2: adjustPathForNodeInsert returns unchanged on ancestor mismatch', () => {
    const op = [{ p: [1, 0, 2], [RichDocOTActionName.StringInsert]: 'x' }] as InsertStringOTOperation[];
    const other = [{ p: [0, 1], [RichDocOTActionName.NodeInsert]: makeText('x') }] as InsertNodeOTOperation[];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result[0].p).toEqual([1, 0, 2]);
  });

  it('H3: adjustPathForNodeInsert returns unchanged for non-number path segment', () => {
    const op = [
      { p: ['x', 'align'], [RichDocOTActionName.UpdateAttrs]: { value: 1, prev: 0 } },
    ] as RichDocOTOperation[];
    const other = [{ p: [0], [RichDocOTActionName.NodeInsert]: makeText('x') }] as InsertNodeOTOperation[];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result[0].p).toEqual(['x', 'align']);
  });

  it('H4: adjustPathForNodeInsert increments when op index equals inserted index', () => {
    const op = [{ p: [1, 'align'], [RichDocOTActionName.UpdateAttrs]: { value: 1, prev: 0 } }] as RichDocOTOperation[];
    const other = [{ p: [1], [RichDocOTActionName.NodeInsert]: makeText('x') }] as InsertNodeOTOperation[];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);
    expect(result[0].p).toEqual([2, 'align']);
  });

  it('H5: private adjustPathForNodeDelete nullifies deep path through deleted node', () => {
    const op = {
      p: [0, 2, 'align'],
      [RichDocOTActionName.UpdateAttrs]: { value: 1, prev: 0 },
    } as UpdateAttrsOTOperation;
    const adjusted = adjustPathForNodeDelete(clone(op), [0, 2], 2);
    expect(adjusted).toBeNull();
  });

  it('H6: private adjustPathForNodeDelete returns unchanged on short path', () => {
    const op = {
      p: [9],
      [RichDocOTActionName.UpdateAttrs]: { value: 1, prev: 0 },
    } as UpdateAttrsOTOperation;
    const adjusted = adjustPathForNodeDelete(clone(op), [0, 0], 0);
    expect(adjusted).toEqual(op);
  });

  it('H7: private adjustPathForNodeDelete returns unchanged on ancestor mismatch', () => {
    const op = {
      p: [1, 0, 2],
      [RichDocOTActionName.StringInsert]: 'x',
    } as InsertStringOTOperation;
    const adjusted = adjustPathForNodeDelete(clone(op), [0, 0], 0);
    expect(adjusted).toEqual(op);
  });

  it('H8: private adjustPathForNodeDelete returns unchanged for non-number index segment', () => {
    const op = {
      p: ['x', 'align'],
      [RichDocOTActionName.UpdateAttrs]: { value: 1, prev: 0 },
    } as unknown as RichDocOTOperation;
    const adjusted = adjustPathForNodeDelete(clone(op), [0], 0);
    expect(adjusted).toEqual(op);
  });

  it('H9: transform hits adjusted===null branch when path delete-adjuster returns null', () => {
    const op: UpdateAttrsOTOperation[] = [
      {
        p: [0, 'align'],
        [RichDocOTActionName.UpdateAttrs]: { value: 'center', prev: 'left' },
      },
    ];
    const other: DeleteNodeOTOperation[] = [{ p: [0], [RichDocOTActionName.NodeDelete]: makeText('x') }];
    const result = RichDocOT.transform(op, other, OTTransformPriority.LEFT);

    expect(result).toEqual([]);
  });

  it('H10: covers remaining transformComponent false branches for node/string operations', () => {
    // sameLevelParent loop false branch on equal ancestor segments.
    const sameParent = RichDocOT.transform(
      [{ p: [0, 1, 2], [RichDocOTActionName.NodeInsert]: makeText('x') } as InsertNodeOTOperation],
      [{ p: [0, 1, 3], [RichDocOTActionName.NodeInsert]: makeText('y') } as InsertNodeOTOperation],
      OTTransformPriority.LEFT,
    );
    expect(sameParent.length).toBe(1);

    // NodeInsert(other) + NodeMove(op): target <= otherIdx branch.
    const nodeInsertVsMove = RichDocOT.transform(
      [{ p: [2], [RichDocOTActionName.NodeMove]: [1] } as MoveNodeOTOperation],
      [{ p: [1], [RichDocOTActionName.NodeInsert]: makeText('y') } as InsertNodeOTOperation],
      OTTransformPriority.LEFT,
    );
    expect(nodeInsertVsMove.length).toBe(1);

    // NodeDelete(other) + NodeMove(op): opIdx <= otherIdx and moveTarget <= otherIdx branches.
    const nodeDeleteVsMove = RichDocOT.transform(
      [{ p: [1], [RichDocOTActionName.NodeMove]: [1] } as MoveNodeOTOperation],
      [{ p: [2], [RichDocOTActionName.NodeDelete]: makeText('y') } as DeleteNodeOTOperation],
      OTTransformPriority.LEFT,
    );
    expect(nodeDeleteVsMove.length).toBe(1);

    // NodeMove(other) with non-node op to hit sameLevelParent false arm.
    const crossTypeNodeMove = RichDocOT.transform(
      [{ p: [0, 0, 1], [RichDocOTActionName.StringInsert]: 'x' } as InsertStringOTOperation],
      [{ p: [0], [RichDocOTActionName.NodeMove]: [1] } as MoveNodeOTOperation],
      OTTransformPriority.LEFT,
    );
    expect(crossTypeNodeMove.length).toBe(1);

    // StringInsert(other): StringDelete(op) with offset before inserted region.
    const stringInsertVsDelete = RichDocOT.transform(
      [{ p: [0, 0, 0], [RichDocOTActionName.StringDelete]: 'a' } as DeleteStringOTOperation],
      [{ p: [0, 0, 2], [RichDocOTActionName.StringInsert]: 'bb' } as InsertStringOTOperation],
      OTTransformPriority.LEFT,
    );
    expect(stringInsertVsDelete.length).toBe(1);

    // StringDelete(other) with different text node (sameTextNode false).
    const stringDeleteDifferentNode = RichDocOT.transform(
      [{ p: [0, 1, 0], [RichDocOTActionName.StringInsert]: 'x' } as InsertStringOTOperation],
      [{ p: [0, 0, 0], [RichDocOTActionName.StringDelete]: 'ab' } as DeleteStringOTOperation],
      OTTransformPriority.LEFT,
    );
    expect(stringDeleteDifferentNode.length).toBe(1);
  });

  it('H11: hits string-delete overlap branch that returns null when rewritten text becomes empty', () => {
    const op: DeleteStringOTOperation = { p: [0, 0, 1], sd: 'zz' };
    const other: DeleteStringOTOperation = { p: [0, 0, 0], sd: 'zzz' };
    expect(RichDocOT.transform([op], [other], OTTransformPriority.LEFT)).toEqual([]);
  });

  it('H12: covers direct helper branches for adjustPathForNodeInsert/Delete', () => {
    const adjustInsert = adjustPathForNodeInsert;

    const adjustedInsert = adjustInsert(
      { p: [2, 5, 'x'], [RichDocOTActionName.UpdateAttrs]: { value: 1, prev: 0 } } as unknown as RichDocOTOperation,
      [2, 3],
      3,
    );
    expect(adjustedInsert.p).toEqual([2, 6, 'x']);

    const adjustDelete = adjustPathForNodeDelete;

    const adjustedDelete = adjustDelete(
      { p: [0, 1], [RichDocOTActionName.StringInsert]: 'x' } as unknown as RichDocOTOperation,
      [0, 2],
      2,
    );
    expect(adjustedDelete).not.toBeNull();
    expect((adjustedDelete as RichDocOTOperation).p).toEqual([0, 1]);
  });
});

// ---------------------------------------------------------------------------
// Convergence (diamond property)
// ---------------------------------------------------------------------------

describe('RichDocOT convergence', () => {
  function applyAll(doc: NodeSchema, ops: RichDocOTOperation[]): NodeSchema {
    return RichDocOT.apply(clone(doc), ops);
  }

  function converges(doc: NodeSchema, A: RichDocOTOperation[], B: RichDocOTOperation[]) {
    const Ap = RichDocOT.transform(clone(A), clone(B), OTTransformPriority.LEFT);
    const Bp = RichDocOT.transform(clone(B), clone(A), OTTransformPriority.RIGHT);
    const stateAB = applyAll(applyAll(doc, A), Bp);
    const stateBA = applyAll(applyAll(doc, B), Ap);
    expect(stateAB).toEqual(stateBA);
  }

  it('CV-1: concurrent si at same offset', () => {
    const doc = makeDoc(makeParagraph({}, makeText('ab')));
    const A: InsertStringOTOperation[] = [{ p: [0, 0, 1], [RichDocOTActionName.StringInsert]: 'X' }];
    const B: InsertStringOTOperation[] = [{ p: [0, 0, 1], [RichDocOTActionName.StringInsert]: 'Y' }];
    converges(doc, A, B);
  });

  it('CV-2: ni at same index vs nd at same index', () => {
    const para0 = makeParagraph({}, makeText('a'));
    const para1 = makeParagraph({}, makeText('b'));
    const doc = makeDoc(para0, para1);
    const A: InsertNodeOTOperation[] = [{ p: [0], [RichDocOTActionName.NodeInsert]: makeParagraph({}) }];
    const B: DeleteNodeOTOperation[] = [{ p: [0], [RichDocOTActionName.NodeDelete]: clone(para0) }];
    converges(doc, A, B);
  });

  it('CV-3: concurrent ua on same attr (LEFT wins)', () => {
    const doc = makeDoc(makeParagraph({ align: 'left' }, makeText('a')));
    const A: UpdateAttrsOTOperation[] = [
      {
        p: [0, 'align'],
        [RichDocOTActionName.UpdateAttrs]: { value: 'center', prev: 'left' },
      },
    ];
    const B: UpdateAttrsOTOperation[] = [
      {
        p: [0, 'align'],
        [RichDocOTActionName.UpdateAttrs]: { value: 'right', prev: 'left' },
      },
    ];
    converges(doc, A, B);
    // final state should have 'center' (LEFT wins)
    const Bp = RichDocOT.transform(clone(B), clone(A), OTTransformPriority.RIGHT);
    const final = applyAll(applyAll(doc, A), Bp);
    expect((final.content![0] as NodeSchema).attrs!['align']).toBe('center');
  });

  it('CV-4: concurrent overlapping sd', () => {
    const doc = makeDoc(makeParagraph({}, makeText('abcd')));
    // A deletes "b" at offset 1
    const A: DeleteStringOTOperation[] = [{ p: [0, 0, 1], [RichDocOTActionName.StringDelete]: 'b' }];
    // B deletes "bc" at offset 1
    const B: DeleteStringOTOperation[] = [{ p: [0, 0, 1], [RichDocOTActionName.StringDelete]: 'bc' }];
    converges(doc, A, B);
  });
});
