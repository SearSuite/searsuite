import { PluginKey } from '@searsuite/sear-assembly-plugin';
import { MatrixOTActionName, createUpdateCellOTOperation } from '@searsuite/sear-domain-ot';
import { SheetMatrix } from '@searsuite/sear-domain-sheet';
import { DefaultSheetClipboardCodec } from '../src/DefaultSheetClipboardCodec';
import {
  CopyRangeCommand,
  CutRangeCommand,
  CancelCutRangeCommand,
  PasteRangeCommand,
  SheetClipboardPlugin,
} from '../src/SheetClipboardCommands';
import { type SheetClipboardDataSource, type SheetClipboardPayload } from '../src/SheetClipboardContracts';
import { SheetClipboardCutSession } from '../src/SheetClipboardCutSession';
import { SheetClipboardError, SheetClipboardErrorCode } from '../src/SheetClipboardErrors';
import { SheetCommandBus } from '@searsuite/sear-assembly-commands';
import { Pipeline } from '@searsuite/sear-assembly-plugin';
import { CellClipboardCodecRegistry, CellFormats, type CellFormat } from '@searsuite/sear-domain-cell-types';
import { createFormulaCellClipboardCodec } from '@searsuite/sear-domain-cell';
import { SheetPasteMode } from '../src/SheetPasteMode';

function createSource(): SheetClipboardDataSource & {
  matrix: SheetMatrix;
  formats: Map<string, CellFormat>;
  selection: { start: [number, number]; end: [number, number] } | null;
} {
  const matrix = new SheetMatrix(void 0, [4, 4]);
  matrix.addItem(0, 0, { type: 'string', value: 'A' });
  matrix.addItem(0, 1, { type: 'number', value: 2 });
  matrix.addItem(1, 0, { type: 'formula', formula: '=A1', value: 1 });
  const formats = new Map<string, CellFormat>([['0:1', CellFormats.percent]]);
  return {
    target: new PluginKey('test-clipboard-data'),
    formatTarget: new PluginKey('test-clipboard-formats'),
    cutSourceId: 'test-sheet',
    cutSession: new SheetClipboardCutSession(),
    matrix,
    formats,
    selection: { start: [0, 0], end: [1, 1] },
    getSelection() {
      return this.selection;
    },
    getRowCount() {
      return this.matrix.shape[0];
    },
    getColumnCount() {
      return this.matrix.shape[1];
    },
    readCell(row, column) {
      return this.matrix.getItem(row, column);
    },
    readCellFormat(row, column) {
      return this.formats.get(`${row}:${column}`) ?? null;
    },
    createClipboardCutId() {
      return 'test-cut-1';
    },
    planRangeMove(source, destination) {
      return [
        {
          target: this.target,
          operations: [
            createUpdateCellOTOperation(
              destination.start,
              this.readCell(source.start[0], source.start[1]),
              this.readCell(destination.start[0], destination.start[1]),
            ),
          ],
        },
      ];
    },
  };
}

function createCommands(source: SheetClipboardDataSource): SheetCommandBus {
  const commands = new SheetCommandBus();
  const codecs = new CellClipboardCodecRegistry();
  codecs.register({
    cellType: 'string',
    encode: (cell) => ({ type: cell.type, value: cell.value }),
    decode: (data) => (data && typeof data === 'object' ? (data as { type: string; value?: unknown }) : null),
    toPlainText: (cell) => String(cell.value ?? ''),
    decodePlainText: (text) => (text.length === 0 ? null : { type: 'string', value: text }),
  });
  codecs.register(createFormulaCellClipboardCodec());
  const plugin = new SheetClipboardPlugin(source, new DefaultSheetClipboardCodec(codecs));
  plugin.registerCommands(commands);
  commands.bind({
    executePipeline: jest.fn((pipeline: Pipeline) => {
      pipeline.steps.forEach((step) => {
        if (step.transaction) {
          step.transaction.operations.forEach((operation) => {
            const update = (operation as any)[MatrixOTActionName.UpdateCell] as { value: any } | undefined;
            if (update) source.readCell(Number(operation.p[0]), Number(operation.p[1]));
          });
        }
        step.localAction?.();
        step.postCommit?.();
      });
    }),
    applyEffect: jest.fn(),
  });
  return commands;
}

