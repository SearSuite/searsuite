import type { PositionRectProps } from '@searsuite/sear-foundation-rect';
import type { Node } from '@searsuite/sear-render-node';
import { Cell, type CellContext, type CellProperties, SheetNodeFactory } from '../src';

class TestCell extends Cell<CellProperties<unknown>> {
  render(): Node<CellProperties<unknown>> {
    throw new Error('not used by factory test');
  }

  getDisplayText(): string {
    return String(this.data.value ?? '');
  }
}

class ReplacementCell extends TestCell {}

describe('SheetNodeFactory', () => {
  it('normalizes string keys, passes construction arguments, restores previous types, and rejects missing cells', () => {
    const factory = new SheetNodeFactory();
    const rect: PositionRectProps = { x: 1, y: 2, width: 3, height: 4 };
    const data = { type: 'custom', value: 'value' };
    const properties = { marker: true };
    const context: CellContext = { row: 2, col: 3 };
    const disposeFirst = factory.register('custom', TestCell);
    const first = factory.create(data, rect, properties, context);
    const disposeSecond = factory.register(Symbol.for('custom'), ReplacementCell);

    expect(first).toBeInstanceOf(TestCell);
    expect(first.positionRect).toMatchObject(rect);
    expect(first.context).toEqual(context);
    disposeFirst();
    expect(factory.create(data, rect, properties)).toBeInstanceOf(ReplacementCell);
    disposeSecond();
    expect(factory.create(data, rect, properties)).toBeInstanceOf(TestCell);
    disposeFirst();
    expect(() => factory.create(data, rect, properties)).toThrow('Cell type not registered');
  });

  it('accepts caller-provided symbols without converting them', () => {
    const factory = new SheetNodeFactory();
    const type = Symbol('cell');
    factory.register(type, TestCell);

    expect(factory.create({ type }, { x: 0, y: 0, width: 1, height: 1 }, {})).toBeInstanceOf(TestCell);
  });
});
