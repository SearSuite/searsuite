import { SheetCommandBus } from '@searsuite/sear-assembly-commands';
import { PluginKey, SheetFormatTransferRegistry, createMatrixFormatTransfer } from '@searsuite/sear-assembly-plugin';
import { SearError } from '@searsuite/sear-foundation-error';
import { ClearRangeStylesCommand, SheetClearStylePlugin } from '../src';

function createHarness() {
  const formats = new SheetFormatTransferRegistry();
  const commands = new SheetCommandBus();
  new SheetClearStylePlugin({ formats, readShape: () => [1000000, 10] }).registerCommands(commands);
  const execute = jest.fn();
  commands.bind({ executePipeline: execute, applyEffect: () => undefined });
  return { commands, formats, execute };
}

it('normalizes reverse ranges and composes third-party owner plans in one pipeline', () => {
  const h = createHarness();
  const target = new PluginKey('custom');
  const clear = jest.fn(() => [{ target, operations: [{ p: [1, 1], uc: { value: null, prev: 'custom-style' } }] }]);
  h.formats.register({ id: 'custom', capture: () => ({ plan: () => [] }), clear });
  h.commands.run(ClearRangeStylesCommand, { anchor: [3, 4], focus: [1, 1] });
  expect(clear).toHaveBeenCalledWith({ start: [1, 1], end: [3, 4] });
  expect(h.execute).toHaveBeenCalledTimes(1);
  expect(h.execute.mock.calls[0][0].steps[0].transaction.pluginKey).toBe(target);
});

it('clears separate ranges in one pipeline and validates every range before planning', () => {
  const h = createHarness();
  const target = new PluginKey('custom');
  const clear = jest.fn((range) => [{
    target,
    operations: [{ p: range.start, uc: { value: null, prev: 'custom-style' } }],
  }]);
  h.formats.register({ id: 'custom', clear });
  h.commands.run(ClearRangeStylesCommand, {
    ranges: [
      { anchor: [19, 1], focus: [19, 1] },
      { anchor: [19, 3], focus: [19, 3] },
    ],
  });
  expect(clear).toHaveBeenCalledTimes(2);
  expect(h.execute).toHaveBeenCalledTimes(1);
  expect(h.execute.mock.calls[0][0].steps).toHaveLength(2);

  expect(() => h.commands.run(ClearRangeStylesCommand, {
    ranges: [
      { anchor: [19, 1], focus: [19, 1] },
      { anchor: [1000000, 3], focus: [1000000, 3] },
    ],
  })).toThrow(SearError);
  expect(clear).toHaveBeenCalledTimes(2);
  expect(h.execute).toHaveBeenCalledTimes(1);
});

it('clears a million-row range by visiting sparse entries and creates no default entries', () => {
  const h = createHarness();
  const read = jest.fn();
  h.formats.register(
    createMatrixFormatTransfer('sparse', new PluginKey('sparse'), () => ({
      getItem: read,
      forEachStoredInRange: (_sr, _sc, _er, _ec, visit) => visit('#ff0000', 999999, 0),
    })),
  );
  h.commands.run(ClearRangeStylesCommand, { anchor: [0, 0], focus: [999999, 0] });
  expect(read).not.toHaveBeenCalled();
  expect(h.execute.mock.calls[0][0].steps[0].transaction.operations).toEqual([
    { p: [999999, 0], uc: { value: null, prev: '#ff0000' } },
  ]);
});

it.each([
  [NaN, 1],
  [-1, 0],
  [1000000, 0],
  [0, Infinity],
  [0, 10],
  [0, 1.5],
])('rejects invalid corners before planning %s,%s', (row, column) => {
  const h = createHarness();
  expect(() => h.commands.run(ClearRangeStylesCommand, { anchor: [row, column], focus: [0, 0] })).toThrow(SearError);
  expect(h.execute).not.toHaveBeenCalled();
});

it('does not execute any partial pipeline when an owner rejects planning', () => {
  const h = createHarness();
  h.formats.register({
    id: 'reject',
    capture: () => ({ plan: () => [] }),
    clear: () => {
      throw new SearError('rejected');
    },
  });
  expect(() => h.commands.run(ClearRangeStylesCommand, { anchor: [0, 0], focus: [0, 0] })).toThrow('rejected');
  expect(h.execute).not.toHaveBeenCalled();
});

it('supports capture-only extensions, no-op clearing, and idempotent unregister', () => {
  const h = createHarness();
  const dispose = h.formats.register({ id: 'captureOnly', capture: () => ({ plan: () => [] }) });
  h.commands.run(ClearRangeStylesCommand, { anchor: [0, 0], focus: [0, 0] });
  expect(h.execute.mock.calls[0][0].steps).toHaveLength(0);
  dispose();
  dispose();
});
