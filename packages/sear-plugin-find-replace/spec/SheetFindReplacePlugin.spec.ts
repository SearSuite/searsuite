import { SheetDataPlugin } from '@searsuite/sear-plugin-sheet-data';
import { SheetMatrix } from '@searsuite/sear-domain-sheet';
import {
  CellClipboardCodecRegistry,
  CellCommitStrategyRegistry,
  CellType,
  type CellMatrixElement,
  DefaultStringCellCommitStrategy,
  FormulaCellCommitStrategy,
  SheetCellInputValidationRegistry,
} from '@searsuite/sear-domain-cell-types';
import { SheetCommandBus, SheetQueryRegistry } from '@searsuite/sear-assembly-commands';
import {
  FindSheetMatchesQuery,
  FindSheetMatchPageQuery,
  ReplaceAllSheetMatchesCommand,
  ReplaceSheetMatchCommand,
  SheetFindContent,
  SheetFindOrder,
  SheetFindReplacePlugin,
  findSheetMatches,
  findSheetMatchPage,
  replaceSheetMatches,
  SheetFindReplaceError,
  SheetFindReplaceErrorCode,
} from '../src';
import { extractRichText } from '@searsuite/sear-domain-cell-types';
import { replaceRichTextMatches } from '../src/replaceRichTextMatches';

function setup(matrix: SheetMatrix) {
  const codecs = new CellClipboardCodecRegistry();
  codecs.register({
    cellType: CellType.RichText,
    encode: (cell) => cell.value,
    decode: (value) => ({ type: CellType.RichText, value }),
    toPlainText: (cell) => extractRichText(cell.value),
  });
  const commits = new CellCommitStrategyRegistry();
  commits.register(new DefaultStringCellCommitStrategy());
  commits.register(new FormulaCellCommitStrategy());
  const owner = new SheetDataPlugin({ sheetData: matrix });
  const plugin = new SheetFindReplacePlugin(owner, codecs, commits);
  const queries = new SheetQueryRegistry();
  const commands = new SheetCommandBus();
  let lastOperations: readonly unknown[] = [];
  commands.bind({
    executePipeline: (pipeline) => {
      const step = pipeline.steps.find((candidate) => 'transaction' in candidate);
      lastOperations = step && 'transaction' in step ? step.transaction.operations : [];
    },
    applyEffect: () => void 0,
  });
  plugin.registerQueries(queries);
  plugin.registerCommands(commands);
  return { queries, commands, operations: () => lastOperations };
}

