import {
  CellClipboardCodecRegistry,
  CellCommitStrategyRegistry,
  type CellCommitStrategyDefinition,
  CellType,
} from '@searsuite/sear-domain-cell-types';
import { type Platform } from '@searsuite/sear-foundation-platform';

import { CellTypeCatalog, CellTypeDefinition } from '../src';
import { CellDisplayTextRegistry, type CellDisplayTextProvider } from '../src/CellDisplayTextRegistry';
import { StringCellTypeDefinition } from '../src/BuiltinCellDefinitions';

const contractType = 'contract-cell';
const contractCommitKey = 'contract-cell-commit';

function createCommitStrategy(key: string): CellCommitStrategyDefinition {
  return {
    key,
    priority: 1,
    matches: () => true,
    commit: () => ({ type: contractType, value: 'committed' }),
  };
}

class ContractCellTypeDefinition extends CellTypeDefinition {
  readonly #displayText: string;
  readonly #commitKey: string;

  readonly type: string;

  constructor(type = contractType, displayText = 'contract display', commitKey = contractCommitKey) {
    super();
    this.#displayText = displayText;
    this.#commitKey = commitKey;
    this.type = type;
  }

  override createCommitStrategies(): readonly CellCommitStrategyDefinition[] {
    return [createCommitStrategy(this.#commitKey)];
  }

  override createDisplayTextProvider(): CellDisplayTextProvider {
    return {
      cellType: this.type,
      getDisplayText: () => this.#displayText,
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
}

interface CatalogHarness {
  readonly commits: CellCommitStrategyRegistry;
  readonly clipboardCodecs: CellClipboardCodecRegistry;
  readonly displays: CellDisplayTextRegistry;
  readonly catalog: CellTypeCatalog;
}

function createPlatform(): Platform {
  return { warn: jest.fn() } as unknown as Platform;
}

function createHarness(): CatalogHarness {
  const commits = new CellCommitStrategyRegistry();
  const clipboardCodecs = new CellClipboardCodecRegistry();
  const displays = new CellDisplayTextRegistry(createPlatform());
  return {
    commits,
    clipboardCodecs,
    displays,
    catalog: new CellTypeCatalog(commits, displays, clipboardCodecs),
  };
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

  it('retains the registered stored-value policy independently of presentation', () => {
    const { catalog } = createHarness();
    const definition = new ContractCellTypeDefinition();
    const valid = jest.fn(() => true);
    Object.assign(definition, { isStoredValue: valid });
    catalog.register(definition);
    const cell = { type: contractType, value: 'test' };
    expect(catalog.get(contractType)?.isStoredValue(cell)).toBe(true);
    expect(valid).toHaveBeenCalledWith(cell);
  });

  it('installs a persisted definition into all registries and removes every capability on disposal', () => {
    const { catalog, commits, displays, clipboardCodecs } = createHarness();
    const definition = new ContractCellTypeDefinition();
    const dispose = catalog.register(definition);

    expect(commits.get(contractCommitKey)).toBeDefined();
    expect(displays.getDisplayText({ type: contractType, value: 'stored value' }, {})).toBe('contract display');
    expect(clipboardCodecs.get(contractType)).toBeDefined();

    dispose();

    expect(catalog.get(contractType)).toBeUndefined();
    expect(commits.get(contractCommitKey)).toBeUndefined();
    expect(displays.getDisplayText({ type: contractType, value: 'stored value' }, {})).toBe('stored value');
    expect(clipboardCodecs.get(contractType)).toBeUndefined();
  });

  it('restores a built-in definition and all of its capabilities after a third-party override is disposed', () => {
    const { catalog, commits, displays } = createHarness();
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

    disposeOverride();

    expect(catalog.get(CellType.String)).toBe(builtIn);
    expect(commits.get(CellType.String)).toMatchObject({ key: builtInCommit?.key });
    expect(commits.get('fallback-string')).toMatchObject({ key: builtInFallbackCommit?.key });
    expect(displays.getDisplayText({ type: CellType.String, value: 'stored value' }, {})).toBe('stored value');
  });
});
