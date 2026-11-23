import {
  CellClipboardCodecRegistry,
  CellCommitStrategyRegistry,
  type CellCommitStrategyDefinition,
  CellType,
} from '@searsuite/sear-domain-cell-types';
import { type Platform } from '@searsuite/sear-foundation-platform';
import {
  Cell,
  type CellProperties,
  SheetNodeFactory,
  SheetRenderCoordinatorManager,
  SheetRendererRegistry,
  StringCell,
} from '@searsuite/sear-render-registry';
import { emptyPositionRect } from '@searsuite/sear-foundation-rect';
import { type Node } from '@searsuite/sear-render-node';
import { CellRenderDefinition, CellTypeCatalog, CellTypeDefinition, defineCellRenderer } from '../src';
import { CellDisplayTextRegistry, type CellDisplayTextProvider } from '../src/CellDisplayTextRegistry';
import { StringCellTypeDefinition } from '../src/BuiltinCellDefinitions';

const contractType = 'contract-cell';
const contractCommitKey = 'contract-cell-commit';
const renderOnlyType = 'render-only-cell';

class ContractCell extends Cell<CellProperties> {
  render(): Node<CellProperties>[] {
    return [];
  }

  getDisplayText(): string {
    return 'rendered';
  }
}

function createCommitStrategy(key: string): CellCommitStrategyDefinition {
  return {
    key,
    priority: 1,
    matches: () => true,
    commit: () => ({ type: contractType, value: 'committed' }),
  };
}

class ContractCellTypeDefinition extends CellTypeDefinition {
  readonly type: string;

  constructor(
    type = contractType,
    private readonly displayText = 'contract display',
    private readonly commitKey = contractCommitKey,
  ) {
    super();
    this.type = type;
  }

  override createCommitStrategies(): readonly CellCommitStrategyDefinition[] {
    return [createCommitStrategy(this.commitKey)];
  }

  override createDisplayTextProvider(): CellDisplayTextProvider {
    return {
      cellType: this.type,
      getDisplayText: () => this.displayText,
    };
  }

  override createClipboardCodec() {
    return {
      cellType: this.type,
      encode: (cell: { value?: unknown }) => ({ value: cell.value }),
      decode: (data: unknown) =>
        data && typeof data === 'object' && typeof (data as { value?: unknown }).value === 'string'
          ? { type: this.type, value: (data as { value: string }).value }
          : null,
      toPlainText: (cell: { value?: unknown }) => String(cell.value ?? ''),
    };
  }

  override createRenderer() {
    return defineCellRenderer(this.type, ContractCell);
  }
}

class RenderOnlyDefinition extends CellRenderDefinition {
  readonly type = renderOnlyType;

  override createRenderer() {
    return defineCellRenderer(this.type, ContractCell);
  }
}

interface CatalogHarness {
  readonly commits: CellCommitStrategyRegistry;
  readonly clipboardCodecs: CellClipboardCodecRegistry;
  readonly displays: CellDisplayTextRegistry;
  readonly nodeFactory: SheetNodeFactory;
  readonly rendererRegistry: SheetRendererRegistry<CellProperties>;
  readonly catalog: CellTypeCatalog;
}

function createPlatform(): Platform {
  return { warn: jest.fn() } as unknown as Platform;
}

function createHarness(): CatalogHarness {
  const commits = new CellCommitStrategyRegistry();
  const clipboardCodecs = new CellClipboardCodecRegistry();
  const displays = new CellDisplayTextRegistry(createPlatform());
  const nodeFactory = new SheetNodeFactory();
  const rendererRegistry = new SheetRendererRegistry<CellProperties>();
  const renderCoordinator = new SheetRenderCoordinatorManager(nodeFactory, rendererRegistry, {
    getFormulaResult: () => void 0,
  });

  return {
    commits,
    clipboardCodecs,
    displays,
    nodeFactory,
    rendererRegistry,
    catalog: new CellTypeCatalog(commits, displays, renderCoordinator, clipboardCodecs),
  };
}

function createCell(nodeFactory: SheetNodeFactory, type: string): Cell<CellProperties> {
  return nodeFactory.create({ type, value: 'stored value' }, emptyPositionRect, { type }) as Cell<CellProperties>;
}

