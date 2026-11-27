import { SheetDataValidationView } from '../src/sheet/dataValidation/SheetDataValidationView';
import {
  CellCommitStrategyRegistry,
  CellType,
  DefaultStringCellCommitStrategy,
  NumberCellCommitStrategy,
  SheetCellInputValidationRegistry,
} from '@searsuite/sear-domain-cell-types';
import {
  defineSheetCommand,
  LocalActionCommand,
  SheetCommandBus,
  SheetQueryRegistry,
} from '@searsuite/sear-assembly-commands';
import { SheetDataFieldNamespace } from '@searsuite/sear-domain-sheet';
import { type DataEngine } from '@searsuite/sear-domain-state';
import { MatrixOTActionName, createUpdateCellOTOperation } from '@searsuite/sear-domain-ot';
import { createTransaction } from '@searsuite/sear-domain-transaction';
import { ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import { SheetDataPlugin } from '@searsuite/sear-plugin-sheet-data';
import { SheetCellVisualReaderRegistry } from '@searsuite/sear-render-registry';
import {
  DataValidationDropdownMode,
  DataValidationInputPolicy,
  DataValidationKind,
  DataValidationMatrix,
  DataValidationOperator,
  DataValidationTextMode,
  DataValidationEvaluatorRegistry,
  DataValidationWarningObservation,
  SheetDataValidationPlugin,
  evaluateDataValidation,
  ClearDataValidationRulesCommand,
  ReadDataValidationCellRulesQuery,
  ReadDataValidationRulesQuery,
  ReadDataValidationIssueQuery,
  RemoveDataValidationRuleCommand,
  SetDataValidationRuleCommand,
  CanEvaluateDataValidationKindQuery,
  readSheetDataValidations,
  type DataValidationRule,
  UnregisterDataValidationEvaluatorCommand,
} from '@searsuite/sear-plugin-data-validation';

const context = { row: 0, column: 0 };

function rule(endRow = 2): DataValidationRule {
  return {
    id: 'rule-1',
    endRow,
    endColumn: 1,
    condition: {
      kind: DataValidationKind.Number,
      integerOnly: true,
      operator: DataValidationOperator.Between,
      value: '2',
      secondValue: '10',
    },
    inputPolicy: DataValidationInputPolicy.Reject,
    errorMessage: 'Enter an integer from 2 to 10',
  };
}

function commandFixture(evaluators = new DataValidationEvaluatorRegistry()) {
  const matrix = new DataValidationMatrix(void 0, [6, 4]);
  let nextId = 0;
  const plugin = new SheetDataValidationPlugin(
    { dataValidations: matrix },
    {
      inputValidation: new SheetCellInputValidationRegistry(),
      evaluators,
      createId: () => `rule-${++nextId}`,
    },
  );
  const commands = new SheetCommandBus();
  const queries = new SheetQueryRegistry();
  commands.bind({
    executePipeline: (pipeline) => {
      for (const step of pipeline.steps) if (step.transaction) plugin.apply(plugin.getState(), step.transaction);
    },
    applyEffect: () => {},
  });
  plugin.registerCommands(commands);
  plugin.registerQueries(queries);
  return { matrix, plugin, commands, queries };
}

describe('sheet data validation', () => {
  it('evaluates numeric, date, text, dropdown and identity rules', () => {
    expect(evaluateDataValidation(rule().condition, '4', context)).toBe(true);
    expect(evaluateDataValidation(rule().condition, '4.5', context)).toBe(false);
    expect(evaluateDataValidation(rule().condition, '11', context)).toBe(false);
    expect(
      evaluateDataValidation(
        {
          kind: DataValidationKind.Date,
          operator: DataValidationOperator.Between,
          value: '2026-01-01',
          secondValue: '2026-12-31',
        },
        '2026-06-01',
        context,
      ),
    ).toBe(true);
    expect(
      evaluateDataValidation(
        {
          kind: DataValidationKind.Date,
          operator: DataValidationOperator.Between,
          value: '2026/10/01',
          secondValue: '2026-10-31',
        },
        '2026/10/21',
        context,
      ),
    ).toBe(true);
    expect(evaluateDataValidation({ kind: DataValidationKind.Date }, '2026\u5e7410\u670821\u65e5', context)).toBe(true);
    expect(evaluateDataValidation({ kind: DataValidationKind.Date }, '2026/02/30', context)).toBe(false);
    expect(evaluateDataValidation({ kind: DataValidationKind.Date }, '21/10/2026', context)).toBe(false);
    expect(evaluateDataValidation({ kind: DataValidationKind.Date }, '2026-02-30', context)).toBe(false);
    expect(
      evaluateDataValidation(
        { kind: DataValidationKind.Date, operator: DataValidationOperator.Equal, value: '2026-03-02' },
        '46083',
        context,
      ),
    ).toBe(true);
    expect(
      evaluateDataValidation(
        {
          kind: DataValidationKind.Text,
          textMode: DataValidationTextMode.Length,
          operator: DataValidationOperator.GreaterOrEqual,
          value: '3',
        },
        'abc',
        context,
      ),
    ).toBe(true);
    expect(
      evaluateDataValidation(
        { kind: DataValidationKind.Text, operator: DataValidationOperator.Contains, value: 'abc' },
        'xabcx',
        context,
      ),
    ).toBe(true);
    expect(
      evaluateDataValidation(
        {
          kind: DataValidationKind.Dropdown,
          dropdownMode: DataValidationDropdownMode.Multiple,
          options: [{ label: 'A' }, { label: 'B' }],
        },
        'A, B',
        context,
      ),
    ).toBe(true);
    expect(
      evaluateDataValidation({ kind: DataValidationKind.Dropdown, sourceRange: { start: [0, 0], end: [2, 0] } }, 'B', {
        ...context,
        readSourceValues: () => ['A', 'B'],
      }),
    ).toBe(true);
    expect(evaluateDataValidation({ kind: DataValidationKind.Phone }, '13800138000', context)).toBe(true);
    expect(evaluateDataValidation({ kind: DataValidationKind.IdentityCard }, '11010519491231002X', context)).toBe(true);
  });

  it('BUG-875 rejects repeated multi-select values but accepts distinct choices', () => {
    const matrix = new DataValidationMatrix(void 0, [1, 1]);
    matrix.setItem(0, 0, [
      {
        ...rule(0),
        endColumn: 0,
        condition: {
          kind: DataValidationKind.Dropdown,
          dropdownMode: DataValidationDropdownMode.Multiple,
          options: [{ label: 'Alpha' }, { label: 'Beta' }],
        },
      },
    ]);
    const registry = new SheetCellInputValidationRegistry();
    const plugin = new SheetDataValidationPlugin(
      { dataValidations: matrix },
      {
        inputValidation: registry,
        evaluators: new DataValidationEvaluatorRegistry(),
        createId: () => 'next',
      },
    );
    expect(registry.validate(0, 0, 'Alpha, Alpha')).toMatchObject({ valid: false, reject: true });
    expect(registry.validate(0, 0, 'Alpha, Beta')).toMatchObject({ valid: true });
    expect(registry.validate(0, 0, 'Alpha')).toMatchObject({ valid: true });
    plugin.dispose();
  });

  it('BUG-456 accepts an exact dropdown label containing a comma', () => {
    const condition = {
      kind: DataValidationKind.Dropdown,
      dropdownMode: DataValidationDropdownMode.Multiple,
      options: [{ label: 'A,B' }, { label: 'C' }],
    };
    expect(evaluateDataValidation(condition, 'A,B', context)).toBe(true);
    expect(evaluateDataValidation(condition, '"A,B", C', context)).toBe(true);
    expect(evaluateDataValidation(condition, 'A, B', context)).toBe(false);
    expect(
      evaluateDataValidation(
        { ...condition, options: [...condition.options, { label: 'A' }, { label: 'B' }] },
        'A, B',
        context,
      ),
    ).toBe(true);
  });

  it('BUG-627 uses the same UTF-16 length as LEN for text validation', () => {
    const matrix = new DataValidationMatrix(void 0, [1, 2]);
    for (const [column, length] of [1, 2].entries()) {
      matrix.setItem(0, column, [
        {
          ...rule(0),
          id: `rule-${column}`,
          endColumn: column,
          condition: {
            kind: DataValidationKind.Text,
            textMode: DataValidationTextMode.Length,
            operator: DataValidationOperator.Equal,
            value: String(length),
          },
        },
      ]);
    }
    const registry = new SheetCellInputValidationRegistry();
    const plugin = new SheetDataValidationPlugin(
      { dataValidations: matrix },
      {
        inputValidation: registry,
        evaluators: new DataValidationEvaluatorRegistry(),
        createId: () => 'next',
      },
    );
    const emoji = '\u{1F642}';
    expect(registry.validate(0, 0, emoji)).toMatchObject({ valid: false, reject: true });
    expect(registry.validate(0, 1, emoji)).toMatchObject({ valid: true });
    expect(registry.validate(0, 0, 'A')).toMatchObject({ valid: true });
    plugin.dispose();
  });

  it('BUG-453 and BUG-652 reject links without a host and allow a valid HTTP link', () => {
    const matrix = new DataValidationMatrix(void 0, [2, 2]);
    matrix.setItem(0, 0, [{ ...rule(0), endColumn: 0, condition: { kind: DataValidationKind.Link } }]);
    const registry = new SheetCellInputValidationRegistry();
    const plugin = new SheetDataValidationPlugin(
      { dataValidations: matrix },
      {
        inputValidation: registry,
        evaluators: new DataValidationEvaluatorRegistry(),
        createId: () => 'next',
      },
    );
    expect(registry.validate(0, 0, 'http://:')).toMatchObject({ valid: false, reject: true });
    expect(registry.validate(0, 0, 'https://?')).toMatchObject({ valid: false, reject: true });
    expect(registry.validate(0, 0, 'https://example.com/path')).toMatchObject({ valid: true });
    plugin.dispose();
  });

  it('BUG-543 blocks image and attachment input without a host evaluator', () => {
    const matrix = new DataValidationMatrix(void 0, [1, 2]);
    for (const [column, kind] of [DataValidationKind.Image, DataValidationKind.Attachment].entries()) {
      matrix.setItem(0, column, [{ ...rule(0), id: `rule-${column}`, endColumn: column, condition: { kind } }]);
    }
    const registry = new SheetCellInputValidationRegistry();
    const evaluators = new DataValidationEvaluatorRegistry();
    const plugin = new SheetDataValidationPlugin(
      { dataValidations: matrix },
      {
        inputValidation: registry,
        evaluators,
        createId: () => 'next',
      },
    );
    for (const [column, value] of ['https://example.com/a.png', 'report.pdf'].entries()) {
      expect(registry.validate(0, column, value)).toMatchObject({
        valid: false,
        reject: true,
        ruleId: `rule-${column}`,
        message: expect.stringContaining('validator'),
      });
      expect(registry.validate(0, column, '')).toMatchObject({ valid: true, reject: false });
    }
    evaluators.register(DataValidationKind.Image, (_condition, value) => value.endsWith('.png'));
    expect(registry.validate(0, 0, 'https://example.com/a.png')).toMatchObject({ valid: true, reject: false });
    expect(registry.validate(0, 0, 'https://example.com/a.jpg')).toMatchObject({ valid: false, reject: true });
    plugin.dispose();
  });

  it('reports host evaluator availability for structured and formula rules', () => {
    const evaluators = new DataValidationEvaluatorRegistry();
    const { plugin, queries } = commandFixture(evaluators);
    const externalKinds = [
      DataValidationKind.Person,
      DataValidationKind.Document,
      DataValidationKind.Image,
      DataValidationKind.Attachment,
      DataValidationKind.Formula,
    ];
    for (const kind of externalKinds) expect(queries.run(CanEvaluateDataValidationKindQuery, kind)).toBe(false);
    expect(queries.run(CanEvaluateDataValidationKindQuery, DataValidationKind.Number)).toBe(true);
    const dispose = evaluators.register(DataValidationKind.Person, () => true);
    expect(queries.run(CanEvaluateDataValidationKindQuery, DataValidationKind.Person)).toBe(true);
    dispose();
    expect(queries.run(CanEvaluateDataValidationKindQuery, DataValidationKind.Person)).toBe(false);
    plugin.dispose();
  });

  it('BUG-454 and BUG-639 reject radix-prefixed text across numeric rules', () => {
    const matrix = new DataValidationMatrix(void 0, [1, 3]);
    for (const [column, kind] of [
      DataValidationKind.Number,
      DataValidationKind.Progress,
      DataValidationKind.Rating,
    ].entries()) {
      matrix.setItem(0, column, [{ ...rule(0), id: `rule-${column}`, endColumn: column, condition: { kind } }]);
    }
    const registry = new SheetCellInputValidationRegistry();
    const plugin = new SheetDataValidationPlugin(
      { dataValidations: matrix },
      {
        inputValidation: registry,
        evaluators: new DataValidationEvaluatorRegistry(),
        createId: () => 'next',
      },
    );
    expect(registry.validate(0, 0, '0x10')).toMatchObject({ valid: false, reject: true });
    expect(registry.validate(0, 1, '0x64')).toMatchObject({ valid: false, reject: true });
    expect(registry.validate(0, 2, '0x5')).toMatchObject({ valid: false, reject: true });
    expect(registry.validate(0, 0, '16')).toMatchObject({ valid: true });
    expect(registry.validate(0, 1, '100')).toMatchObject({ valid: true });
    expect(registry.validate(0, 2, '5')).toMatchObject({ valid: true });
    plugin.dispose();
  });

  it('keeps range anchors sparse and applies reject or warning policies', () => {
    const matrix = new DataValidationMatrix(void 0, [1_000_000, 2]);
    matrix.setItem(0, 0, [rule(999_999)]);
    expect(matrix.getRules()).toHaveLength(1);
    expect(matrix.findRules(999_999, 1)).toHaveLength(1);
    expect(matrix.findRules(1, 0)).toHaveLength(1);
    const registry = new SheetCellInputValidationRegistry();
    const plugin = new SheetDataValidationPlugin(
      { dataValidations: matrix },
      {
        inputValidation: registry,
        evaluators: new DataValidationEvaluatorRegistry(),
        createId: () => 'next',
      },
    );
    expect(registry.validate(1, 0, '4').valid).toBe(true);
    expect(registry.validate(1, 0, '11')).toMatchObject({ valid: false, reject: true, ruleId: 'rule-1' });
    matrix.setItem(0, 0, [{ ...rule(999_999), inputPolicy: DataValidationInputPolicy.Warn }]);
    expect(registry.validate(1, 0, '11')).toMatchObject({ valid: false, reject: false });
    const clone = matrix.clone();
    clone.setItem(0, 0, null);
    expect(matrix.findRules(1, 0)).toHaveLength(1);
    plugin.dispose();
    expect(registry.validate(1, 0, '11').valid).toBe(true);
  });

  it('keeps a committed rule index private to its matrix', () => {
    const matrix = new DataValidationMatrix(void 0, [3, 2]);
    matrix.setItem(0, 0, [rule()]);
    matrix.lockMutations();

    expect(() => {
      (matrix as unknown as { rangeIndex: unknown }).rangeIndex = [];
    }).toThrow();
    expect(matrix.findRules(2, 1)).toHaveLength(1);
  });

  it('uses a host evaluator for structured values and custom formulas', () => {
    const condition = { kind: DataValidationKind.Formula, formula: '=A1>0' };
    expect(evaluateDataValidation(condition, '4', context)).toBeNull();
    expect(
      evaluateDataValidation(condition, '4', {
        ...context,
        evaluateExternal: (_rule, value) => Number(value) > 0,
      }),
    ).toBe(true);
    expect(
      evaluateDataValidation({ kind: DataValidationKind.Date }, '21/10/2026', {
        ...context,
        evaluateExternal: () => true,
      }),
    ).toBe(true);
  });

  it.each([
    [DataValidationOperator.Equal, '5', true],
    [DataValidationOperator.NotEqual, '5', false],
    [DataValidationOperator.Greater, '6', true],
    [DataValidationOperator.GreaterOrEqual, '5', true],
    [DataValidationOperator.Less, '4', true],
    [DataValidationOperator.LessOrEqual, '5', true],
    [DataValidationOperator.Between, '5', true],
    [DataValidationOperator.NotBetween, '12', true],
  ])('evaluates numeric operator %s', (operator, input, expected) => {
    expect(
      evaluateDataValidation(
        { kind: DataValidationKind.Number, operator, value: '5', secondValue: '10' },
        input,
        context,
      ),
    ).toBe(expected);
  });

  it('covers invalid numeric and date bounds and text comparisons', () => {
    expect(evaluateDataValidation({ kind: DataValidationKind.Number }, 'not a number', context)).toBe(false);
    expect(evaluateDataValidation({ kind: DataValidationKind.Number }, '', context)).toBe(true);
    expect(
      evaluateDataValidation(
        { kind: DataValidationKind.Number, operator: DataValidationOperator.Equal, value: 'bad' },
        '5',
        context,
      ),
    ).toBe(false);
    expect(
      evaluateDataValidation(
        { kind: DataValidationKind.Number, operator: DataValidationOperator.Between, value: '1' },
        '2',
        context,
      ),
    ).toBe(false);
    expect(evaluateDataValidation({ kind: DataValidationKind.Date }, 'bad', context)).toBe(false);
    expect(evaluateDataValidation({ kind: DataValidationKind.Date }, '2026-13-01', context)).toBe(false);
    for (const [operator, text, expected] of [
      [DataValidationOperator.StartsWith, 'fixation', true],
      [DataValidationOperator.EndsWith, 'prefix', true],
      [DataValidationOperator.Contains, 'infix', true],
      [DataValidationOperator.NotContains, 'other', true],
      [DataValidationOperator.Equal, 'fix', true],
      [DataValidationOperator.NotEqual, 'different', true],
    ] as const) {
      expect(evaluateDataValidation({ kind: DataValidationKind.Text, operator, value: 'fix' }, text, context)).toBe(
        expected,
      );
    }
  });

  it('checks dropdown and built-in structured value boundaries', () => {
    const dropdown = { kind: DataValidationKind.Dropdown, options: [{ label: 'A' }, { label: 'B' }] };
    expect(evaluateDataValidation(dropdown, 'C', context)).toBe(false);
    expect(
      evaluateDataValidation(
        { kind: DataValidationKind.Dropdown, sourceRange: { start: [0, 0], end: [1, 0] } },
        'A',
        context,
      ),
    ).toBeNull();
    expect(evaluateDataValidation({ kind: DataValidationKind.Checkbox }, 'true', context)).toBe(true);
    expect(evaluateDataValidation({ kind: DataValidationKind.Checkbox }, 'yes', context)).toBe(false);
    expect(evaluateDataValidation({ kind: DataValidationKind.Progress }, '100', context)).toBe(true);
    expect(evaluateDataValidation({ kind: DataValidationKind.Progress }, '101', context)).toBe(false);
    expect(evaluateDataValidation({ kind: DataValidationKind.Rating }, '5', context)).toBe(true);
    expect(evaluateDataValidation({ kind: DataValidationKind.Rating }, '5.5', context)).toBe(false);
    expect(evaluateDataValidation({ kind: DataValidationKind.Link }, 'https://example.com', context)).toBe(true);
    expect(evaluateDataValidation({ kind: DataValidationKind.Link }, 'invalid', context)).toBe(false);
    expect(evaluateDataValidation({ kind: DataValidationKind.Phone }, '123', context)).toBe(false);
    expect(evaluateDataValidation({ kind: DataValidationKind.IdentityCard }, '110105194912310020', context)).toBe(
      false,
    );
    expect(evaluateDataValidation({ kind: DataValidationKind.Person }, 'alice', context)).toBeNull();
  });

  it('BUG-473 rejects an identity number with an all-zero region code', () => {
    const condition = { kind: DataValidationKind.IdentityCard };
    expect(evaluateDataValidation(condition, '00000019491231006X', context)).toBe(false);
    expect(evaluateDataValidation(condition, '11010519491231002X', context)).toBe(true);
  });

  it('BUG-629 rejects a nonexistent identity region even when the checksum is valid', () => {
    const condition = { kind: DataValidationKind.IdentityCard };
    expect(evaluateDataValidation(condition, '999999194912310025', context)).toBe(false);
    expect(evaluateDataValidation(condition, '11019919491231002X', context)).toBe(false);
    expect(evaluateDataValidation(condition, '11010519491231002X', context)).toBe(true);
  });

  it('BUG-630 rejects mailto links without a valid recipient', () => {
    const condition = { kind: DataValidationKind.Link };
    expect(evaluateDataValidation(condition, 'mailto:not-an-email', context)).toBe(false);
    expect(evaluateDataValidation(condition, 'mailto:', context)).toBe(false);
    expect(evaluateDataValidation(condition, 'mailto:alice@example.com', context)).toBe(true);
    expect(evaluateDataValidation(condition, 'mailto:alice+tag@example.com?subject=Hello', context)).toBe(true);
    expect(evaluateDataValidation(condition, 'https://example.com', context)).toBe(true);
  });

  it('BUG-540 rejects an identity number with sequence 000', () => {
    const condition = { kind: DataValidationKind.IdentityCard };
    expect(evaluateDataValidation(condition, '11010519491218000X', context)).toBe(false);
    expect(evaluateDataValidation(condition, '11010519491231002X', context)).toBe(true);
  });

  it('BUG-474 rejects a future birth date using the host wall-clock time', () => {
    const condition = { kind: DataValidationKind.IdentityCard };
    const candidate = '11010520991231007X';
    expect(
      evaluateDataValidation(condition, candidate, {
        ...context,
        currentDateTime: Date.UTC(2026, 10, 5),
      }),
    ).toBe(false);
    expect(
      evaluateDataValidation(condition, candidate, {
        ...context,
        currentDateTime: Date.UTC(2100, 0, 1),
      }),
    ).toBe(true);
    expect(
      evaluateDataValidation(condition, '11010519491231002X', {
        ...context,
        currentDateTime: Date.UTC(2026, 10, 5),
      }),
    ).toBe(true);
  });

  it('BUG-472 commits an all-digit identity as exact text only within its rule', () => {
    const matrix = new DataValidationMatrix(void 0, [2, 2]);
    matrix.setItem(0, 0, [{ ...rule(0), endColumn: 0, condition: { kind: DataValidationKind.IdentityCard } }]);
    let storedValue: unknown = null;
    const plugin = new SheetDataValidationPlugin(
      { dataValidations: matrix },
      {
        inputValidation: new SheetCellInputValidationRegistry(),
        evaluators: new DataValidationEvaluatorRegistry(),
        createId: () => 'next',
        readValue: () => storedValue,
      },
    );
    const commits = new CellCommitStrategyRegistry();
    commits.register(new DefaultStringCellCommitStrategy());
    commits.register(new NumberCellCommitStrategy());
    plugin.registerCommitStrategies(commits);
    const text = '110105194912310011';
    const input = { row: 0, col: 0, plainText: text, richText: [], previous: null };

    expect(plugin.validate(0, 0, text)).toMatchObject({ valid: true, reject: false });
    const committed = commits.commit(input);
    expect(committed).toEqual({ type: CellType.String, value: text });
    storedValue = committed?.value;
    expect(plugin.readIssue(0, 0)).toBeNull();
    expect(commits.commit({ ...input, col: 1 })?.type).toBe(CellType.Number);
    plugin.dispose();
  });

  it('BUG-524 rejects whitespace while keeping a genuinely empty value allowed', () => {
    const matrix = new DataValidationMatrix(void 0, [2, 2]);
    matrix.setItem(0, 0, [
      {
        ...rule(0),
        endColumn: 0,
        condition: { kind: DataValidationKind.IdentityCard },
        errorMessage: 'Invalid input. Enter a valid ID number.',
      },
    ]);
    const plugin = new SheetDataValidationPlugin(
      { dataValidations: matrix },
      {
        inputValidation: new SheetCellInputValidationRegistry(),
        evaluators: new DataValidationEvaluatorRegistry(),
        createId: () => 'next',
        readValue: () => '   ',
      },
    );
    expect(plugin.validate(0, 0, '   ')).toMatchObject({ valid: false, reject: true });
    expect(plugin.readIssue(0, 0)?.message).toBe('Invalid input. Enter a valid ID number.');
    expect(plugin.validate(0, 0, '')).toMatchObject({ valid: true, reject: false });
    expect(plugin.validate(0, 0, '11010519491231002X')).toMatchObject({ valid: true, reject: false });
    plugin.dispose();
  });

  it('BUG-464 validates the candidate formula result without changing plain text validation', () => {
    const matrix = new DataValidationMatrix(void 0, [2, 2]);
    matrix.setItem(0, 0, [{ ...rule(0), endColumn: 0, condition: { kind: DataValidationKind.IdentityCard } }]);
    const evaluateFormulaInput = jest.fn((formula: string) =>
      formula === '=TEXT(J18,"0")'
        ? { kind: 'text', value: '11010519491231002X', numericCoercion: 'deny' }
        : formula === '="11010519491231002X"'
        ? '11010519491231002X'
        : '123',
    );
    let storedValue: unknown = { kind: 'text', value: '11010519491231002X', numericCoercion: 'deny' };
    const plugin = new SheetDataValidationPlugin(
      { dataValidations: matrix },
      {
        inputValidation: new SheetCellInputValidationRegistry(),
        evaluators: new DataValidationEvaluatorRegistry(),
        createId: () => 'next',
        evaluateFormulaInput,
        readValue: () => storedValue,
      },
    );
    expect(plugin.validate(0, 0, '="11010519491231002X"')).toMatchObject({ valid: true });
    expect(plugin.validate(0, 0, '=TEXT(J18,"0")')).toMatchObject({ valid: true });
    expect(plugin.readIssue(0, 0)).toBeNull();
    storedValue = { kind: 'text', value: '123', numericCoercion: 'deny' };
    expect(plugin.readIssue(0, 0)).not.toBeNull();
    expect(plugin.validate(0, 0, '="123"')).toMatchObject({ valid: false, reject: true });
    expect(plugin.validate(0, 0, '11010519491231002X')).toMatchObject({ valid: true });
    expect(plugin.validate(0, 1, '="123"')).toMatchObject({ valid: true });
    expect(evaluateFormulaInput).toHaveBeenCalledTimes(3);
    plugin.dispose();
  });

  it('registers and disposes host evaluators by kind', () => {
    const registry = new DataValidationEvaluatorRegistry();
    const evaluator = jest.fn(() => true);
    const dispose = registry.register(DataValidationKind.Person, evaluator);
    expect(() => registry.register(DataValidationKind.Person, evaluator)).toThrow();
    expect(registry.evaluate({ kind: DataValidationKind.Person }, 'Alice', 1, 2)).toBe(true);
    expect(evaluator).toHaveBeenCalledWith({ kind: DataValidationKind.Person }, 'Alice', 1, 2);
    dispose();
    dispose();
    expect(registry.evaluate({ kind: DataValidationKind.Person }, 'Alice', 1, 2)).toBeNull();
  });

  it('seals runtime evaluator registration and routes disposal through a command', () => {
    const registry = new DataValidationEvaluatorRegistry();
    const plugin = new SheetDataValidationPlugin(
      { dataValidations: new DataValidationMatrix(void 0, [2, 2]) },
      {
        inputValidation: new SheetCellInputValidationRegistry(),
        evaluators: registry,
        createId: () => 'next',
      },
    );
    const commands = new SheetCommandBus();
    commands.bind({
      executePipeline: (pipeline) => pipeline.steps.forEach((step) => step.localAction?.()),
      applyEffect: () => void 0,
    });
    const RegisterEvaluatorCommand = defineSheetCommand<void>('test.dataValidation.registerEvaluator');
    let disposeEvaluator: (() => void) | undefined;
    commands.register(
      RegisterEvaluatorCommand,
      () =>
        new LocalActionCommand(RegisterEvaluatorCommand.id, () => {
          disposeEvaluator = registry.register(DataValidationKind.Person, () => true);
        }),
    );
    plugin.registerCommands(commands);
    plugin.sealRuntimeWrites();
    const events: string[] = [];
    const unsubscribe = commands.subscribe((event) => {
      if (event.phase === 'completed') events.push(event.id);
    });
    try {
      expect(() => registry.register(DataValidationKind.Person, () => true)).toThrow('editor.commands.run');
      commands.run(RegisterEvaluatorCommand, undefined);
      expect(registry.evaluate({ kind: DataValidationKind.Person }, 'Alice', 0, 0)).toBe(true);
      disposeEvaluator!();
      disposeEvaluator!();
      expect(registry.evaluate({ kind: DataValidationKind.Person }, 'Alice', 0, 0)).toBeNull();
      expect(events).toEqual([RegisterEvaluatorCommand.id, UnregisterDataValidationEvaluatorCommand.id]);
    } finally {
      unsubscribe();
      plugin.dispose();
    }
  });

  it('reads definite failures in existing values and contributes a corner marker', () => {
    const matrix = new DataValidationMatrix(void 0, [2, 2]);
    matrix.setItem(0, 0, [
      {
        ...rule(0),
        endColumn: 0,
        condition: { kind: DataValidationKind.IdentityCard },
        errorMessage: 'Invalid input. Enter a valid ID number.',
      },
    ]);
    let value = '2';
    const plugin = new SheetDataValidationPlugin(
      { dataValidations: matrix },
      {
        inputValidation: new SheetCellInputValidationRegistry(),
        evaluators: new DataValidationEvaluatorRegistry(),
        createId: () => 'next',
        readValue: () => value,
      },
    );
    const queries = new SheetQueryRegistry();
    plugin.registerQueries(queries);
    const readers = new SheetCellVisualReaderRegistry();
    const view = new SheetDataValidationView({
      source: plugin,
      registry: readers,
      commands: new SheetCommandBus(),
      coordinates: { screenToWorld: (x, y) => ({ x, y }) },
      beforeChange: () => true,
    });
    expect(queries.run(ReadDataValidationIssueQuery, [0, 0])).toMatchObject({
      ruleId: 'rule-1',
      message: 'Invalid input. Enter a valid ID number.',
    });
    expect(readers.readVisual({ rowIndex: 0, columnIndex: 0 }).layers).toMatchObject([
      { slot: 'dataValidation.issue', fill: '#ff922b' },
    ]);
    plugin.onTransactionCommitted(createTransaction(SheetDataValidationPlugin.pluginKey));
    value = '11010519491231002X';
    expect(queries.run(ReadDataValidationIssueQuery, [0, 0])).toBeNull();
    expect(readers.readVisual({ rowIndex: 0, columnIndex: 0 }).layers).toEqual([]);
    plugin.dispose();
  });

  it('BUG-556 moves invalid markers with an edited rule range', () => {
    const matrix = new DataValidationMatrix(void 0, [1, 2]);
    const plugin = new SheetDataValidationPlugin(
      { dataValidations: matrix },
      {
        inputValidation: new SheetCellInputValidationRegistry(),
        evaluators: new DataValidationEvaluatorRegistry(),
        createId: () => 'identity-rule',
        readValue: () => '123',
      },
    );
    const commands = new SheetCommandBus();
    const queries = new SheetQueryRegistry();
    const readers = new SheetCellVisualReaderRegistry();
    commands.bind({
      executePipeline: (pipeline) => {
        for (const step of pipeline.steps)
          if (step.transaction) {
            plugin.apply(plugin.getState(), step.transaction);
            plugin.onTransactionCommitted(step.transaction);
          }
      },
      applyEffect: () => {},
    });
    plugin.registerCommands(commands);
    plugin.registerQueries(queries);
    const view = new SheetDataValidationView({
      source: plugin,
      registry: readers,
      commands: new SheetCommandBus(),
      coordinates: { screenToWorld: (x, y) => ({ x, y }) },
      beforeChange: () => true,
    });
    const ruleInput = {
      condition: { kind: DataValidationKind.IdentityCard },
      inputPolicy: DataValidationInputPolicy.Warn,
    };

    commands.run(SetDataValidationRuleCommand, { anchor: [0, 0], focus: [0, 0], rule: ruleInput });
    expect(readers.readVisual({ rowIndex: 0, columnIndex: 0 }).layers).toMatchObject([
      { slot: 'dataValidation.issue', fill: '#ff922b' },
    ]);
    expect(readers.readVisual({ rowIndex: 0, columnIndex: 1 }).layers).toEqual([]);

    commands.run(SetDataValidationRuleCommand, {
      anchor: [0, 1],
      focus: [0, 1],
      id: 'identity-rule',
      rule: ruleInput,
    });
    expect(queries.run(ReadDataValidationCellRulesQuery, [0, 0])).toEqual([]);
    expect(queries.run(ReadDataValidationIssueQuery, [0, 0])).toBeNull();
    expect(readers.readVisual({ rowIndex: 0, columnIndex: 0 }).layers).toEqual([]);
    expect(plugin.validate(0, 0, '123')).toMatchObject({ valid: true });
    expect(queries.run(ReadDataValidationIssueQuery, [0, 1])?.ruleId).toBe('identity-rule');
    expect(readers.readVisual({ rowIndex: 0, columnIndex: 1 }).layers).toMatchObject([
      { slot: 'dataValidation.issue', fill: '#ff922b' },
    ]);
    expect(plugin.validate(0, 1, '123')).toMatchObject({ valid: false, reject: false });

    commands.run(RemoveDataValidationRuleCommand, { id: 'identity-rule' });
    expect(readers.readVisual({ rowIndex: 0, columnIndex: 1 }).layers).toEqual([]);
    plugin.dispose();
  });

  it('publishes an invalid-value warning after a committed cell update', () => {
    const matrix = new DataValidationMatrix(void 0, [3, 2]);
    matrix.setItem(0, 0, [{ ...rule(), inputPolicy: DataValidationInputPolicy.Warn }]);
    const plugin = new SheetDataValidationPlugin(
      { dataValidations: matrix },
      {
        inputValidation: new SheetCellInputValidationRegistry(),
        evaluators: new DataValidationEvaluatorRegistry(),
        createId: () => 'next',
        readValue: () => '11',
      },
    );
    const observations = new ObservationRegistry();
    plugin.registerObservations(observations);
    const listener = jest.fn();
    observations.subscribe(DataValidationWarningObservation, listener);
    const transaction = createTransaction(SheetDataPlugin.pluginKey, [
      createUpdateCellOTOperation([1, 0], { type: 'number', value: 11 }, null),
    ]);
    plugin.onTransactionCommitted(transaction);
    expect(listener).toHaveBeenCalledWith({
      row: 1,
      column: 0,
      ruleId: 'rule-1',
      message: 'Enter an integer from 2 to 10',
    });
    observations.destroy();
    plugin.dispose();
  });

  it('BUG-626 accepts a stored date serial when a date rule is added to an existing cell', () => {
    const matrix = new DataValidationMatrix(void 0, [22, 13]);
    matrix.setItem(20, 12, [
      {
        id: 'date-m21',
        endRow: 20,
        endColumn: 12,
        condition: { kind: DataValidationKind.Date },
        inputPolicy: DataValidationInputPolicy.Reject,
      },
    ]);
    let value = '45200';
    const plugin = new SheetDataValidationPlugin(
      { dataValidations: matrix },
      {
        inputValidation: new SheetCellInputValidationRegistry(),
        evaluators: new DataValidationEvaluatorRegistry(),
        createId: () => 'next',
        readValue: () => value,
      },
    );
    const queries = new SheetQueryRegistry();
    plugin.registerQueries(queries);
    expect(queries.run(ReadDataValidationIssueQuery, [20, 12])).toBeNull();
    value = 'not-a-date';
    expect(queries.run(ReadDataValidationIssueQuery, [20, 12])).toMatchObject({ ruleId: 'date-m21' });
    value = '45200';
    expect(queries.run(ReadDataValidationIssueQuery, [20, 12])).toBeNull();
    plugin.dispose();
  });

  it('moves rules with row structure operations', () => {
    const matrix = new DataValidationMatrix(void 0, [4, 2]);
    matrix.setItem(1, 0, [rule(2)]);
    const plugin = new SheetDataValidationPlugin(
      { dataValidations: matrix },
      {
        inputValidation: new SheetCellInputValidationRegistry(),
        evaluators: new DataValidationEvaluatorRegistry(),
        createId: () => 'next',
      },
    );
    const transaction = createTransaction({ key: 'sheet.data' });
    transaction.addOperation([{ p: [0], [MatrixOTActionName.RowInsert]: [] } as never]);
    plugin.apply(plugin.getState(), transaction);
    expect(matrix.getRules()).toEqual([{ row: 2, column: 0, rule: { ...rule(2), endRow: 3 } }]);
    plugin.dispose();
  });

  it('rebases referenced option ranges with row insertion', () => {
    const matrix = new DataValidationMatrix(void 0, [4, 2]);
    matrix.setItem(1, 0, [
      {
        ...rule(2),
        condition: {
          kind: DataValidationKind.Dropdown,
          sourceRange: { start: [1, 1], end: [2, 1] },
        },
      },
    ]);
    const plugin = new SheetDataValidationPlugin(
      { dataValidations: matrix },
      {
        inputValidation: new SheetCellInputValidationRegistry(),
        evaluators: new DataValidationEvaluatorRegistry(),
        createId: () => 'next',
      },
    );
    const transaction = createTransaction({ key: 'sheet.data' });
    transaction.addOperation([{ p: [0], [MatrixOTActionName.RowInsert]: [] } as never]);
    plugin.apply(plugin.getState(), transaction);
    expect(matrix.getRules()[0]).toMatchObject({
      row: 2,
      rule: {
        condition: { sourceRange: { start: [2, 1], end: [3, 1] } },
      },
    });
    plugin.dispose();
  });

  it('BUG-944 retains the last referenced option when inserting before its row', () => {
    const matrix = new DataValidationMatrix(void 0, [80, 6]);
    matrix.setItem(70, 5, [
      {
        ...rule(70),
        endColumn: 5,
        condition: {
          kind: DataValidationKind.Dropdown,
          sourceRange: { start: [70, 1], end: [71, 1] },
        },
      },
    ]);
    const sourceValues = new Map([
      [70, 'Yellow'],
      [71, 'Blue'],
    ]);
    const plugin = new SheetDataValidationPlugin(
      { dataValidations: matrix },
      {
        inputValidation: new SheetCellInputValidationRegistry(),
        evaluators: new DataValidationEvaluatorRegistry(),
        createId: () => 'next',
        readSourceValues: (start, end) =>
          Array.from({ length: end[0] - start[0] + 1 }, (_, offset) => sourceValues.get(start[0] + offset)).filter(
            (value): value is string => value !== undefined,
          ),
      },
    );
    const transaction = createTransaction({ key: 'sheet.data' });
    transaction.addOperation([{ p: [71], [MatrixOTActionName.RowInsert]: [] } as never]);
    sourceValues.set(72, sourceValues.get(71)!);
    sourceValues.delete(71);
    plugin.apply(plugin.getState(), transaction);
    expect(matrix.getRules()[0]).toMatchObject({
      row: 70,
      rule: {
        condition: { sourceRange: { start: [70, 1], end: [72, 1] } },
      },
    });
    expect(plugin.validate(70, 5, 'Blue').valid).toBe(true);
    plugin.dispose();
  });

  it('BUG-955 keeps the shifted last target row under its rule', () => {
    const matrix = new DataValidationMatrix(void 0, [30, 7]);
    matrix.setItem(19, 6, [
      {
        ...rule(20),
        endColumn: 6,
        condition: {
          kind: DataValidationKind.Dropdown,
          options: [{ label: 'red' }, { label: 'blue' }],
        },
      },
    ]);
    const plugin = new SheetDataValidationPlugin(
      { dataValidations: matrix },
      {
        inputValidation: new SheetCellInputValidationRegistry(),
        evaluators: new DataValidationEvaluatorRegistry(),
        createId: () => 'next',
      },
    );
    const transaction = createTransaction({ key: 'sheet.data' });
    transaction.addOperation([{ p: [20], [MatrixOTActionName.RowInsert]: [] } as never]);
    plugin.apply(plugin.getState(), transaction);
    expect(matrix.getRules()[0]).toMatchObject({ row: 19, rule: { endRow: 21 } });
    expect(plugin.validate(21, 6, 'blue').valid).toBe(true);
    plugin.dispose();
  });

  it('creates, moves and removes rules through typed commands and queries', () => {
    const { commands, queries, plugin } = commandFixture();
    const condition = { kind: DataValidationKind.Number, integerOnly: true };
    commands.run(SetDataValidationRuleCommand, {
      anchor: [2, 1],
      focus: [1, 0],
      rule: { condition, inputPolicy: DataValidationInputPolicy.Reject },
    });
    expect(queries.run(ReadDataValidationCellRulesQuery, [1, 0])).toHaveLength(1);
    expect(queries.run(ReadDataValidationCellRulesQuery, [2, 1])[0]?.rule.id).toBe('rule-1');
    commands.run(SetDataValidationRuleCommand, {
      id: 'rule-1',
      anchor: [3, 2],
      focus: [4, 3],
      rule: { condition, inputPolicy: DataValidationInputPolicy.Warn },
    });
    expect(queries.run(ReadDataValidationCellRulesQuery, [1, 0])).toEqual([]);
    expect(queries.run(ReadDataValidationRulesQuery, void 0)).toMatchObject([
      { row: 3, column: 2, rule: { id: 'rule-1', endRow: 4, endColumn: 3 } },
    ]);
    commands.run(RemoveDataValidationRuleCommand, { id: 'missing' });
    commands.run(RemoveDataValidationRuleCommand, { id: 'rule-1' });
    expect(queries.run(ReadDataValidationRulesQuery, void 0)).toEqual([]);
    plugin.dispose();
  });

  it('clears only the intersecting range and preserves the surrounding fragments', () => {
    const { commands, queries, plugin } = commandFixture();
    commands.run(SetDataValidationRuleCommand, {
      anchor: [0, 0],
      focus: [3, 2],
      rule: { condition: { kind: DataValidationKind.Checkbox }, inputPolicy: DataValidationInputPolicy.Reject },
    });
    commands.run(ClearDataValidationRulesCommand, { range: { anchor: [1, 1], focus: [2, 1] } });
    expect(queries.run(ReadDataValidationCellRulesQuery, [1, 1])).toEqual([]);
    expect(queries.run(ReadDataValidationCellRulesQuery, [0, 0])).toHaveLength(1);
    expect(queries.run(ReadDataValidationCellRulesQuery, [3, 2])).toHaveLength(1);
    expect(queries.run(ReadDataValidationRulesQuery, void 0).length).toBeGreaterThan(1);
    commands.run(ClearDataValidationRulesCommand, {});
    expect(queries.run(ReadDataValidationRulesQuery, void 0)).toEqual([]);
    plugin.dispose();
  });

  it('rejects invalid ranges and incomplete rule conditions before mutation', () => {
    const { commands, matrix, plugin } = commandFixture();
    const valid = { condition: { kind: DataValidationKind.Number }, inputPolicy: DataValidationInputPolicy.Reject };
    for (const range of [
      { anchor: [-1, 0] as const, focus: [0, 0] as const },
      { anchor: [0, 0] as const, focus: [6, 0] as const },
      { anchor: [0.5, 0] as const, focus: [1, 0] as const },
    ])
      expect(() => commands.run(SetDataValidationRuleCommand, { ...range, rule: valid })).toThrow();
    for (const condition of [
      { kind: DataValidationKind.Dropdown },
      { kind: DataValidationKind.Formula },
      { kind: DataValidationKind.Number, operator: DataValidationOperator.Between, value: '1' },
    ])
      expect(() =>
        commands.run(SetDataValidationRuleCommand, {
          anchor: [0, 0],
          focus: [0, 0],
          rule: { condition, inputPolicy: DataValidationInputPolicy.Reject },
        }),
      ).toThrow();
    expect(matrix.getRules()).toEqual([]);
    plugin.dispose();
  });

  it('BUG-558 rejects indistinguishable dropdown options before saving a rule', () => {
    const { commands, queries, plugin } = commandFixture();
    for (const labels of [
      ['A', 'A'],
      ['A', ' A '],
    ]) {
      expect(() =>
        commands.run(SetDataValidationRuleCommand, {
          anchor: [0, 0],
          focus: [0, 0],
          rule: {
            condition: { kind: DataValidationKind.Dropdown, options: labels.map((label) => ({ label })) },
            inputPolicy: DataValidationInputPolicy.Reject,
          },
        }),
      ).toThrow('Dropdown options must have distinct labels.');
    }
    expect(queries.run(ReadDataValidationRulesQuery, void 0)).toEqual([]);
    commands.run(SetDataValidationRuleCommand, {
      anchor: [0, 0],
      focus: [0, 0],
      rule: {
        condition: { kind: DataValidationKind.Dropdown, options: [{ label: 'A' }, { label: 'B' }] },
        inputPolicy: DataValidationInputPolicy.Reject,
      },
    });
    expect(queries.run(ReadDataValidationRulesQuery, void 0)).toHaveLength(1);
    plugin.dispose();
  });

  it('BUG-560 rejects overlapping rules with no shared input and accepts compatible options', () => {
    for (const dropdownFirst of [true, false]) {
      const { commands, queries, plugin } = commandFixture();
      const dropdown = {
        condition: { kind: DataValidationKind.Dropdown, options: [{ label: 'A' }] },
        inputPolicy: DataValidationInputPolicy.Reject,
      };
      const number = { condition: { kind: DataValidationKind.Number }, inputPolicy: DataValidationInputPolicy.Reject };
      const range = { anchor: [0, 0] as const, focus: [0, 0] as const };
      commands.run(SetDataValidationRuleCommand, { ...range, rule: dropdownFirst ? dropdown : number });
      expect(() =>
        commands.run(SetDataValidationRuleCommand, {
          ...range,
          rule: dropdownFirst ? number : dropdown,
        }),
      ).toThrow('Overlapping validation rules have no valid input.');
      expect(queries.run(ReadDataValidationCellRulesQuery, [0, 0])).toHaveLength(1);
      expect(plugin.validate(0, 0, dropdownFirst ? 'A' : '123')).toMatchObject({ valid: true });

      if (dropdownFirst) {
        const id = queries.run(ReadDataValidationCellRulesQuery, [0, 0])[0]!.rule.id;
        commands.run(SetDataValidationRuleCommand, {
          ...range,
          id,
          rule: { ...dropdown, condition: { ...dropdown.condition, options: [{ label: '123' }] } },
        });
        commands.run(SetDataValidationRuleCommand, { ...range, rule: number });
        expect(queries.run(ReadDataValidationCellRulesQuery, [0, 0])).toHaveLength(2);
        expect(plugin.validate(0, 0, '123')).toMatchObject({ valid: true });
      }
      plugin.dispose();
    }
  });

  it('BUG-560 keeps valid multi-select combinations and host evaluator results', () => {
    const range = { anchor: [0, 0] as const, focus: [0, 0] as const };
    const { commands, plugin } = commandFixture();
    commands.run(SetDataValidationRuleCommand, {
      ...range,
      rule: {
        condition: {
          kind: DataValidationKind.Dropdown,
          dropdownMode: DataValidationDropdownMode.Multiple,
          options: [{ label: 'A' }, { label: 'B' }],
        },
        inputPolicy: DataValidationInputPolicy.Reject,
      },
    });
    commands.run(SetDataValidationRuleCommand, {
      ...range,
      rule: {
        condition: {
          kind: DataValidationKind.Text,
          textMode: DataValidationTextMode.Length,
          operator: DataValidationOperator.Equal,
          value: '4',
        },
        inputPolicy: DataValidationInputPolicy.Reject,
      },
    });
    expect(plugin.validate(0, 0, 'A, B')).toMatchObject({ valid: true });
    plugin.dispose();

    const evaluators = new DataValidationEvaluatorRegistry();
    evaluators.register(DataValidationKind.Number, (_condition, text) => text === 'A');
    const custom = commandFixture(evaluators);
    custom.commands.run(SetDataValidationRuleCommand, {
      ...range,
      rule: {
        condition: { kind: DataValidationKind.Dropdown, options: [{ label: 'A' }] },
        inputPolicy: DataValidationInputPolicy.Reject,
      },
    });
    custom.commands.run(SetDataValidationRuleCommand, {
      ...range,
      rule: { condition: { kind: DataValidationKind.Number }, inputPolicy: DataValidationInputPolicy.Reject },
    });
    expect(custom.plugin.validate(0, 0, 'A')).toMatchObject({ valid: true });
    custom.plugin.dispose();
  });

  it.each([
    ['missing id', { id: '' }],
    ['fractional end row', { endRow: 0.5 }],
    ['end row outside sheet', { endRow: 2 }],
    ['end column before anchor', { endColumn: -1 }],
    ['unknown kind', { condition: { kind: 'unknown' } }],
    ['unknown input policy', { inputPolicy: 'unknown' }],
    ['non-string warning', { errorMessage: 2 }],
    ['non-string input hint', { inputMessage: 2 }],
    [
      'unknown dropdown mode',
      { condition: { kind: DataValidationKind.Dropdown, options: [{ label: 'A' }], dropdownMode: 'unknown' } },
    ],
    ['empty dropdown label', { condition: { kind: DataValidationKind.Dropdown, options: [{ label: '' }] } }],
    [
      'non-string dropdown color',
      { condition: { kind: DataValidationKind.Dropdown, options: [{ label: 'A', color: 2 }] } },
    ],
    ['unknown comparison', { condition: { kind: DataValidationKind.Number, operator: 'unknown', value: '1' } }],
    [
      'non-numeric comparison',
      {
        condition: {
          kind: DataValidationKind.Number,
          operator: DataValidationOperator.Between,
          value: 'abc',
          secondValue: '10',
        },
      },
    ],
    [
      'non-finite numeric comparison',
      { condition: { kind: DataValidationKind.Number, operator: DataValidationOperator.Equal, value: '1e309' } },
    ],
    [
      'nonexistent comparison date',
      { condition: { kind: DataValidationKind.Date, operator: DataValidationOperator.Equal, value: '2026-02-30' } },
    ],
    [
      'nonexistent upper comparison date',
      {
        condition: {
          kind: DataValidationKind.Date,
          operator: DataValidationOperator.Between,
          value: '2026-02-01',
          secondValue: '2026-02-30',
        },
      },
    ],
    [
      'non-numeric text length',
      {
        condition: {
          kind: DataValidationKind.Text,
          textMode: DataValidationTextMode.Length,
          operator: DataValidationOperator.Equal,
          value: 'abc',
        },
      },
    ],
    [
      'negative text length',
      {
        condition: {
          kind: DataValidationKind.Text,
          textMode: DataValidationTextMode.Length,
          operator: DataValidationOperator.Equal,
          value: '-1',
        },
      },
    ],
    [
      'reversed numeric interval',
      {
        condition: {
          kind: DataValidationKind.Number,
          operator: DataValidationOperator.Between,
          value: '10',
          secondValue: '2',
        },
      },
    ],
    [
      'fractional integer equality',
      {
        condition: {
          kind: DataValidationKind.Number,
          integerOnly: true,
          operator: DataValidationOperator.Equal,
          value: '1.5',
        },
      },
    ],
    [
      'integer interval without a whole number',
      {
        condition: {
          kind: DataValidationKind.Number,
          integerOnly: true,
          operator: DataValidationOperator.Between,
          value: '1.1',
          secondValue: '1.9',
        },
      },
    ],
    ['non-boolean integer option', { condition: { kind: DataValidationKind.Number, integerOnly: 'yes' } }],
    [
      'non-boolean dropdown arrow',
      { condition: { kind: DataValidationKind.Dropdown, options: [{ label: 'A' }], showDropdownArrow: 'yes' } },
    ],
    [
      'fractional source coordinate',
      { condition: { kind: DataValidationKind.Dropdown, sourceRange: { start: [0.5, 0], end: [1, 0] } } },
    ],
    [
      'reversed source range',
      { condition: { kind: DataValidationKind.Dropdown, sourceRange: { start: [1, 0], end: [0, 0] } } },
    ],
    [
      'source range outside sheet',
      { condition: { kind: DataValidationKind.Dropdown, sourceRange: { start: [0, 0], end: [2, 0] } } },
    ],
  ])('rejects a malformed %s rule', (_description, patch) => {
    const matrix = new DataValidationMatrix(void 0, [2, 2]);
    expect(() => matrix.setItem(0, 0, [{ ...rule(0), endColumn: 0, ...patch } as DataValidationRule])).toThrow();
    expect(matrix.getRules()).toEqual([]);
  });

  it('BUG-600 rejects an impossible integer equality through the rule command', () => {
    const { matrix, commands, plugin } = commandFixture();
    const input = {
      anchor: [0, 0] as [number, number],
      focus: [0, 0] as [number, number],
      rule: {
        condition: {
          kind: DataValidationKind.Number,
          integerOnly: true,
          operator: DataValidationOperator.Equal,
          value: '1.5',
        },
        inputPolicy: DataValidationInputPolicy.Reject,
      },
    };
    expect(() => commands.run(SetDataValidationRuleCommand, input)).toThrow(
      'Integer-only comparison has no valid integer.',
    );
    expect(matrix.getRules()).toEqual([]);
    commands.run(SetDataValidationRuleCommand, {
      ...input,
      rule: { ...input.rule, condition: { ...input.rule.condition, value: '2' } },
    });
    expect(matrix.getRules()[0]?.rule.condition.value).toBe('2');
    plugin.dispose();
  });

  it('reads the plugin data field only when the data view provides it', () => {
    const matrix = new DataValidationMatrix(void 0, [2, 2]);
    expect(readSheetDataValidations({} as DataEngine)).toBeNull();
    const readDataViewField = jest.fn().mockReturnValueOnce(matrix).mockReturnValueOnce(undefined);
    const dataEngine = { readDataViewField } as unknown as DataEngine;
    expect(readSheetDataValidations(dataEngine)).toBe(matrix);
    expect(readSheetDataValidations(dataEngine)).toBeNull();
    expect(readDataViewField).toHaveBeenCalledWith(SheetDataFieldNamespace, 'sheet.dataValidation');
  });
});
