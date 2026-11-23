import { CSRMatrix } from '@searsuite/sear-domain-matrix';
import {
  MatrixOT,
  createMoveRowOTOperation,
  createMoveColOTOperation,
  createUpdateCellOTOperation,
  createInsertRowOTOperation,
  createInsertColOTOperation,
  createDeleteRowOTOperation,
  createDeleteColOTOperation,
  type MatrixOTOperation,
} from '../src';

describe('matrix swap convergence', () => {
  const size = 4;
  const initial = () => {
    const matrix = new CSRMatrix<string>(undefined, [size, size]);
    for (let row = 0; row < size; row++) for (let col = 0; col < size; col++) matrix.addItem(row, col, `${row}:${col}`);
    return matrix;
  };
  const converge = (left: MatrixOTOperation<string>[], right: MatrixOTOperation<string>[]) => {
    const [leftPrime, rightPrime] = MatrixOT.transformX(left, right);
    const a = initial();
    const b = initial();
    MatrixOT.apply(a, left);
    MatrixOT.apply(a, rightPrime);
    MatrixOT.apply(b, right);
    MatrixOT.apply(b, leftPrime);
    expect(JSON.stringify({ left, right, leftPrime, rightPrime, shape: a.shape, data: a.toArray() })).toBe(
      JSON.stringify({ left, right, leftPrime, rightPrime, shape: b.shape, data: b.toArray() }),
    );
  };
  it('converges for every row/column swap against edits, insertions, deletions and other swaps', () => {
    for (const make of [createMoveRowOTOperation, createMoveColOTOperation]) {
      for (let from = 0; from < size; from++)
        for (let to = 0; to < size; to++) {
          const left = [make([from], [to]) as MatrixOTOperation<string>];
          for (let index = 0; index < size; index++) {
            const row = Array.from({ length: size }, (_, col) => `${index}:${col}`);
            const col = Array.from({ length: size }, (_, r) => `${r}:${index}`);
            for (const right of [
              createDeleteRowOTOperation([index], row),
              createDeleteColOTOperation([index], col),
              createInsertRowOTOperation([index], row),
              createInsertColOTOperation([index], col),
            ])
              converge(left, [right]);
            for (let other = 0; other < size; other++) {
              converge(left, [createUpdateCellOTOperation([index, other], 'edit', `${index}:${other}`)]);
              converge(left, [createMoveRowOTOperation([index], [other]) as MatrixOTOperation<string>]);
              converge(left, [createMoveColOTOperation([index], [other]) as MatrixOTOperation<string>]);
            }
          }
        }
    }
  });
  it('retains rebased right components and handles component splits across block permutations', () => {
    const left = [
      createMoveRowOTOperation([0], [3]),
      createMoveRowOTOperation([1], [2]),
    ] as MatrixOTOperation<string>[];
    for (let index = 0; index < size; index++) {
      converge(left, [
        createDeleteRowOTOperation(
          [index],
          Array.from({ length: size }, (_, col) => `${index}:${col}`),
        ),
      ]);
      converge(left, [
        createMoveRowOTOperation([index], [(index + 1) % size]) as MatrixOTOperation<string>,
        createMoveRowOTOperation([(index + 1) % size], [(index + 2) % size]) as MatrixOTOperation<string>,
      ]);
    }
  });
});