describe('SheetFindReplacePlugin', () => {
  it('finds literal occurrences, filters ranges, and changes traversal order', () => {
    const matrix = new SheetMatrix(void 0, [1_000_000, 3]);
    matrix.addItem(0, 1, { type: CellType.String, value: 'A.b a.b' });
    matrix.addItem(2, 0, { type: CellType.String, value: 'a.b' });
    matrix.addItem(999_999, 2, { type: CellType.Formula, formula: '=SUM(A1)' });
    const { queries } = setup(matrix);
    const matches = queries.run(FindSheetMatchesQuery, { text: 'a.b' });
    expect(matches.map(({ row, column, start }) => [row, column, start])).toEqual([
      [0, 1, 0],
      [0, 1, 4],
      [2, 0, 0],
    ]);
    expect(queries.run(FindSheetMatchesQuery, { text: 'a.b', matchCase: true, entireCell: true })).toEqual([
      { row: 2, column: 0, start: 0, end: 3, text: 'a.b' },
    ]);
    expect(
      queries
        .run(FindSheetMatchesQuery, { text: 'a.b', order: SheetFindOrder.Columns })
        .map(({ row, column }) => [row, column]),
    ).toEqual([
      [2, 0],
      [0, 1],
      [0, 1],
    ]);
    expect(
      queries.run(FindSheetMatchesQuery, {
        text: 'a.b',
        range: { start: [1, 0], end: [2, 0] },
      }),
    ).toHaveLength(1);
    expect(queries.run(FindSheetMatchesQuery, { text: 'SUM', content: SheetFindContent.Formula })).toEqual([
      { row: 999_999, column: 2, start: 1, end: 4, text: '=SUM(A1)' },
    ]);
  });

  it('searches every disjoint selected range once across paging and replacement', () => {
    const matrix = new SheetMatrix(void 0, [3, 4]);
    matrix.addItem(0, 0, { type: CellType.String, value: 'alpha' });
    matrix.addItem(0, 1, { type: CellType.String, value: 'middle' });
    matrix.addItem(2, 3, { type: CellType.String, value: 'beta' });
    const ranges = [
      { start: [0, 0], end: [0, 0] },
      { start: [2, 3], end: [2, 3] },
      { start: [0, 0], end: [0, 0] },
    ] as const;
    const { queries, commands, operations } = setup(matrix);
    expect(queries.run(FindSheetMatchesQuery, { text: 'a', ranges }).map(({ row, column }) => [row, column])).toEqual([
      [0, 0],
      [0, 0],
      [2, 3],
    ]);
    expect(queries.run(FindSheetMatchPageQuery, { text: 'a', ranges, limit: 2 })).toMatchObject({ total: 3 });
    const match = queries.run(FindSheetMatchesQuery, { text: 'beta', ranges })[0];
    commands.run(ReplaceSheetMatchCommand, { text: 'beta', replacement: 'done', ranges, match });
    expect(operations()).toMatchObject([{ p: [2, 3], uc: { value: { value: 'done' } } }]);
    commands.run(ReplaceAllSheetMatchesCommand, { text: 'middle', replacement: 'changed', ranges });
    expect(operations()).toEqual([]);
    expect(() => queries.run(FindSheetMatchesQuery, { text: 'a', ranges: [{ start: [0, 0], end: [3, 0] }] })).toThrow(
      'Find range is outside the sheet',
    );
  });

  it('matches wildcards and tilde escapes in find and replace', () => {
    const matrix = new SheetMatrix(void 0, [4, 1]);
    matrix.addItem(0, 0, { type: CellType.String, value: '?' });
    matrix.addItem(1, 0, { type: CellType.String, value: 'a' });
    matrix.addItem(2, 0, { type: CellType.String, value: 'a*' });
    matrix.addItem(3, 0, { type: CellType.String, value: 'ba\naa' });
    const { queries, commands, operations } = setup(matrix);
    const range = { start: [0, 0], end: [1, 0] } as const;
    const find = (text: string) => queries.run(FindSheetMatchesQuery, { text, range, entireCell: true });
    expect(find('a*').map(({ row }) => row)).toEqual([1]);
    expect(find('?').map(({ row }) => row)).toEqual([0, 1]);
    expect(find('~?').map(({ row }) => row)).toEqual([0]);
    expect(find('a').map(({ row }) => row)).toEqual([1]);
    expect(queries.run(FindSheetMatchesQuery, { text: 'a~*', entireCell: true }).map(({ row }) => row)).toEqual([2]);
    expect(queries.run(FindSheetMatchesQuery, { text: 'b*aa', entireCell: true }).map(({ row }) => row)).toEqual([3]);
    commands.run(ReplaceAllSheetMatchesCommand, { text: '~?', replacement: 'literal', range });
    expect(operations()).toMatchObject([{ p: [0, 0], uc: { value: { value: 'literal' } } }]);
    commands.run(ReplaceAllSheetMatchesCommand, { text: 'a*', replacement: 'changed', range, entireCell: true });
    expect(operations()).toMatchObject([{ p: [1, 0], uc: { value: { value: 'changed' } } }]);
  });

  it('pages high-density results in either direction and preserves column order', () => {
    const matrix = new SheetMatrix(void 0, [300, 2]);
    for (let row = 0; row < 300; row += 1) matrix.addItem(row, 1, { type: CellType.String, value: 'hit' });
    matrix.addItem(299, 0, { type: CellType.String, value: 'hit' });
    const source = { matrix, codecs: new CellClipboardCodecRegistry(), getRevision: () => 7 };
    const options = { text: 'hit', order: SheetFindOrder.Columns, limit: 200 };
    const first = findSheetMatchPage(options, source);
    expect(first).toMatchObject({ total: 301, startIndex: 0, revision: 7 });
    expect(first.matches).toHaveLength(200);
    expect(first.matches[0]).toMatchObject({ row: 299, column: 0 });
    expect(first.matches[1]).toMatchObject({ row: 0, column: 1 });
    const second = findSheetMatchPage({ ...options, cursor: first.matches[199], expectedRevision: 7 }, source);
    expect(second).toMatchObject({ total: 301, startIndex: 200 });
    expect(second.matches).toHaveLength(101);
    expect(second.matches[0]).toMatchObject({ row: 199, column: 1 });
    const backward = findSheetMatchPage({ ...options, cursor: second.matches[0], backward: true }, source);
    expect(backward.matches).toEqual(first.matches);
    expect(findSheetMatchPage({ ...options, backward: true }, source).startIndex).toBe(101);
    expect(() => findSheetMatchPage({ ...options, expectedRevision: 6 }, source)).toThrow('Find results changed');
    expect(() => findSheetMatchPage({ ...options, limit: 201 }, source)).toThrow('Find page size is invalid');
  });

  it('replaces one occurrence or every occurrence with one update per cell', () => {
    const matrix = new SheetMatrix(void 0, [2, 1]);
    matrix.addItem(0, 0, { type: CellType.String, value: 'foo foo' });
    matrix.addItem(1, 0, { type: CellType.String, value: 'foo' });
    const { queries, commands, operations } = setup(matrix);
    const match = queries.run(FindSheetMatchesQuery, { text: 'foo' })[1];
    commands.run(ReplaceSheetMatchCommand, { text: 'foo', replacement: 'bar', match });
    expect(operations()).toMatchObject([{ p: [0, 0], uc: { value: { value: 'foo bar' } } }]);
    commands.run(ReplaceSheetMatchCommand, { text: 'foo', replacement: 'bar', match: { ...match, text: 'old text' } });
    expect(operations()).toEqual([]);
    commands.run(ReplaceAllSheetMatchesCommand, { text: 'foo', replacement: 'bar' });
    expect(operations()).toMatchObject([
      { p: [0, 0], uc: { value: { value: 'bar bar' } } },
      { p: [1, 0], uc: { value: { value: 'bar' } } },
    ]);
  });

  it('rejects invalid replacements before creating any operations, including bulk writes', () => {
    const matrix = new SheetMatrix(void 0, [2, 1]);
    matrix.addItem(0, 0, { type: CellType.String, value: 'Beta' });
    matrix.addItem(1, 0, { type: CellType.String, value: 'Beta' });
    const validation = new SheetCellInputValidationRegistry();
    validation.register('dropdown', (row, _column, text) => ({
      valid: row !== 1 || text !== 'Gamma',
      reject: row === 1 && text === 'Gamma',
      message: 'Choose valid dropdown options',
    }));
    const commits = new CellCommitStrategyRegistry();
    commits.register(new DefaultStringCellCommitStrategy());
    const source = {
      matrix,
      codecs: new CellClipboardCodecRegistry(),
      commitStrategies: commits,
      inputValidation: validation,
    };
    expect(() => replaceSheetMatches({ text: 'Beta', replacement: 'Gamma' }, source, false)).toThrow(
      new SheetFindReplaceError(SheetFindReplaceErrorCode.InvalidReplacement, 'Choose valid dropdown options', {
        row: 1,
        column: 0,
      }),
    );
    expect(() =>
      replaceSheetMatches(
        {
          text: 'Beta',
          replacement: 'Gamma',
          match: { row: 1, column: 0, start: 0, end: 4, text: 'Beta' },
        },
        source,
        true,
      ),
    ).toThrow('Choose valid dropdown options');
    expect(matrix.getItem(0, 0)?.value).toBe('Beta');
    expect(matrix.getItem(1, 0)?.value).toBe('Beta');
  });

  it('reads only the target cell for Replace One and joins repeated replacements once', () => {
    const data = Array.from({ length: 1_000 }, () => ({ type: CellType.String, value: 'other' }));
    data[999] = { type: CellType.String, value: 'foo foo' };
    const matrix = new SheetMatrix(
      {
        data,
        indices: Array.from({ length: 1_001 }, (_, index) => index),
        indptr: Array(1_000).fill(0),
      },
      [1_000, 1],
    );
    const commits = new CellCommitStrategyRegistry();
    commits.register(new DefaultStringCellCommitStrategy());
    const readValue = jest.fn((_row: number, _column: number, cell: CellMatrixElement | null) => cell?.value);
    const source = { matrix, codecs: new CellClipboardCodecRegistry(), commitStrategies: commits, readValue };
    const operations = replaceSheetMatches(
      {
        text: 'foo',
        replacement: 'bar',
        match: { row: 999, column: 0, start: 4, end: 7, text: 'foo foo' },
      },
      source,
      true,
    );
    expect(readValue).toHaveBeenCalledTimes(1);
    expect(operations).toMatchObject([{ p: [999, 0], uc: { value: { value: 'foo bar' } } }]);
    const many = new SheetMatrix(void 0, [1, 1]);
    many.addItem(0, 0, { type: CellType.String, value: 'x'.repeat(20_000) });
    const all = replaceSheetMatches({ text: 'x', replacement: 'y' }, { ...source, matrix: many }, false);
    expect(all).toHaveLength(1);
    expect(all[0].uc.value?.value).toBe('y'.repeat(20_000));
  });

  it('searches projected formula values in empty coordinates', () => {
    const matrix = new SheetMatrix(void 0, [4, 4]);
    const codecs = new CellClipboardCodecRegistry();
    const source = {
      matrix,
      codecs,
      readValue: (row: number, column: number) => (row === 3 && column === 2 ? 'calculated' : null),
      forEachProjectedValueInRange: (
        _sr: number,
        _sc: number,
        _er: number,
        _ec: number,
        visit: (row: number, column: number) => void,
      ) => visit(3, 2),
    };
    expect(FindSheetMatchesQuery.id).toBe('sheet.findReplace.find');
    expect(findSheetMatches({ text: 'calc' }, source)).toEqual([
      { row: 3, column: 2, start: 0, end: 4, text: 'calculated' },
    ]);
  });

  it('refuses to replace a projected result without a persisted cell', () => {
    const matrix = new SheetMatrix(void 0, [1, 2]);
    matrix.addItem(0, 0, { type: CellType.Formula, formula: '=SEQUENCE(1,2)' });
    const commits = new CellCommitStrategyRegistry();
    commits.register(new DefaultStringCellCommitStrategy());
    const source = {
      matrix,
      codecs: new CellClipboardCodecRegistry(),
      commitStrategies: commits,
      readValue: (_row: number, column: number) => (column === 0 ? '1' : '2'),
      isArrayResultAnchor: (_row: number, column: number) => column === 0,
      forEachProjectedValueInRange: (
        _sr: number,
        _sc: number,
        _er: number,
        _ec: number,
        visit: (row: number, column: number) => void,
      ) => visit(0, 1),
    };
    expect(findSheetMatches({ text: '2' }, source)).toEqual([{ row: 0, column: 1, start: 0, end: 1, text: '2' }]);
    expect(() => replaceSheetMatches({ text: '2', replacement: '9' }, source, false)).toThrow(
      'Calculated result cells cannot be replaced directly',
    );
    expect(() => replaceSheetMatches({ text: '1', replacement: '9' }, source, false)).toThrow(
      'Calculated result cells cannot be replaced directly',
    );
    expect(() =>
      replaceSheetMatches(
        { text: '1', replacement: '9', match: { row: 0, column: 0, start: 0, end: 1, text: '1' } },
        source,
        true,
      ),
    ).toThrow('Calculated result cells cannot be replaced directly');
    expect(
      replaceSheetMatches(
        {
          text: 'SEQUENCE',
          replacement: 'SUM',
          content: SheetFindContent.Formula,
          match: { row: 0, column: 0, start: 1, end: 9, text: '=SEQUENCE(1,2)' },
        },
        source,
        true,
      ),
    ).toMatchObject([{ p: [0, 0], uc: { value: { formula: '=SUM(1,2)' } } }]);
    expect(matrix.getItem(0, 0)?.formula).toBe('=SEQUENCE(1,2)');
    expect(matrix.getItem(0, 1)).toBeNull();
  });

  it('searches only the visible merge anchor by value and protects covered cells from stale replacements', () => {
    const matrix = new SheetMatrix(void 0, [1, 3]);
    matrix.addItem(0, 0, { type: CellType.String, value: 'merged' });
    matrix.addItem(0, 1, { type: CellType.Formula, formula: '=A1' });
    matrix.addItem(0, 2, { type: CellType.Formula, formula: '=A1' });
    const source = {
      matrix,
      codecs: new CellClipboardCodecRegistry(),
      commitStrategies: new CellCommitStrategyRegistry(),
      readValue: () => 'merged',
      isCoveredMergeCell: (_row: number, column: number) => column !== 0,
    };
    expect(findSheetMatches({ text: 'merged' }, source).map(({ column }) => column)).toEqual([0]);
    expect(
      findSheetMatches({ text: '=A1', content: SheetFindContent.Formula }, source).map(({ column }) => column),
    ).toEqual([1, 2]);
    expect(() =>
      replaceSheetMatches(
        { text: 'merged', replacement: 'X', match: { row: 0, column: 1, start: 0, end: 6, text: 'merged' } },
        source,
        true,
      ),
    ).toThrow('Hidden cells inside a merged range cannot be replaced by displayed value');
    expect(matrix.getItem(0, 1)?.formula).toBe('=A1');
    expect(
      replaceSheetMatches(
        {
          text: '=A1',
          replacement: '=B1',
          content: SheetFindContent.Formula,
          match: { row: 0, column: 1, start: 0, end: 3, text: '=A1' },
        },
        source,
        true,
      ),
    ).toMatchObject([{ p: [0, 1], uc: { value: { formula: '=B1' } } }]);
  });

  it('marks filter-hidden matches while retaining visible matches in the result order', () => {
    const matrix = new SheetMatrix(void 0, [3, 1]);
    matrix.addItem(0, 0, { type: CellType.String, value: 'hit' });
    matrix.addItem(1, 0, { type: CellType.String, value: 'hit' });
    const source = {
      matrix,
      codecs: new CellClipboardCodecRegistry(),
      isRowHidden: (row: number) => row === 1,
    };
    expect(findSheetMatches({ text: 'hit' }, source)).toEqual([
      { row: 0, column: 0, start: 0, end: 3, text: 'hit' },
      { row: 1, column: 0, start: 0, end: 3, text: 'hit', hidden: true },
    ]);
    expect(findSheetMatchPage({ text: 'hit', limit: 2 }, source).matches[1]?.hidden).toBe(true);
  });

  it('keeps rich-text attributes and node identities when replacing across inline runs', () => {
    const matrix = new SheetMatrix(void 0, [1, 1]);
    matrix.addItem(0, 0, {
      type: CellType.RichText,
      value: [
        {
          type: 'paragraph',
          id: 'p',
          content: [
            { type: 'text', id: 'a', text: 'ab', attrs: { bold: true } },
            { type: 'text', id: 'b', text: 'cd', attrs: { color: 'red' } },
          ],
        },
      ],
    });
    const { commands, operations } = setup(matrix);
    commands.run(ReplaceAllSheetMatchesCommand, { text: 'bc', replacement: 'XY' });
    expect(operations()).toMatchObject([
      {
        uc: {
          value: {
            type: CellType.RichText,
            value: [
              {
                id: 'p',
                content: [
                  { id: 'a', text: 'aXY', attrs: { bold: true } },
                  { id: 'b', text: 'd', attrs: { color: 'red' } },
                ],
              },
            ],
          },
        },
      },
    ]);
  });

  it('validates bounds and ignores empty searches and unchanged replacements', () => {
    const matrix = new SheetMatrix(void 0, [2, 2]);
    matrix.addItem(0, 0, { type: CellType.String, value: 'A' });
    const { queries, commands, operations } = setup(matrix);
    expect(queries.run(FindSheetMatchesQuery, { text: '' })).toEqual([]);
    expect(queries.run(FindSheetMatchesQuery, { text: 'a', entireCell: true })).toHaveLength(1);
    expect(queries.run(FindSheetMatchesQuery, { text: 'a.', entireCell: true })).toEqual([]);
    expect(() =>
      queries.run(FindSheetMatchesQuery, {
        text: 'A',
        range: { start: [0, 0], end: [2, 1] },
      }),
    ).toThrow('Find range is outside the sheet');
    commands.run(ReplaceAllSheetMatchesCommand, { text: 'A', replacement: 'A' });
    expect(operations()).toEqual([]);
    expect(
      findSheetMatches(
        { text: 'A' },
        { matrix: new SheetMatrix(void 0, [0, 0]), codecs: new CellClipboardCodecRegistry() },
      ),
    ).toEqual([]);
  });

  it('replaces formula source without changing unrelated literal casing', () => {
    const matrix = new SheetMatrix(void 0, [1, 2]);
    matrix.addItem(0, 0, { type: CellType.Formula, formula: '=SUM("Total",2)' });
    const { commands, operations } = setup(matrix);
    commands.run(ReplaceAllSheetMatchesCommand, {
      text: 'SUM',
      replacement: 'MAX',
      content: SheetFindContent.Formula,
    });
    expect(operations()).toMatchObject([{ p: [0, 0], uc: { value: { formula: '=MAX("Total",2)' } } }]);
  });

  it('rejects a rich-text replacement that spans blocks', () => {
    const matrix = new SheetMatrix(void 0, [1, 1]);
    matrix.addItem(0, 0, {
      type: CellType.RichText,
      value: [
        { type: 'paragraph', content: [{ type: 'text', text: 'ab' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'cd' }] },
      ],
    });
    const { commands } = setup(matrix);
    expect(() => commands.run(ReplaceAllSheetMatchesCommand, { text: 'b\nc', replacement: 'X' })).toThrow(
      'Replacing text across rich-text blocks is unsupported',
    );
  });

  it('ignores missing values and avoids duplicate projected coordinates', () => {
    const matrix = new SheetMatrix(void 0, [2, 2]);
    matrix.addItem(0, 0, { type: CellType.String, value: 'alpha' });
    const codecs = new CellClipboardCodecRegistry();
    expect(
      findSheetMatches(
        { text: 'alpha' },
        {
          matrix,
          codecs,
          readValue: () => undefined,
        },
      ),
    ).toEqual([]);
    expect(
      findSheetMatches(
        { text: 'alpha' },
        {
          matrix,
          codecs,
          readValue: () => null,
        },
      ),
    ).toEqual([]);
    expect(findSheetMatches({ text: 'alpha', content: SheetFindContent.Formula }, { matrix, codecs })).toEqual([]);
    expect(
      findSheetMatches(
        { text: 'alpha' },
        {
          matrix,
          codecs,
          forEachProjectedValueInRange: (_sr, _sc, _er, _ec, visit) => visit(0, 0),
        },
      ),
    ).toHaveLength(1);
  });

  it('preserves the outer rich-text runs while replacing several runs', () => {
    const previous = {
      type: CellType.RichText,
      value: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'ab' },
            { type: 'text', text: 'cd' },
            { type: 'text', text: 'ef' },
          ],
        },
      ],
    };
    expect(
      replaceRichTextMatches(previous, [{ row: 0, column: 0, start: 1, end: 5, text: 'abcdef' }], 'X'),
    ).toMatchObject({ value: [{ content: [{ text: 'aX' }, { text: '' }, { text: 'f' }] }] });
    expect(() => replaceRichTextMatches({ type: CellType.RichText, value: null }, [], 'X')).toThrow(
      'Rich-text cell has no document content',
    );
    expect(new SheetFindReplaceError(SheetFindReplaceErrorCode.InvalidRange, 'Invalid').details).toEqual({});
  });

  it('replaces a single rich-text leaf without discarding a neighboring non-text node', () => {
    const previous = {
      type: CellType.RichText,
      value: [
        {
          type: 'paragraph',
          content: [
            { type: 'image', attrs: { source: 'asset' } },
            { type: 'text', text: 'hello', attrs: { bold: true } },
          ],
        },
      ],
    };
    expect(
      replaceRichTextMatches(previous, [{ row: 0, column: 0, start: 1, end: 4, text: 'hello' }], 'i'),
    ).toMatchObject({
      value: [
        {
          content: [
            { type: 'image', attrs: { source: 'asset' } },
            { type: 'text', text: 'hio', attrs: { bold: true } },
          ],
        },
      ],
    });
  });
});
