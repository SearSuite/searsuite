import { MatrixOTActionName } from '@searsuite/sear-domain-ot';
import { createDataValidationReorderOperations } from '../src/createDataValidationReorderOperations';
import { DataValidationMatrix } from '../src/DataValidationMatrix';
import { DataValidationInputPolicy, DataValidationKind } from '../src/DataValidationRule';

describe('data validation row reordering', () => {
  it('splits a partly intersecting rule across nonconsecutive destination rows', () => {
    const matrix = new DataValidationMatrix(void 0, [5, 4]);
    matrix.setItem(0, 1, [{
      id: 'original', endRow: 2, endColumn: 2,
      condition: { kind: DataValidationKind.Number }, inputPolicy: DataValidationInputPolicy.Reject,
    }]);
    let id = 0;
    const operations = createDataValidationReorderOperations(matrix, {
      range: { start: [1, 1], end: [4, 2] },
      destinationOf: (row) => [0, 3, 1, 4, 2][row]!,
    }, () => `split-${++id}`);
    for (const operation of operations) {
      matrix.setItem(operation.p[0]!, operation.p[1]!, operation[MatrixOTActionName.UpdateCell].value);
    }
    expect([0, 1, 2, 3, 4].map((row) => matrix.findRules(row, 1).length))
      .toEqual([1, 1, 0, 1, 0]);
    expect([0, 1, 2, 3, 4].map((row) => matrix.findRules(row, 2).length))
      .toEqual([1, 1, 0, 1, 0]);
    expect(new Set(matrix.getRules().map(({ rule }) => rule.id)).size).toBe(3);
  });
});
