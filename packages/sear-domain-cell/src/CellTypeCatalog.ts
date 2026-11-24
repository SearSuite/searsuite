import { Container, Inject, Injectable, Scope } from '@searsuite/sear-foundation-di';
import {
  CellClipboardCodecRegistry,
  CellFormatTransferRegistry,
  CellCommitStrategyRegistry,
  assertCellExtensionWrite,
  type CellCommitStrategyDefinition,
} from '@searsuite/sear-domain-cell-types';
import { SheetRenderCoordinatorManager } from '@searsuite/sear-render-registry';
import {
  CellDisplayTextRegistry,
  type CellDisplayContext,
  type CellDisplayData,
  type CellDisplayTextProvider,
} from './CellDisplayTextRegistry';
import { CellRenderDefinition } from './CellRenderDefinition';
import { type CellRendererDefinition } from './CellRendererDefinition';
import { CellTypeDefinition } from './CellTypeDefinition';

/**
 * Workbook catalog of available persisted cell types and render-only cell roles.
 *
 * Registering a definition installs all of its capabilities atomically into
 * the specialised registries; disposing it restores the definition it replaced.
 */
@Injectable()
export class CellTypeCatalog {
  readonly #commitStrategies: CellCommitStrategyRegistry;
  readonly #displayTexts: CellDisplayTextRegistry;
  readonly #renderCoordinator: SheetRenderCoordinatorManager;
  readonly #clipboardCodecs: CellClipboardCodecRegistry;
  readonly #formatCodecs: CellFormatTransferRegistry | undefined;

  /** DI token for resolving the workbook cell type catalog. */
  public static readonly symbol = Symbol.for('CellTypeCatalog');

  readonly #definitions = new Map<string | symbol, CellRenderDefinition>();
  readonly #disposers = new Map<string | symbol, () => void>();
  readonly #capabilities = new Map<
    CellRenderDefinition,
    {
      commitStrategies: readonly CellCommitStrategyDefinition[];
      displayTextProvider: CellDisplayTextProvider | undefined;
      clipboardCodec: ReturnType<CellTypeDefinition['createClipboardCodec']>;
      formatCodec: ReturnType<CellTypeDefinition['createFormatTransferCodec']>;
      renderer: CellRendererDefinition;
    }
  >();

  /** Registers implementation registries without exposing them from the package entry point. */
  static install(container: Container): void {
    container.register(CellCommitStrategyRegistry.symbol, CellCommitStrategyRegistry, Scope.Singleton);
    container.register(CellFormatTransferRegistry.symbol, CellFormatTransferRegistry, Scope.Singleton);
    container.register(CellClipboardCodecRegistry.symbol, CellClipboardCodecRegistry, Scope.Singleton);
    container.register(CellDisplayTextRegistry.symbol, CellDisplayTextRegistry, Scope.Singleton);
    container.register(CellTypeCatalog.symbol, CellTypeCatalog, Scope.Singleton);
  }

  /** Creates a catalog over the specialised commit, display-text and renderer registries. */
  constructor(
    @Inject(CellCommitStrategyRegistry.symbol)
    commitStrategies: CellCommitStrategyRegistry,
    @Inject(CellDisplayTextRegistry.symbol)
    displayTexts: CellDisplayTextRegistry,
    @Inject(SheetRenderCoordinatorManager.symbol)
    renderCoordinator: SheetRenderCoordinatorManager,
    @Inject(CellClipboardCodecRegistry.symbol)
    clipboardCodecs: CellClipboardCodecRegistry,
    @Inject(CellFormatTransferRegistry.symbol) formatCodecs?: CellFormatTransferRegistry,
  ) {
    this.#commitStrategies = commitStrategies;
    this.#displayTexts = displayTexts;
    this.#renderCoordinator = renderCoordinator;
    this.#clipboardCodecs = clipboardCodecs;
    this.#formatCodecs = formatCodecs;
  }

  /** Registers a definition atomically and returns a disposer that restores the previous definition. */
  register(definition: CellRenderDefinition): () => void {
    assertCellExtensionWrite(this);
    const type = definition.type;
    const previous = this.#definitions.get(type);
    this.unregister(type);

    const capabilities = this.#capabilities.get(definition) ?? {
      commitStrategies: definition instanceof CellTypeDefinition ? definition.createCommitStrategies() : [],
      displayTextProvider: definition instanceof CellTypeDefinition ? definition.createDisplayTextProvider() : void 0,
      clipboardCodec: definition instanceof CellTypeDefinition ? definition.createClipboardCodec() : void 0,
      formatCodec: definition instanceof CellTypeDefinition ? definition.createFormatTransferCodec() : void 0,
      renderer: definition.createRenderer(),
    };
    this.#capabilities.set(definition, capabilities);

    const disposers = [
      ...(definition instanceof CellTypeDefinition
        ? capabilities.commitStrategies.map((strategy) => this.#commitStrategies.register(strategy))
        : []),
      capabilities.formatCodec && this.#formatCodecs?.register(capabilities.formatCodec),
      capabilities.clipboardCodec && this.#clipboardCodecs.register(capabilities.clipboardCodec),
      capabilities.displayTextProvider && this.#displayTexts.register(capabilities.displayTextProvider),
      definition instanceof CellTypeDefinition &&
        this.#renderCoordinator.registerStoredValueValidator(type, definition.isStoredValue.bind(definition)),
      capabilities.renderer.register(this.#renderCoordinator),
    ].filter((disposer): disposer is () => void => Boolean(disposer));
    Object.freeze(definition);

    const dispose = (): void => {
      assertCellExtensionWrite(this);
      if (this.#definitions.get(type) !== definition) return;
      this.#definitions.delete(type);
      this.#disposers.delete(type);
      [...disposers].reverse().forEach((disposer) => disposer());
      if (previous) this.register(previous);
    };

    this.#definitions.set(type, definition);
    this.#disposers.set(type, dispose);
    return dispose;
  }

  /** Unregisters a definition by type key. */
  unregister(type: string | symbol): boolean {
    assertCellExtensionWrite(this);
    const dispose = this.#disposers.get(type);
    if (!dispose) return false;
    dispose();
    return true;
  }

  /** Returns the registered definition for a type key. */
  get(type: string | symbol): CellRenderDefinition | undefined {
    return this.#definitions.get(type);
  }

  /** Returns all registered definitions in insertion order. */
  getAll(): readonly CellRenderDefinition[] {
    return [...this.#definitions.values()];
  }

  /** Resolves display text through the registered provider for a persisted cell type. */
  getDisplayText(cell: CellDisplayData, context: CellDisplayContext): string {
    return this.#displayTexts.getDisplayText(cell, context);
  }
}
