import type { Cell, CellProperties } from '../src';
import { SheetRendererRegistry } from '../src';
import type { Node, NodeProperties } from '@searsuite/sear-render-node';

describe('SheetRendererRegistry', () => {
  it('renders registered cell types and restores previous renderers only from the active disposer', () => {
    const registry = new SheetRendererRegistry<NodeProperties>();
    const cell = { data: { type: 'text' } } as Cell<CellProperties>;
    const firstNode = { name: 'first' } as Node<NodeProperties>;
    const secondNode = { name: 'second' } as Node<NodeProperties>;
    const first = jest.fn(() => firstNode);
    const second = jest.fn(() => secondNode);
    const disposeFirst = registry.registerRenderer('text', first);
    const disposeSecond = registry.registerRenderer('text', second);

    disposeFirst();
    expect(registry.render(cell)).toBe(secondNode);
    expect(second).toHaveBeenCalledWith(cell);
    disposeSecond();
    expect(registry.render(cell)).toBe(firstNode);
    disposeFirst();
    expect(() => registry.render(cell)).toThrow('No renderer registered');
  });
});
