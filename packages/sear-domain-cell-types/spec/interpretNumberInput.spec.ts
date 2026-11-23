import { interpretNumberInput } from '../src/number/interpretNumberInput';
import { CellType } from '../src/CellType';

describe('interpretNumberInput year-first dates', () => {
  it('commits common local dates as numeric date serials', () => {
    for (const [source, pattern] of [
      ['2026/10/21', 'yyyy/m/d'],
      ['2026.10.21', 'yyyy.m.d'],
      ['2026\u5e7410\u670821\u65e5', 'yyyy-m-d'],
    ]) {
      expect(interpretNumberInput(source, null)).toEqual({ value: 46316, format: { kind: 'date', pattern } });
    }
  });

  it('rejects rollover dates and preserves month-first input', () => {
    expect(interpretNumberInput('2026/02/30', null)).toBeNull();
    expect(interpretNumberInput('10/21/2026', null)).toEqual({
      value: 46316, format: { kind: 'date', pattern: 'm/d/yyyy' },
    });
  });

  it('keeps edited date-formatted cells numeric across accepted date spellings', () => {
    const format = { kind: 'date' as const, pattern: 'yyyy/m/d' };
    expect(interpretNumberInput('2026-10-22', format)).toEqual({ value: 46317 });
    expect(interpretNumberInput('2026/10/22', format)).toEqual({ value: 46317 });
    expect(interpretNumberInput('2026/02/30', format)).toBeNull();
  });
});

describe('interpretNumberInput existing percentages', () => {
  const previous = { type: CellType.Number, value: 0.25 };

  it('treats a replacement without a percent sign as a General number', () => {
    expect(interpretNumberInput('0.5', { kind: 'percent' }, undefined, previous)).toEqual({
      value: 0.5,
      format: { kind: 'general' },
    });
  });

  it('retains percentage meaning for an explicit percent sign', () => {
    expect(interpretNumberInput('50%', { kind: 'percent' }, undefined, previous)).toEqual({ value: 0.5 });
  });
});
