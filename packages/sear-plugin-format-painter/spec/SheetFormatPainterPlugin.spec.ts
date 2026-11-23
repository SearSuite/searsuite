import { SheetCommandBus } from '@searsuite/sear-assembly-commands';
import { type Pipeline } from '@searsuite/sear-assembly-core';
import { PluginKey, SheetFormatTransferRegistry, createMatrixFormatTransfer } from '@searsuite/sear-assembly-plugin';
import { NodePlatform as HeadlessPlatform } from '@searsuite/sear-node-adapters';
import { ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import {
  ApplyFormatPainterCommand,
  CancelFormatPainterCommand,
  FormatPainterMode,
  FormatPainterObservation,
  SheetFormatPainterPlugin,
  StartFormatPainterCommand,
} from '../src';

const range = (row: number, column: number, endRow = row, endColumn = column) => ({
  start: [row, column] as const,
  end: [endRow, endColumn] as const,
});
function harness() {
  const values = new Map<string, string>();
  const reads = jest.fn();
  const formats = new SheetFormatTransferRegistry();
  formats.register(
    createMatrixFormatTransfer('test.fill', new PluginKey('fill'), () => ({
      getItem: (row, column) => values.get(`${row}:${column}`) ?? null,
      forEachStoredInRange: (sr, sc, er, ec, visit) => {
        reads();
        values.forEach((value, key) => {
          const [row, column] = key.split(':').map(Number);
          if (row >= sr && row <= er && column >= sc && column <= ec) visit(value, row, column);
        });
      },
    })),
  );
  const platform = new HeadlessPlatform();
  const plugin = new SheetFormatPainterPlugin({ formats, platform, readShape: () => [20, 20] });
  const commands = new SheetCommandBus(platform);
  const observations = new ObservationRegistry();
  plugin.registerCommands(commands);
  plugin.registerObservations(observations);
  let last: Pipeline | undefined;
  commands.bind({
    executePipeline: (pipeline) => {
      last = pipeline;
      pipeline.steps.forEach((step) => step.localAction?.());
      pipeline.emitComplete(false);
    },
    applyEffect: () => undefined,
  });
  return { values, formats, commands, observations, reads, last: () => last, plugin };
}

describe('Sheet format painter', () => {
  it('captures an immutable sparse pattern, expands a single target and clears the once session', () => {
    const h = harness();
    h.values.set('0:0', '#ff0000');
    h.values.set('0:1', '#0000ff');
    h.commands.run(StartFormatPainterCommand, { source: range(0, 0, 0, 1) });
    h.values.set('0:0', '#00ff00');
    const input = range(2, 3);
    h.commands.run(ApplyFormatPainterCommand, { destination: input });
    expect(h.last()!.steps[0].transaction!.operations).toEqual([
      { p: [2, 3], uc: { value: '#ff0000', prev: null } },
      { p: [2, 4], uc: { value: '#0000ff', prev: null } },
    ]);
    expect(h.observations.getSnapshot(FormatPainterObservation).mode).toBeNull();
    expect(h.reads).toHaveBeenCalledTimes(1);
  });

  it('BUG-946 applies the source first row when a multi-row brush reaches the last sheet row', () => {
    const h = harness();
    h.values.set('0:0', '#ff0000');
    h.values.set('1:0', '#00ff00');
    h.commands.run(StartFormatPainterCommand, { source: range(0, 0, 1, 0) });

    h.commands.run(ApplyFormatPainterCommand, { destination: range(19, 3) });

    expect(h.last()!.steps[0].transaction!.operations).toEqual([
      { p: [19, 3], uc: { value: '#ff0000', prev: null } },
    ]);
    expect(h.observations.getSnapshot(FormatPainterObservation).mode).toBeNull();
  });

  it('tiles a pattern, replaces defaults and remains active until cancellation', () => {
    const h = harness();
    h.values.set('0:0', '#ff0000');
    h.values.set('2:3', '#0000ff');
    h.commands.run(StartFormatPainterCommand, { source: range(0, 0, 0, 1), mode: FormatPainterMode.Persistent });
    h.commands.run(ApplyFormatPainterCommand, { destination: range(2, 2, 3, 4) });
    const operations = h.last()!.steps[0].transaction!.operations;
    expect(operations).toHaveLength(5);
    expect(operations).toContainEqual({ p: [2, 3], uc: { value: null, prev: '#0000ff' } });
    expect(h.observations.getSnapshot(FormatPainterObservation).mode).toBe(FormatPainterMode.Persistent);
    h.commands.run(CancelFormatPainterCommand, void 0);
    h.commands.run(ApplyFormatPainterCommand, { destination: range(1, 1) });
    expect(h.last()!.steps).toHaveLength(0);
  });

  it('does not expose the active format session as writable properties', () => {
    const h = harness();
    expect(() => h.plugin.registerCommands(new SheetCommandBus())).toThrow('already bound');
    h.commands.run(StartFormatPainterCommand, { source: range(0, 0) });
    (h.plugin as unknown as { snapshot: null; status: { mode: null; source: null } }).snapshot = null;
    (h.plugin as unknown as { snapshot: null; status: { mode: null; source: null } }).status = {
      mode: null, source: null,
    };
    expect(h.observations.getSnapshot(FormatPainterObservation).mode).toBe(FormatPainterMode.Once);
  });

  it('keeps the session when range validation fails', () => {
    const h = harness();
    h.commands.run(StartFormatPainterCommand, { source: range(0, 0) });
    expect(() => h.commands.run(ApplyFormatPainterCommand, { destination: range(20, 0) })).toThrow();
    expect(h.observations.getSnapshot(FormatPainterObservation).mode).toBe(FormatPainterMode.Once);
    expect(() => h.commands.run(StartFormatPainterCommand, { source: range(NaN, 0) })).toThrow();
    expect(() => h.formats.register({ id: 'test.fill', capture: () => ({ plan: () => [] }) })).toThrow();
  });

  it('retains the source session when owner planning fails before execution', () => {
    const h = harness();
    h.formats.register({
      id: 'third-party-failure',
      capture: () => ({
        plan: () => {
          throw new Error('owner rejected');
        },
      }),
    });
    h.commands.run(StartFormatPainterCommand, { source: range(0, 0) });
    expect(() => h.commands.run(ApplyFormatPainterCommand, { destination: range(1, 1) })).toThrow('owner rejected');
    expect(h.observations.getSnapshot(FormatPainterObservation).mode).toBe(FormatPainterMode.Once);
  });

  it('isolates editors and protects state from failing listeners', () => {
    const a = harness();
    const b = harness();
    jest.spyOn(HeadlessPlatform.prototype, 'warn').mockImplementation(() => undefined);
    a.observations.subscribe(FormatPainterObservation, () => {
      throw new Error('listener');
    });
    a.commands.run(StartFormatPainterCommand, { source: range(0, 0) });
    expect(a.observations.getSnapshot(FormatPainterObservation).mode).toBe(FormatPainterMode.Once);
    expect(b.observations.getSnapshot(FormatPainterObservation).mode).toBeNull();
    a.plugin.destroy();
    a.plugin.destroy();
    jest.restoreAllMocks();
  });

  it('does not lend command write authority to status observers', () => {
    const h = harness();
    const authority: boolean[] = [];
    h.observations.subscribe(FormatPainterObservation, () => authority.push(h.commands.isExecuting()));
    h.commands.run(StartFormatPainterCommand, { source: range(0, 0) });
    h.commands.run(CancelFormatPainterCommand, void 0);
    expect(authority.length).toBeGreaterThan(2);
    expect(authority.every((value) => value === false)).toBe(true);
  });
});

it('clears an unformatted million-row range by visiting only stored target formats', () => {
  const read = jest.fn(() => '#ff0000');
  let scanningSource = true;
  const transfer = createMatrixFormatTransfer('sparse', new PluginKey('sparse'), () => ({
    getItem: read,
    forEachStoredInRange: (_sr, _sc, _er, _ec, visit) => {
      if (scanningSource) return;
      visit('#ff0000', 999999, 0);
    },
  }));
  const snapshot = transfer.capture(range(0, 0));
  scanningSource = false;
  const plans = snapshot.plan(range(0, 0, 999999, 0));
  expect(read).not.toHaveBeenCalled();
  expect(plans[0].operations).toEqual([{ p: [999999, 0], uc: { value: null, prev: '#ff0000' } }]);
});