describe('SheetClipboardPlugin', () => {
  it('BUG-081 copies a displayed projection without treating it as persisted source data', () => {
    const source = createSource();
    source.selection = { start: [2, 1], end: [2, 1] };
    source.readCopyCell = (row, column) =>
      row === 2 && column === 1 ? { type: 'string', value: 'projected' } : source.readCell(row, column);
    source.validateCutCell = () => ({ valid: false, reject: true, message: 'Protected spill' });
    const commands = createCommands(source);

    const copied = commands.run(CopyRangeCommand, void 0).payload;
    expect(copied.plainText).toBe('projected');
    expect(copied.structured?.rows[0]?.[0]).toMatchObject({
      type: 'string',
      data: { type: 'string', value: 'projected' },
    });
    expect(source.readCell(2, 1)).toBeNull();
    expect(() => commands.run(CutRangeCommand, void 0)).toThrow('Protected spill');
  });

  it('rejects cutting protected occupied cells while allowing copy', () => {
    const source = createSource();
    source.selection = { start: [0, 0], end: [0, 1] };
    source.validateCutCell = (row, column) => ({
      valid: column !== 1,
      reject: column === 1,
      message: 'Protected result',
    });
    const commands = createCommands(source);
    expect(() => commands.run(CutRangeCommand, void 0)).toThrow(
      expect.objectContaining({ code: SheetClipboardErrorCode.InputRejected, message: 'Protected result' }),
    );
    expect(source.cutSession?.getPending()).toBeNull();
    expect(commands.run(CopyRangeCommand, void 0).payload.plainText).toContain('A');
    expect(source.readCell(0, 1)?.value).toBe(2);
  });

  it('BUG-462 rejects an invalid target before writing any pasted cells', () => {
    const source = createSource();
    source.validatePasteCell = (row, column, cell) => ({
      valid: !(row === 2 && column === 2 && cell?.value === '123'),
      reject: row === 2 && column === 2 && cell?.value === '123',
      message: 'Invalid input',
    });
    const commands = createCommands(source);
    expect(() =>
      commands.run(PasteRangeCommand, {
        payload: { plainText: 'ok\t123' },
        target: [2, 1],
      }),
    ).toThrow(expect.objectContaining({ code: SheetClipboardErrorCode.InputRejected }));
    expect(source.readCell(2, 1)).toBeNull();
    expect(source.readCell(2, 2)).toBeNull();
  });

  it('BUG-463 preserves a pending cut after validation rejects its destination', () => {
    const source = createSource();
    source.matrix.addItem(0, 0, { type: 'string', value: '123' });
    source.selection = { start: [0, 0], end: [0, 0] };
    source.validatePasteCell = (row, column, cell) => ({
      valid: !(row === 2 && column === 2 && cell?.value === '123'),
      reject: row === 2 && column === 2 && cell?.value === '123',
      message: 'Invalid input',
    });
    source.planRangeMove = jest.fn(source.planRangeMove);
    const commands = createCommands(source);
    const { payload } = commands.run(CutRangeCommand, void 0);

    expect(() => commands.run(PasteRangeCommand, { payload, target: [2, 2] })).toThrow(
      expect.objectContaining({ code: SheetClipboardErrorCode.InputRejected }),
    );
    expect(source.readCell(0, 0)?.value).toBe('123');
    expect(source.readCell(2, 2)).toBeNull();
    expect(source.planRangeMove).not.toHaveBeenCalled();
    expect(source.cutSession?.getPending()?.range).toEqual({ start: [0, 0], end: [0, 0] });

    commands.run(PasteRangeCommand, { payload, target: [2, 1] });
    expect(source.planRangeMove).toHaveBeenCalledWith({ start: [0, 0], end: [0, 0] }, { start: [2, 1], end: [2, 1] });
    expect(source.cutSession?.getPending()).toBeNull();
  });

  it('returns a structured payload and TSV fallback without touching the system clipboard', () => {
    const source = createSource();
    const commands = createCommands(source);

    const result = commands.run(CopyRangeCommand, void 0);

    expect(result.range).toEqual({ start: [0, 0], end: [1, 1] });
    expect(result.payload.plainText).toBe('A\t2\n=A1\t');
    expect(result.payload.structured?.kind).toBe('searsuite.sheet-range');
    expect(result.payload.structured?.rows).toEqual([
      [
        { type: 'string', data: { type: 'string', value: 'A' } },
        { type: 'number', data: { type: 'number', value: 2 } },
      ],
      [{ type: 'formula', data: { formula: '=A1', value: 1 } }, null],
    ]);
    expect(result.payload.structured?.formats).toEqual([
      [null, CellFormats.percent],
      [null, null],
    ]);
  });

  it('copies only visible filtered rows and keeps their owner formats aligned on paste', () => {
    const source = createSource();
    source.selection = { start: [0, 0], end: [2, 0] };
    source.matrix.addItem(0, 0, { type: 'string', value: 'X' });
    source.matrix.addItem(1, 0, { type: 'string', value: 'Y' });
    source.matrix.addItem(2, 0, { type: 'string', value: 'X' });
    source.isRowVisible = (row) => row !== 1;
    source.captureOwnerFormats = (range) => [{ id: 'fill', portable: { row: range.start[0] } }];
    const fill = new PluginKey('test-fill');
    source.planOwnerFormats = (captured, target) => [
      {
        target: fill,
        operations: [createUpdateCellOTOperation(target.start, (captured[0]!.portable as { row: number }).row, null)],
      },
    ];
    const commands = createCommands(source);

    const copy = commands.run(CopyRangeCommand, void 0);
    const paste = commands.run(PasteRangeCommand, { payload: copy.payload, target: [2, 2] });

    expect(copy.payload.plainText).toBe('X\nX');
    expect(copy.payload.structured?.sourceRows).toEqual([0, 2]);
    expect(copy.payload.structured?.rows).toHaveLength(2);
    expect(copy.payload.structured?.ownerFormatsByRow).toEqual([
      [{ id: 'fill', portable: { row: 0 } }],
      [{ id: 'fill', portable: { row: 2 } }],
    ]);
    expect(paste.range).toEqual({ start: [2, 2], end: [3, 2] });
    expect(paste.pipeline.steps[0]?.transaction?.operations).toEqual([
      { p: [2, 2], uc: { value: { type: 'string', value: 'X' }, prev: null } },
      { p: [3, 2], uc: { value: { type: 'string', value: 'X' }, prev: null } },
    ]);
    expect(paste.pipeline.steps.slice(2).map((step) => step.transaction?.operations[0])).toEqual([
      { p: [2, 2], uc: { value: 0, prev: null } },
      { p: [3, 2], uc: { value: 2, prev: null } },
    ]);
  });

  it('rebases formulas from each original visible row', () => {
    const source = createSource();
    source.selection = { start: [0, 0], end: [2, 0] };
    source.matrix.addItem(2, 0, { type: 'formula', formula: '=A3', value: 5 });
    source.isRowVisible = (row) => row !== 1;
    const commands = createCommands(source);

    const payload = commands.run(CopyRangeCommand, void 0).payload;
    const paste = commands.run(PasteRangeCommand, { payload, target: [1, 2] });

    expect((paste.pipeline.steps[0]?.transaction?.operations[1] as any)?.uc.value.formula).toBe('=C3');
  });

  it('keeps source cells on cut and moves them in one paste command', () => {
    const source = createSource();
    const commands = createCommands(source);
    const cut = commands.run(CutRangeCommand, void 0);
    const paste = commands.run(PasteRangeCommand, { payload: cut.payload, target: [2, 2] });

    expect(cut.payload.structured?.rows).toHaveLength(2);
    expect(cut.pipeline.steps).toHaveLength(0);
    expect(source.readCell(0, 0)).toEqual({ type: 'string', value: 'A' });
    expect(paste.pipeline.steps[0]?.transaction?.pluginKey).toBe(source.target);
    expect(paste.pipeline.steps[0]?.transaction?.operations).toHaveLength(1);
    expect(paste.range).toEqual({ start: [2, 2], end: [3, 3] });
    expect((paste.pipeline.steps[0]?.transaction?.operations[0] as any)?.uc).toEqual({
      value: { type: 'string', value: 'A' },
      prev: null,
    });
    expect(source.cutSession?.getPending()).toBeNull();
  });

  it('cancels a pending cut without changing its source', () => {
    const source = createSource();
    const commands = createCommands(source);
    commands.run(CutRangeCommand, void 0);

    commands.run(CancelCutRangeCommand, void 0);

    expect(source.cutSession?.getPending()).toBeNull();
    expect(source.readCell(0, 0)).toEqual({ type: 'string', value: 'A' });
  });

  it('copies and pastes owner formats, then clears them on cut', () => {
    const source = createSource();
    const fill = new PluginKey('test-fill');
    source.selection = { start: [0, 0], end: [0, 0] };
    source.captureOwnerFormats = () => [{ id: 'fill', portable: { color: '#ffdddd' } }];
    source.planOwnerFormats = (captured, target) => [
      {
        target: fill,
        operations: [
          createUpdateCellOTOperation(target.start, (captured[0]!.portable as { color: string }).color, null),
        ],
      },
    ];
    source.clearOwnerFormats = (range) => [
      {
        target: fill,
        operations: [createUpdateCellOTOperation(range.start, null, '#ffdddd')],
      },
    ];
    const commands = createCommands(source);

    const copy = commands.run(CopyRangeCommand, void 0);
    const paste = commands.run(PasteRangeCommand, { payload: copy.payload, target: [2, 2] });
    const cut = commands.run(CutRangeCommand, void 0);

    expect(copy.payload.structured?.ownerFormats).toEqual([{ id: 'fill', portable: { color: '#ffdddd' } }]);
    expect(paste.pipeline.steps[2]?.transaction?.pluginKey).toBe(fill);
    expect(paste.pipeline.steps[2]?.transaction?.operations).toEqual([
      { p: [2, 2], uc: { value: '#ffdddd', prev: null } },
    ]);
    expect(cut.pipeline.steps).toHaveLength(0);
  });

  it('copies merge geometry and plans merge-owner changes for paste and cut', () => {
    const source = createSource();
    const mergeTarget = new PluginKey('test-merges');
    source.selection = { start: [0, 0], end: [0, 1] };
    source.captureMergedRanges = () => [{ start: [0, 0], end: [0, 1] }];
    source.planPasteMergedRanges = (merges, target) => ({
      target: mergeTarget,
      operations: [
        createUpdateCellOTOperation(
          target,
          { endRow: target[0] + merges[0]!.end[0], endColumn: target[1] + merges[0]!.end[1] },
          null,
        ),
      ],
    });
    source.planClearMergedRanges = () => ({
      target: mergeTarget,
      operations: [createUpdateCellOTOperation([0, 0], null, { endRow: 0, endColumn: 1 })],
    });
    const commands = createCommands(source);

    const copy = commands.run(CopyRangeCommand, void 0);
    const paste = commands.run(PasteRangeCommand, { payload: copy.payload, target: [2, 2] });
    const cut = commands.run(CutRangeCommand, void 0);

    expect(copy.payload.structured?.merges).toEqual([{ start: [0, 0], end: [0, 1] }]);
    expect(paste.pipeline.steps.at(-1)?.transaction?.pluginKey).toBe(mergeTarget);
    expect(paste.pipeline.steps.at(-1)?.transaction?.operations).toEqual([
      { p: [2, 2], uc: { value: { endRow: 2, endColumn: 3 }, prev: null } },
    ]);
    expect(cut.pipeline.steps).toHaveLength(0);
  });

  it('rejects malformed or overlapping merge geometry before committing paste', () => {
    const source = createSource();
    source.planPasteMergedRanges = () => ({ target: source.target, operations: [] });
    const commands = createCommands(source);
    const copied = commands.run(CopyRangeCommand, void 0).payload.structured!;
    expect(() =>
      commands.run(PasteRangeCommand, {
        payload: { plainText: 'A\t2\n=A1\t', structured: { ...copied, merges: [{ start: [0, 0], end: [2, 0] }] } },
        target: [2, 2],
      }),
    ).toThrow(expect.objectContaining({ code: SheetClipboardErrorCode.InvalidPayload }));
  });

  it('accepts plain text payloads through the codec fallback', () => {
    const source = createSource();
    const commands = createCommands(source);
    const payload: SheetClipboardPayload = { plainText: 'x\ty\nz\t' };

    const result = commands.run(PasteRangeCommand, { payload, target: [0, 0] });
    const operations = result.pipeline.steps[0]?.transaction?.operations ?? [];

    expect(operations).toHaveLength(4);
    expect((operations[0] as any)?.uc.value).toEqual({ type: 'string', value: 'x' });
    expect((operations[3] as any)?.uc.value).toBeNull();
  });

  it('BUG-962 keeps a copied multiline cell in one target cell when only plain text survives', () => {
    const source = createSource();
    source.matrix.addItem(0, 0, { type: 'string', value: 'one\ntwo\nthree' });
    source.selection = { start: [0, 0], end: [0, 0] };
    const commands = createCommands(source);
    const copy = commands.run(CopyRangeCommand, void 0);

    expect(copy.payload.plainText).toBe('"one\ntwo\nthree"');
    const paste = commands.run(PasteRangeCommand, { payload: { plainText: copy.payload.plainText }, target: [2, 2] });
    expect(paste.pipeline.steps[0]?.transaction?.operations).toHaveLength(1);
    expect((paste.pipeline.steps[0]?.transaction?.operations[0] as any)?.uc.value).toEqual({
      type: 'string',
      value: 'one\ntwo\nthree',
    });
  });

  it('can paste only values or only formats through the same transaction boundary', () => {
    const source = createSource();
    const commands = createCommands(source);
    const copy = commands.run(CopyRangeCommand, void 0);

    const values = commands.run(PasteRangeCommand, {
      payload: copy.payload,
      target: [2, 2],
      mode: SheetPasteMode.Values,
    });
    const formats = commands.run(PasteRangeCommand, {
      payload: copy.payload,
      target: [2, 2],
      mode: SheetPasteMode.Formats,
    });

    expect(values.pipeline.steps).toHaveLength(1);
    expect(values.pipeline.steps[0]?.transaction?.pluginKey).toBe(source.target);
    expect(formats.pipeline.steps).toHaveLength(1);
    expect(formats.pipeline.steps[0]?.transaction?.pluginKey).toBe(source.formatTarget);
  });

  it('R2-020 stores calculated values separately from formulas in copied ranges', () => {
    const source = createSource();
    source.selection = { start: [1, 0], end: [1, 0] };
    source.readCopyValueCell = () => ({ type: 'number', value: 1 });
    const commands = createCommands(source);
    const copy = commands.run(CopyRangeCommand, void 0);

    expect(copy.payload.plainText).toBe('1');
    const normal = commands.run(PasteRangeCommand, { payload: copy.payload, target: [2, 0] });
    const values = commands.run(PasteRangeCommand, {
      payload: copy.payload,
      target: [3, 0],
      mode: SheetPasteMode.Values,
    });

    expect((normal.pipeline.steps[0]?.transaction?.operations[0] as any)?.uc.value.type).toBe('formula');
    expect((values.pipeline.steps[0]?.transaction?.operations[0] as any)?.uc.value).toEqual({
      type: 'number',
      value: 1,
    });
  });

  it('BUG-053 repeats a copied block across an integer-multiple target selection', () => {
    const source = createSource();
    const commands = createCommands(source);
    const copy = commands.run(CopyRangeCommand, void 0);
    source.selection = { start: [0, 0], end: [3, 3] };

    const paste = commands.run(PasteRangeCommand, { payload: copy.payload });
    const operations = paste.pipeline.steps[0]?.transaction?.operations ?? [];

    expect(paste.range).toEqual({ start: [0, 0], end: [3, 3] });
    expect(operations).toHaveLength(16);
    expect((operations[10] as any)?.uc.value).toEqual({ type: 'string', value: 'A' });
    expect((operations[15] as any)?.uc.value).toBeNull();
    expect(paste.pipeline.steps[1]?.transaction?.operations).toHaveLength(16);
  });

  it('BUG-053 rebases formulas independently for each repeated block', () => {
    const source = createSource();
    source.selection = { start: [1, 0], end: [1, 0] };
    const commands = createCommands(source);
    const copy = commands.run(CopyRangeCommand, void 0);
    source.selection = { start: [2, 0], end: [3, 0] };

    const paste = commands.run(PasteRangeCommand, { payload: copy.payload });
    const operations = paste.pipeline.steps[0]?.transaction?.operations ?? [];

    expect(paste.range).toEqual({ start: [2, 0], end: [3, 0] });
    expect((operations[0] as any)?.uc.value.formula).toBe('=A2');
    expect((operations[1] as any)?.uc.value.formula).toBe('=A3');
  });

  it('BUG-053 keeps source-sized paste when the selection is not an exact multiple', () => {
    const source = createSource();
    const commands = createCommands(source);
    const copy = commands.run(CopyRangeCommand, void 0);
    source.selection = { start: [0, 0], end: [2, 2] };

    const paste = commands.run(PasteRangeCommand, { payload: copy.payload });

    expect(paste.range).toEqual({ start: [0, 0], end: [1, 1] });
    expect(paste.pipeline.steps[0]?.transaction?.operations).toHaveLength(4);
  });

  it('BUG-020 rejects multi-cell paste into a merged subordinate cell', () => {
    const source = createSource();
    source.getMergedRange = (row, column) => (row === 0 && column <= 1 ? { start: [0, 0], end: [0, 1] } : null);
    const commands = createCommands(source);

    expect(() =>
      commands.run(PasteRangeCommand, {
        payload: { plainText: 'X\tY' },
        target: [0, 0],
      }),
    ).toThrow(expect.objectContaining({ code: SheetClipboardErrorCode.TargetIntersectsMergedCells }));
    expect(source.readCell(0, 1)).toEqual({ type: 'number', value: 2 });
    expect(
      commands.run(PasteRangeCommand, {
        payload: { plainText: 'X' },
        target: [0, 0],
      }).range,
    ).toEqual({ start: [0, 0], end: [0, 0] });
  });

  it('rebases relative formula references while preserving absolute coordinates', () => {
    const source = createSource();
    source.matrix.addItem(1, 1, { type: 'formula', formula: '=A1+$B$2+Sheet2!C3', value: 0 });
    source.selection = { start: [1, 1], end: [1, 1] };
    const commands = createCommands(source);
    const copy = commands.run(CopyRangeCommand, void 0);
    const paste = commands.run(PasteRangeCommand, { payload: copy.payload, target: [2, 3] });
    const value = (paste.pipeline.steps[0]?.transaction?.operations[0] as any)?.uc.value;

    expect(value.formula).toBe('=C2+$B$2+Sheet2!E4');
  });

  it('BUG-071 preserves formula references when a cell is moved by Cut', () => {
    const source = createSource();
    source.selection = { start: [1, 0], end: [1, 0] };
    const commands = createCommands(source);
    const cut = commands.run(CutRangeCommand, void 0);
    const paste = commands.run(PasteRangeCommand, { payload: cut.payload, target: [3, 2] });
    const value = (paste.pipeline.steps[0]?.transaction?.operations[0] as any)?.uc.value;

    expect(cut.payload.structured?.isCut).toBe(true);
    expect(value.formula).toBe('=A1');
  });

  it('fails with stable errors for missing selection and out-of-bounds paste', () => {
    const source = createSource();
    source.selection = null;
    const commands = createCommands(source);

    expect(() => commands.run(CopyRangeCommand, void 0)).toThrow(SheetClipboardError);
    try {
      commands.run(CopyRangeCommand, void 0);
    } catch (error) {
      expect(error).toMatchObject({ code: SheetClipboardErrorCode.NoSelection });
    }

    source.selection = { start: [0, 0], end: [0, 0] };
    expect(() =>
      commands.run(PasteRangeCommand, {
        payload: { plainText: 'a\tb\nc\td' },
        target: [3, 3],
      }),
    ).toThrow(SheetClipboardError);
    try {
      commands.run(PasteRangeCommand, {
        payload: { plainText: 'a\tb\nc\td' },
        target: [3, 3],
      });
    } catch (error) {
      expect(error).toMatchObject({ code: SheetClipboardErrorCode.TargetOutOfBounds });
    }
  });
});
