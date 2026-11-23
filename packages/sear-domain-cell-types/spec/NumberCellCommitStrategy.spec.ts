import { NumberCellCommitStrategy } from '../src/number/NumberCellCommitStrategy';
import { SearError } from '@searsuite/sear-foundation-error';

describe('NumberCellCommitStrategy', () => {
  it('throws SearError when committing a non-numeric value', () => {
    const strategy = new NumberCellCommitStrategy();
    expect(() =>
      strategy.commit({
        row: 0,
        col: 0,
        plainText: 'not-a-number',
        richText: [],
        previous: null,
      }),
    ).toThrow(new SearError('NumberCellCommitStrategy committed a non-numeric value.'));
  });

  it('returns true for numeric matches', () => {
    const strategy = new NumberCellCommitStrategy();
    expect(
      strategy.matches({
        row: 0,
        col: 0,
        plainText: '123',
        richText: [],
        previous: null,
      }),
    ).toBe(true);

    expect(
      strategy.matches({
        row: 0,
        col: 0,
        plainText: 'abc',
        richText: [],
        previous: null,
      }),
    ).toBe(false);
  });

  it('commits a numeric value while format remains separately owned', () => {
    const strategy = new NumberCellCommitStrategy();
    const result = strategy.commit({
      row: 0,
      col: 0,
      plainText: '123',
      richText: [],
      previous: { type: 'number', value: 1 },
      format: { kind: 'number' },
    });
    expect(result).toEqual({ type: 'number', value: 123 });
  });

  it('stores only the first 15 significant digits of a direct numeric entry', () => {
    const result = new NumberCellCommitStrategy().commit({
      row: 0,
      col: 0,
      plainText: '1234567890123456',
      richText: [],
      previous: null,
    });
    expect(result).toEqual({ type: 'number', value: 1234567890123450 });
  });

  it('matches a numeric value with previous but no format', () => {
    const strategy = new NumberCellCommitStrategy();
    expect(
      strategy.matches({
        row: 0,
        col: 0,
        plainText: '123',
        richText: [],
        previous: { type: 'number', value: 1 },
      }),
    ).toBe(true);
  });
});
