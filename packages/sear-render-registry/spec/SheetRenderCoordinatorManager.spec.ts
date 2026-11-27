import { Container, Injectable } from '@searsuite/sear-foundation-di';
import { SheetRenderCoordinatorManager } from '../src/SheetRenderCoordinatorManager';
import { SheetNodeFactory } from '../src/SheetNodeFactory';
import { SheetRendererRegistry } from '../src/SheetRendererRegistry';
import { IFormulaResultProvider, CellProperties, Cell } from '../src/Cell';
import { PositionRectProps } from '@searsuite/sear-foundation-rect';

import { Node, FixBoxNode } from '@searsuite/sear-render-node';
import { Platform } from '@searsuite/sear-foundation-platform';
import { SearError } from '@searsuite/sear-foundation-error';
import { DefaultCellFormatLocale } from '@searsuite/sear-domain-cell-types';

let container: Container;
class MockCell extends Cell<any> {
  render() {
    return new MockNode();
  }
  getDisplayText() {
    return 'mock';
  }
}
class MockNode extends Node<any> {
  constructor() {
    super({} as any, {} as any);
  }
  protected doRender() {}
  protected doHitTest() {
    return null;
  }
  protected calculateAABB() {
    return {} as any;
  }
  clear() {}
  drawScene() {}
  drawHit() {}
}

@Injectable()
class FakeTree {
  public add() {}
  public remove() {}
  public clear() {}
  public update() {}
  public search() {
    return [];
  }
  public getBoundary() {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  public updateBoundary() {}
}

@Injectable()
class FakeConfig {
  public get() {
    return {};
  }
  public observe() {
    return { dispose: () => {} };
  }
}

describe('SheetRenderCoordinatorManager', () => {
  let manager: SheetRenderCoordinatorManager;
  let nodeFactory: SheetNodeFactory;
  let rendererRegistry: SheetRendererRegistry<CellProperties>;
  let formulaResultProvider: IFormulaResultProvider;
  let platform: Platform;

  beforeEach(() => {
    container = new Container();
    container.register(Symbol.for('Tree'), FakeTree);
    container.register(Symbol.for('ConfigEngine'), FakeConfig);

    nodeFactory = new SheetNodeFactory();
    rendererRegistry = new SheetRendererRegistry();
    formulaResultProvider = { getFormulaResult: jest.fn() };
    platform = { warn: jest.fn() } as unknown as Platform;

    manager = new SheetRenderCoordinatorManager(nodeFactory, rendererRegistry, formulaResultProvider, platform);
  });

  it('registers and unregisters a stored value validator', () => {
    const validator1 = () => true;
    const validator2 = () => false;

    // Test the branch where there is no previous validator (line 37)
    const unregisterOnly = manager.registerStoredValueValidator('only', validator1);
    unregisterOnly(); // This should hit `else this.storedValueValidators.delete(type);`

    const unregister1 = manager.registerStoredValueValidator('mock', validator1);

    // Replace with second
    const unregister2 = manager.registerStoredValueValidator('mock', validator2);

    // Unregister first - should not affect the current one
    unregister1();

    // We can't directly check the private map easily, but we can verify behavior
    // To do this, let's render a cell
    const properties: CellProperties = { type: 'mock', value: 'hello' };
    const positionRect: PositionRectProps = { x: 0, y: 0, width: 100, height: 20 };

    // Register type and renderer to avoid errors
    manager.registerCell('mock', MockCell as any);

    const node = manager.renderCell(properties, positionRect, properties);
    // Since validator2 returns false, it should fallback to FixBoxNode
    expect(node).toBeInstanceOf(FixBoxNode);
    expect(platform.warn).toHaveBeenCalled();

    // Now unregister2, it should restore the previous one (validator1)
    unregister2();
    const node2 = manager.renderCell(properties, positionRect, properties);
    // Now it uses validator1 which returns true, so it actually creates MockCell and renders
    expect(node2).toBeInstanceOf(MockNode);

    // Unregister1 again, this time it should delete because it matches
    const unregister1Again = manager.registerStoredValueValidator('mock', validator1);
    unregister1Again();

    // After deletion, rendering should just work
    const node3 = manager.renderCell(properties, positionRect, properties);
    expect(node3).toBeInstanceOf(MockNode);
  });

  it('createCellContext handles missing row and col', () => {
    expect(manager.createCellContext()).toEqual({ formulaResultProvider, cellFormatLocale: DefaultCellFormatLocale });
    expect(manager.createCellContext(1, 2)).toEqual({
      formulaResultProvider,
      cellFormatLocale: DefaultCellFormatLocale,
      row: 1,
      col: 2,
    });
  });

  it('renderCell throws error if cell not registered', () => {
    const properties: CellProperties = { type: 'unknown-type' as any };
    const positionRect: PositionRectProps = { x: 0, y: 0, width: 100, height: 20 };

    expect(() => {
      manager.renderCell(properties, positionRect, properties);
    }).toThrow(SearError);
  });

  it('renderCell throws error if create returns undefined', () => {
    const properties: CellProperties = { type: 'mock' };
    const positionRect: PositionRectProps = { x: 0, y: 0, width: 100, height: 20 };

    jest.spyOn(manager, 'create').mockReturnValue(undefined);

    expect(() => {
      manager.renderCell(properties, positionRect, properties);
    }).toThrow(/Cell type not registered/);
  });

  it('create registers and returns proper cell instance', () => {
    manager.registerType('mock', MockCell as any);
    const properties: CellProperties = { type: 'mock', value: 'hello' };
    const positionRect: PositionRectProps = { x: 0, y: 0, width: 100, height: 20 };

    const cell = manager.create(properties, positionRect, properties);
    expect(cell).toBeInstanceOf(MockCell);
  });

  it('registerCell registers both type and renderer, and unregisters properly', () => {
    const unregister = manager.registerCell('mock', MockCell as any);

    const properties: CellProperties = { type: 'mock', value: 'hello' };
    const positionRect: PositionRectProps = { x: 0, y: 0, width: 100, height: 20 };

    const node = manager.renderCell(properties, positionRect, properties);
    expect(node).toBeInstanceOf(MockNode);

    unregister();

    expect(() => {
      manager.renderCell(properties, positionRect, properties);
    }).toThrow(SearError);
  });

  it('handles fallback without platform', () => {
    // Create manager without platform
    const noPlatformManager = new SheetRenderCoordinatorManager(nodeFactory, rendererRegistry, formulaResultProvider);
    noPlatformManager.registerStoredValueValidator('mock', () => false);

    const properties: CellProperties = { type: 'mock', value: 'hello' };
    const positionRect: PositionRectProps = { x: 0, y: 0, width: 100, height: 20 };

    // Should fallback without throwing error from undefined platform
    const node = noPlatformManager.renderCell(properties, positionRect, properties);
    expect(node).toBeInstanceOf(FixBoxNode);
  });
});
