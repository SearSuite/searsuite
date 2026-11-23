import { MatrixOT } from '@searsuite/sear-domain-ot';
import { DataValidationMatrix } from '../src/DataValidationMatrix';
import { DataValidationInputPolicy, type DataValidationRule } from '../src/DataValidationRule';
import {
  captureDataValidationRules, createDataValidationClipboardOperations,
} from '../src/createDataValidationClipboardOperations';

describe('data validation clipboard operations', () => {
  it('clips copied rules and preserves destination rule fragments outside the paste', () => {
    const matrix = new DataValidationMatrix(void 0, [30, 30]);
    const identity: DataValidationRule = {
      id: 'source', endRow: 3, endColumn: 3,
      condition: { kind: 'identityCard' }, inputPolicy: DataValidationInputPolicy.Reject,
    };
    const oldTarget: DataValidationRule = {
      id: 'target', endRow: 7, endColumn: 7,
      condition: { kind: 'phone' }, inputPolicy: DataValidationInputPolicy.Reject,
    };
    matrix.setItem(1, 1, [identity]);
    matrix.setItem(5, 5, [oldTarget]);
    const captured = captureDataValidationRules(matrix, { start: [2, 2], end: [3, 3] });
    let nextId = 0;
    const operations = createDataValidationClipboardOperations(
      matrix, [{ destination: { start: [6, 6], end: [7, 7] }, portable: captured }], () => `copied-${++nextId}`,
    );
    MatrixOT.apply(matrix, [...operations]);

    expect(matrix.findRules(2, 2).map(({ rule }) => rule.id)).toEqual(['source']);
    expect(matrix.findRules(6, 6).map(({ rule }) => rule.condition.kind)).toEqual(['identityCard']);
    expect(matrix.findRules(7, 7).map(({ rule }) => rule.condition.kind)).toEqual(['identityCard']);
    expect(matrix.findRules(5, 5).map(({ rule }) => rule.condition.kind)).toEqual(['phone']);
    expect(matrix.findRules(5, 6).map(({ rule }) => rule.condition.kind)).toEqual(['phone']);
    expect(matrix.findRules(6, 5).map(({ rule }) => rule.condition.kind)).toEqual(['phone']);
  });

  it('clears destination rules when the copied cell has no validation', () => {
    const matrix = new DataValidationMatrix(void 0, [10, 10]);
    matrix.setItem(2, 2, [{
      id: 'old', endRow: 2, endColumn: 2,
      condition: { kind: 'identityCard' }, inputPolicy: DataValidationInputPolicy.Reject,
    }]);
    const operations = createDataValidationClipboardOperations(
      matrix, [{ destination: { start: [2, 2], end: [2, 2] }, portable: [] }], () => 'unused',
    );
    MatrixOT.apply(matrix, [...operations]);
    expect(matrix.findRules(2, 2)).toEqual([]);
  });

  it('plans repeated paste tiles together when an old rule spans both targets', () => {
    const matrix = new DataValidationMatrix(void 0, [10, 10]);
    matrix.setItem(1, 1, [{
      id: 'source', endRow: 1, endColumn: 1,
      condition: { kind: 'identityCard' }, inputPolicy: DataValidationInputPolicy.Reject,
    }]);
    matrix.setItem(5, 5, [{
      id: 'old', endRow: 5, endColumn: 6,
      condition: { kind: 'phone' }, inputPolicy: DataValidationInputPolicy.Reject,
    }]);
    const captured = captureDataValidationRules(matrix, { start: [1, 1], end: [1, 1] });
    let nextId = 0;
    const operations = createDataValidationClipboardOperations(matrix, [
      { destination: { start: [5, 5], end: [5, 5] }, portable: captured },
      { destination: { start: [5, 6], end: [5, 6] }, portable: captured },
    ], () => `copy-${++nextId}`);
    MatrixOT.apply(matrix, [...operations]);
    expect(matrix.findRules(5, 5).map(({ rule }) => rule.condition.kind)).toEqual(['identityCard']);
    expect(matrix.findRules(5, 6).map(({ rule }) => rule.condition.kind)).toEqual(['identityCard']);
    expect(matrix.findRules(1, 1).map(({ rule }) => rule.id)).toEqual(['source']);
  });
});