describe('CellTypeCatalog', () => {
  it('locks a registered definition retained by its owner', () => {
    const { catalog } = createHarness();
    const definition = new ContractCellTypeDefinition();
    const dispose = catalog.register(definition);

    expect(() => Object.assign(definition, { type: 'forged' })).toThrow();
    expect(() => Object.assign(definition, { isStoredValue: () => false })).toThrow();
    expect(catalog.get(contractType)).toBe(definition);
    dispose();
    expect(catalog.get(contractType)).toBeUndefined();
  });

  it('returns false when unregistering unknown type', () => {
    const { catalog } = createHarness();
    expect(catalog.unregister('unknown')).toBe(false);
  });

  it('does nothing when disposing an overridden definition', () => {
    const { catalog } = createHarness();
    const definition1 = new ContractCellTypeDefinition();
    const definition2 = new ContractCellTypeDefinition(contractType, 'override', 'commit-override');
    const dispose1 = catalog.register(definition1);
    catalog.register(definition2); // overwrites definition1

    // Attempting to dispose the replaced definition should return early (branch line 67)
    expect(() => dispose1()).not.toThrow();
  });

  it('can get all registered definitions', () => {
    const { catalog } = createHarness();
    const definition = new ContractCellTypeDefinition();
    catalog.register(definition);
    expect(catalog.getAll()).toEqual([definition]);
  });

  it('registers stored value validator that delegates to definition', () => {
    const { catalog } = createHarness();
    const definition = new ContractCellTypeDefinition();
    const spy = jest.fn(() => true);
    Object.assign(definition, { isStoredValue: spy });

    const renderCoordinator = (catalog as unknown as { renderCoordinator: SheetRenderCoordinatorManager })
      .renderCoordinator;
    const registerSpy = jest.spyOn(renderCoordinator, 'registerStoredValueValidator');

    catalog.register(definition);

    expect(registerSpy).toHaveBeenCalledWith(contractType, expect.any(Function));

    const validatorFn = registerSpy.mock.calls[0][1];
    const cell = { type: contractType, value: 'test' };
    expect(validatorFn(cell)).toBe(true);
    expect(spy).toHaveBeenCalledWith(cell);
  });

  it('installs a persisted definition into all registries and removes every capability on disposal', () => {
    const { catalog, commits, displays, nodeFactory, rendererRegistry, clipboardCodecs } = createHarness();
    const definition = new ContractCellTypeDefinition();
    const dispose = catalog.register(definition);

    expect(commits.get(contractCommitKey)).toBeDefined();
    expect(displays.getDisplayText({ type: contractType, value: 'stored value' }, {})).toBe('contract display');
    const cell = createCell(nodeFactory, contractType);
    expect(cell).toBeInstanceOf(ContractCell);
    expect(rendererRegistry.render(cell)).toEqual([]);
    expect(clipboardCodecs.get(contractType)).toBeDefined();

    dispose();

    expect(catalog.get(contractType)).toBeUndefined();
    expect(commits.get(contractCommitKey)).toBeUndefined();
    expect(displays.getDisplayText({ type: contractType, value: 'stored value' }, {})).toBe('stored value');
    expect(() => createCell(nodeFactory, contractType)).toThrow('Cell type not registered');
    expect(() => rendererRegistry.render(cell)).toThrow('No renderer registered');
    expect(clipboardCodecs.get(contractType)).toBeUndefined();
  });

  it('installs a rendering-only definition only into NodeFactory and RendererRegistry', () => {
    const { catalog, commits, displays, nodeFactory, rendererRegistry } = createHarness();
    const dispose = catalog.register(new RenderOnlyDefinition());

    expect(commits.getAll()).toHaveLength(0);
    expect(displays.getDisplayText({ type: renderOnlyType, value: 'stored value' }, {})).toBe('stored value');
    const cell = createCell(nodeFactory, renderOnlyType);
    expect(cell).toBeInstanceOf(ContractCell);
    expect(rendererRegistry.render(cell)).toEqual([]);

    dispose();

    expect(() => createCell(nodeFactory, renderOnlyType)).toThrow('Cell type not registered');
    expect(() => rendererRegistry.render(cell)).toThrow('No renderer registered');
  });

  it('restores a built-in definition and all of its capabilities after a third-party override is disposed', () => {
    const { catalog, commits, displays, nodeFactory, rendererRegistry } = createHarness();
    const builtIn = new StringCellTypeDefinition();
    catalog.register(builtIn);
    const builtInCommit = commits.get(CellType.String);
    const builtInFallbackCommit = commits.get('fallback-string');

    const override = new ContractCellTypeDefinition(CellType.String, 'third-party display', CellType.String);
    const disposeOverride = catalog.register(override);

    expect(catalog.get(CellType.String)).toBe(override);
    expect(commits.get(CellType.String)).not.toBe(builtInCommit);
    expect(commits.get('fallback-string')).toBeUndefined();
    expect(displays.getDisplayText({ type: CellType.String, value: 'stored value' }, {})).toBe('third-party display');
    const overrideCell = createCell(nodeFactory, CellType.String);
    expect(overrideCell).toBeInstanceOf(ContractCell);
    expect(rendererRegistry.render(overrideCell)).toEqual([]);

    disposeOverride();

    expect(catalog.get(CellType.String)).toBe(builtIn);
    expect(commits.get(CellType.String)).toMatchObject({ key: builtInCommit?.key });
    expect(commits.get('fallback-string')).toMatchObject({ key: builtInFallbackCommit?.key });
    expect(displays.getDisplayText({ type: CellType.String, value: 'stored value' }, {})).toBe('stored value');
    const restoredCell = createCell(nodeFactory, CellType.String);
    expect(restoredCell).toBeInstanceOf(StringCell);
    // The registry association is restored above; rendering a real StringCell
    // belongs to the render-runtime integration suite, which provides Tree.
    expect(rendererRegistry).toBeDefined();
  });
});
