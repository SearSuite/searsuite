import {
  MatrixOT,
  MatrixCellUpdateIntent,
  createUpdateCellOTOperation,
  createInsertRowOTOperation,
  OTTransformPriority,
} from '../src';

describe('matrix relocation intent', () => {
  it('preserves relocation intent when rebased against concurrent row insertion', () => {
    const operation = createUpdateCellOTOperation([1, 1], 'new', null, MatrixCellUpdateIntent.Relocation);
    expect(
      MatrixOT.transform([operation], [createInsertRowOTOperation([0], [null, null])], OTTransformPriority.LEFT),
    ).toEqual([createUpdateCellOTOperation([2, 1], 'new', null, MatrixCellUpdateIntent.Relocation)]);
  });
  it('survives inversion and does not collapse independent or replacement updates', () => {
    const operation = createUpdateCellOTOperation([1, 1], 'new', 'old', MatrixCellUpdateIntent.Relocation);
    expect(MatrixOT.invert([operation])).toEqual([
      createUpdateCellOTOperation([1, 1], 'old', 'new', MatrixCellUpdateIntent.Relocation),
    ]);
    const second = createUpdateCellOTOperation([2, 2], 'other', null, MatrixCellUpdateIntent.Relocation);
    expect(MatrixOT.compose([operation], [second])).toEqual([operation, second]);
    expect(MatrixOT.compose([operation], [createUpdateCellOTOperation([1, 1], 'edit', 'new')])).toHaveLength(2);
  });
});
