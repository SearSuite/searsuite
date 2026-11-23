import { isFormulaError, isFormulaText, isNumber, toNumberOrZero, toNumberOrError } from '../src/FormulaValueUtils';

describe('FormulaValueUtils', () => {
  describe('isNumber', () => {
    it('recognizes numbers without coercing other values', () => {
      expect(isNumber(0)).toBe(true);
      expect(isNumber(Number.NaN)).toBe(true);
      expect(isNumber('1')).toBe(false);
      expect(isNumber(true)).toBe(false);
    });
  });

  describe('isFormulaError', () => {
    it('returns true for valid error objects', () => {
      expect(isFormulaError({ kind: 'error', code: '#DIV/0!' })).toBe(true);
    });
    it('returns false for invalid objects', () => {
      expect(isFormulaError(null)).toBe(false);
      expect(isFormulaError('error')).toBe(false);
      expect(isFormulaError({ kind: 'text', code: '#DIV/0!' })).toBe(false);
      expect(isFormulaError({ kind: 'error' })).toBe(false);
    });
  });

  describe('isFormulaText', () => {
    it('returns true for text objects', () => {
      expect(isFormulaText({ kind: 'text', value: 'hello', numericCoercion: 'allow' })).toBe(true);
    });
    it('returns false for non-text objects', () => {
      expect(isFormulaText(null)).toBe(false);
      expect(isFormulaText({ kind: 'error', value: 'hello' })).toBe(false);
      expect(isFormulaText({ kind: 'text' })).toBe(false);
    });
  });

  describe('toNumberOrZero', () => {
    it('returns number for numeric strings', () => {
      expect(toNumberOrZero('123')).toBe(123);
      expect(toNumberOrZero(123)).toBe(123);
      expect(toNumberOrZero(true)).toBe(1);
      expect(toNumberOrZero(false)).toBe(0);
    });
    it('returns 0 for non-numeric strings', () => {
      expect(toNumberOrZero('hello')).toBe(0);
      expect(toNumberOrZero(null)).toBe(0);
    });
    it('handles formula text', () => {
      expect(toNumberOrZero({ kind: 'text', value: '123', numericCoercion: 'allow' })).toBe(123);
      expect(toNumberOrZero({ kind: 'text', value: '123', numericCoercion: 'deny' })).toBe(0);
    });
  });

  describe('toNumberOrError', () => {
    it('handles numbers and booleans', () => {
      expect(toNumberOrError(123)).toBe(123);
      expect(toNumberOrError(true)).toBe(1);
      expect(toNumberOrError(false)).toBe(0);
    });
    it('handles strings', () => {
      expect(toNumberOrError('123')).toBe(123);
      expect(toNumberOrError('')).toBe(0);
      expect(toNumberOrError('hello')).toEqual({ kind: 'error', code: '#VALUE!' });
    });
    it('handles other types', () => {
      expect(toNumberOrError(null)).toEqual({ kind: 'error', code: '#VALUE!' });
      expect(toNumberOrError(undefined)).toEqual({ kind: 'error', code: '#VALUE!' });
    });
    it('handles formula text', () => {
      expect(toNumberOrError({ kind: 'text', value: '123', numericCoercion: 'allow' })).toBe(123);
      expect(toNumberOrError({ kind: 'text', value: '123', numericCoercion: 'deny' })).toEqual({
        kind: 'error',
        code: '#VALUE!',
      });
    });
  });
});
