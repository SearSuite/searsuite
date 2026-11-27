import { Pipeline } from '@searsuite/sear-assembly-plugin';
import { createTransaction } from '@searsuite/sear-domain-transaction';
import { RectOTActionName, MatrixOTActionName, RichDocOTActionName } from '@searsuite/sear-domain-ot';
import { PluginKey } from '@searsuite/sear-assembly-plugin';

describe('Pipeline', () => {
  it('addCustom and custom step detail', () => {
    const p = new Pipeline('test');
    p.addCustom('myCustomStep', 'custom-kind', { foo: 'bar' });
    expect(p.steps).toHaveLength(1);
    expect(p.steps[0].kind).toBe('custom-kind');
    expect(p.steps[0].name).toBe('myCustomStep');
    expect(p.steps[0].data).toEqual({ foo: 'bar' });

    let detailReceived = '';
    p.use({
      onStepStart(step, pipeline, detail) {
        detailReceived = detail;
      },
    });
    p.emitStepStart(p.steps[0]);
    expect(detailReceived).toBe('myCustomStep');
  });

  it('fmtValue covers null, string truncation, objects and others', () => {
    const tx = createTransaction({} as any);
    const longString = '123456789012345678901234567890';
    tx.operations.push({
      p: [0, 0],
      [MatrixOTActionName.UpdateCell]: { value: null, prev: { type: 'MyObj' } },
    } as any);
    tx.operations.push({
      p: [1, 1],
      [MatrixOTActionName.UpdateCell]: { value: longString, prev: 'short' },
    } as any);
    tx.operations.push({
      p: [2, 2],
      [MatrixOTActionName.UpdateCell]: { value: 123 },
    } as any);
    const p = Pipeline.fromTransaction('test', tx);

    let detailReceived = '';
    p.use({
      onStepStart(step, pipeline, detail) {
        detailReceived = detail;
      },
    });
    p.emitStepStart(p.steps[0]);
    expect(detailReceived).toContain('set R0C0 = ∅');
    expect(detailReceived).toContain('set R1C1 = "12345678901234567…"');
    expect(detailReceived).toContain('set R2C2 = 123');
  });

  it('fmtPath covers different lengths', () => {
    const tx = createTransaction({} as any);
    tx.operations.push({ p: [], [RichDocOTActionName.StringInsert]: 'a' } as any);
    tx.operations.push({ p: [0], [RichDocOTActionName.StringInsert]: 'b' } as any);
    tx.operations.push({ p: [0, 1], [RichDocOTActionName.StringInsert]: 'c' } as any);
    tx.operations.push({ p: [0, 1, 2], [RichDocOTActionName.StringInsert]: 'd' } as any);
    const p = Pipeline.fromTransaction('test', tx);

    let detailReceived = '';
    p.use({
      onStepStart(step, pipeline, detail) {
        detailReceived = detail;
      },
    });
    p.emitStepStart(p.steps[0]);
    expect(detailReceived).toContain('at root');
    expect(detailReceived).toContain('at [0]');
    expect(detailReceived).toContain('at para[0].node[1]');
    expect(detailReceived).toContain('at para[0].node[1].2');
  });

  it('summarizeTransaction covers Matrix and RichDoc operations', () => {
    const tx = createTransaction({} as any);

    tx.operations.push({ p: [0], [MatrixOTActionName.RowInsert]: true } as any);
    tx.operations.push({ p: [1], [MatrixOTActionName.RowDelete]: true } as any);
    tx.operations.push({ p: [2], [MatrixOTActionName.RowMove]: true } as any);
    tx.operations.push({ p: [0], [MatrixOTActionName.ColInsert]: true } as any);
    tx.operations.push({ p: [1], [MatrixOTActionName.ColDelete]: true } as any);
    tx.operations.push({ p: [2], [MatrixOTActionName.ColMove]: true } as any);

    const longString = '123456789012345678901234567890';
    tx.operations.push({ p: [0, 0, 0], [RichDocOTActionName.StringDelete]: longString } as any);
    tx.operations.push({ p: [0, 0, 0], [RichDocOTActionName.NodeInsert]: { tag: 'img' } } as any);
    tx.operations.push({ p: [0, 0, 0], [RichDocOTActionName.NodeInsert]: {} } as any);
    tx.operations.push({ p: [0, 0, 0], [RichDocOTActionName.NodeDelete]: { tag: 'img' } } as any);
    tx.operations.push({ p: [0, 0, 0], [RichDocOTActionName.NodeDelete]: {} } as any);
    tx.operations.push({ p: [0, 0, 0], [RichDocOTActionName.NodeMove]: [5] } as any);
    tx.operations.push({
      p: [0, 0, 0],
      [RichDocOTActionName.UpdateAttrs]: { value: { bold: true }, prev: { bold: false } },
    } as any);

    tx.operations.push({ p: [9], UnknownAction: true } as any);
    tx.operations.push({ p: [9], UnknownAction: true } as any);

    const p = Pipeline.fromTransaction('test', tx);
    let detailReceived = '';
    p.use({
      onStepStart(step, pipeline, detail) {
        detailReceived = detail;
      },
    });
    p.emitStepStart(p.steps[0]);

    expect(detailReceived).toContain('insert row at 0');
    expect(detailReceived).toContain('delete row at 1');
    expect(detailReceived).toContain('move row 2');
    expect(detailReceived).toContain('insert col at 0');
    expect(detailReceived).toContain('delete col at 1');
    expect(detailReceived).toContain('move col 2');
    expect(detailReceived).toContain('-"12345678901234567…" at para[0].node[0].0');
    expect(detailReceived).toContain('+<img> at para[0].node[0].0');
    expect(detailReceived).toContain('+<node> at para[0].node[0].0');
    expect(detailReceived).toContain('-<img> at para[0].node[0].0');
    expect(detailReceived).toContain('-<node> at para[0].node[0].0');
    expect(detailReceived).toContain('move node → 5 at para[0].node[0].0');
    expect(detailReceived).toContain('attrs at para[0].node[0].0: {"bold":true} → {"bold":false}');
    expect(detailReceived).toContain('UnknownAction [9]');
  });

  it('covers remaining branches in fmtValue', () => {
    const tx = createTransaction({} as any);
    tx.operations.push({
      p: [0, 0],
      [MatrixOTActionName.UpdateCell]: { value: { type: 'Hello' } },
    } as any);
    const p = Pipeline.fromTransaction('test', tx);
    let detailReceived = '';
    p.use({
      onStepStart(step, pipeline, detail) {
        detailReceived = detail;
      },
    });
    p.emitStepStart(p.steps[0]);
    expect(detailReceived).toContain('{Hello}');
  });

  it('describes independent projection invalidations and interaction steps', () => {
    const p = new Pipeline('test');
    const key = new PluginKey('test-plugin');
    p.invalidate('stepR', key);
    p.invalidate('stepPR', key);
    p.addInteraction('stepInt', { type: 'MY_INTERACTION' } as any);

    const details: string[] = [];
    p.use({
      onStepStart(step, pipeline, detail) {
        details.push(detail);
      },
    });

    for (const step of p.steps) {
      p.emitStepStart(step);
    }

    expect(details[0]).toBe(`invalidate ${key.key}`);
    expect(details[1]).toBe(`invalidate ${key.key}`);
    expect(details[2]).toBe('MY_INTERACTION');
  });

  it('describes rectangle transactions after an invalidation', () => {
    const p = Pipeline.fromInvalidation('my-render', new PluginKey('test'));

    const tx = createTransaction({} as any);
    tx.operations.push({
      p: [0, 0],
      [RectOTActionName.UpdateRect]: [
        [1, 2],
        [3, 4],
      ],
    } as any);
    p.addTransaction('test', tx);

    let detailReceived = '';
    p.use({
      onStepStart(step, pipeline, detail) {
        detailReceived = detail;
      },
    });
    p.emitStepStart(p.steps[1]); // the transaction step
    expect(detailReceived).toContain('select R1C2:R3C4');
  });

  it('covers emit methods', () => {
    const p = new Pipeline('test');
    let startEmitted = false;
    let completeEmitted = false;
    let stepCompleteEmitted = false;
    p.use({
      onStart() {
        startEmitted = true;
      },
      onComplete() {
        completeEmitted = true;
      },
      onStepComplete(step) {
        stepCompleteEmitted = true;
      },
    });
    p.emitStart();
    p.emitComplete();
    p.emitStepComplete({ name: 'foo', kind: 'bar' });

    expect(startEmitted).toBe(true);
    expect(completeEmitted).toBe(true);
    expect(stepCompleteEmitted).toBe(true);
  });

  it('covers remaining branches', () => {
    // empty transaction
    const emptyTx = createTransaction({} as any);
    const p1 = Pipeline.fromTransaction('test', emptyTx);
    let detailReceived = '';
    p1.use({
      onStepStart(step, pipeline, detail) {
        detailReceived = detail;
      },
    });
    p1.emitStepStart(p1.steps[0]);
    expect(detailReceived).toBe('(empty)');

    // fmtValue short string
    const tx2 = createTransaction({} as any);
    tx2.operations.push({
      p: [0, 0],
      [MatrixOTActionName.UpdateCell]: { value: 'short', prev: 'short' },
    } as any);
    const p2 = Pipeline.fromTransaction('test', tx2);
    p2.use({
      onStepStart(s, p, d) {
        detailReceived = d;
      },
    });
    p2.emitStepStart(p2.steps[0]);
    expect(detailReceived).toContain('set R0C0 = "short"');

    // RichDocOT string lengths
    const tx3 = createTransaction({} as any);
    tx3.operations.push({ p: [0], [RichDocOTActionName.StringInsert]: '123456789012345678901' } as any); // >20
    tx3.operations.push({ p: [0], [RichDocOTActionName.StringDelete]: 'short' } as any); // <=20
    const p3 = Pipeline.fromTransaction('test', tx3);
    p3.use({
      onStepStart(s, p, d) {
        detailReceived = d;
      },
    });
    p3.emitStepStart(p3.steps[0]);
    expect(detailReceived).toContain('+"12345678901234567…" at [0]');
    expect(detailReceived).toContain('-"short" at [0]');

    // Empty hooks
    const p4 = new Pipeline('test');
    p4.use({});
    p4.emitStart();
    p4.emitStepStart({ name: 'test', kind: 'test' });
    p4.emitStepComplete({ name: 'test', kind: 'test' });
    p4.emitComplete();
    // Should not crash
  });
});
