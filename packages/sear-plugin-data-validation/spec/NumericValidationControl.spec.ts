import { CellVisualIconShape } from '@searsuite/sear-render-node';
import { DataValidationKind, DataValidationInputPolicy } from '../src/DataValidationRule';
import { DataValidationMatrix } from '../src/DataValidationMatrix';
import {
  numericValidationControlLayers, numericValidationControlValueAt, readNumericValidationControl,
} from '../src/NumericValidationControl';

const matrix = new DataValidationMatrix(void 0, [1, 2]);
matrix.setItem(0, 0, [{ id: 'progress', endRow: 0, endColumn: 0,
  condition: { kind: DataValidationKind.Progress }, inputPolicy: DataValidationInputPolicy.Reject }]);
matrix.setItem(0, 1, [{ id: 'rating', endRow: 0, endColumn: 1,
  condition: { kind: DataValidationKind.Rating }, inputPolicy: DataValidationInputPolicy.Reject }]);

describe('numeric validation controls', () => {
  it('BUG-458 draws half progress and maps a click to a numeric percentage', () => {
    const control = readNumericValidationControl(matrix, 0, 0, 50);
    expect(control).toEqual({ kind: DataValidationKind.Progress, value: 50 });
    expect(numericValidationControlLayers(control!)[1]).toMatchObject({ width: 0.42, fill: '#168a78' });
    expect(numericValidationControlValueAt(control!, { x: 100, y: 200, width: 100, height: 24 }, 171, 212)).toBe(75);
    expect(numericValidationControlValueAt(control!, { x: 100, y: 200, width: 100, height: 24 }, 190, 201)).toBeNull();
    expect(readNumericValidationControl(matrix, 0, 0, 'invalid')).toBeNull();
    expect(readNumericValidationControl(matrix, 0, 0, '0x64')).toBeNull();
  });

  it('BUG-459 draws four active stars and allows a selected star to clear the rating', () => {
    const control = readNumericValidationControl(matrix, 0, 1, 4);
    expect(control).toEqual({ kind: DataValidationKind.Rating, value: 4 });
    const layers = numericValidationControlLayers(control!);
    expect(layers).toHaveLength(5);
    expect(layers[3]?.icon).toMatchObject({ shape: CellVisualIconShape.Star, color: '#d58a16' });
    expect(layers[4]?.icon).toMatchObject({ shape: CellVisualIconShape.Star, color: '#b8c1c7' });
    const bounds = { x: 100, y: 200, width: 100, height: 24 };
    expect(numericValidationControlValueAt(control!, bounds, 187, 212)).toBe(5);
    expect(numericValidationControlValueAt({ ...control!, value: 5 }, bounds, 187, 212)).toBe(0);
    expect(readNumericValidationControl(matrix, 0, 1, 4.5)).toBeNull();
  });
});
