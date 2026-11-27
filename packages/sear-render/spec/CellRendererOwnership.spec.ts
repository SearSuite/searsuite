import { CellTypeCatalog, CellTypeDefinition, CellDisplayTextRegistry } from '@searsuite/sear-domain-cell';
import { CellClipboardCodecRegistry, CellCommitStrategyRegistry } from '@searsuite/sear-domain-cell-types';
import {
  Cell,
  SheetNodeFactory,
  SheetRendererRegistry,
  SheetRenderCoordinatorManager,
  defineCellRenderer,
  type CellProperties,
} from '@searsuite/sear-render-registry';
import { emptyPositionRect } from '@searsuite/sear-foundation-rect';
import { NodePlatform } from '@searsuite/sear-node-adapters';

class ValueDefinition extends CellTypeDefinition {
  public readonly type = 'independent-cell';
  public override createDisplayTextProvider() {
    return { cellType: this.type, getDisplayText: () => 'semantic value' };
  }
}
class FirstRenderer extends Cell<CellProperties> {
  public getDisplayText() {
    return 'view label';
  }
  public render() {
    return [];
  }
}
class SecondRenderer extends Cell<CellProperties> {
  public getDisplayText() {
    return 'view label';
  }
  public render() {
    return [];
  }
}

describe('independent cell renderer ownership', () => {
  it('replaces and disposes a renderer without changing the cell definition', () => {
    const catalog = new CellTypeCatalog(
      new CellCommitStrategyRegistry(),
      new CellDisplayTextRegistry(new NodePlatform()),
      new CellClipboardCodecRegistry(),
    );
    const definition = new ValueDefinition();
    const disposeDefinition = catalog.register(definition);
    const factory = new SheetNodeFactory();
    const renderers = new SheetRendererRegistry<CellProperties>();
    const coordinator = new SheetRenderCoordinatorManager(factory, renderers, { getFormulaResult: () => undefined });
    const first = defineCellRenderer(definition.type, FirstRenderer).register(coordinator);
    const create = () => factory.create({ type: definition.type }, emptyPositionRect, { type: definition.type });
    expect(create()).toBeInstanceOf(FirstRenderer);
    const second = defineCellRenderer(definition.type, SecondRenderer).register(coordinator);
    expect(create()).toBeInstanceOf(SecondRenderer);
    expect(catalog.get(definition.type)).toBe(definition);
    expect(catalog.getDisplayText({ type: definition.type }, {})).toBe('semantic value');
    second();
    expect(create()).toBeInstanceOf(FirstRenderer);
    disposeDefinition();
    expect(create()).toBeInstanceOf(FirstRenderer);
    first();
    expect(() => create()).toThrow('Cell type not registered');
  });
});
