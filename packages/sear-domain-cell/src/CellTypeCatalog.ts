import { Container, Inject, Injectable, Scope } from '@searsuite/sear-foundation-di';
import {
  CellClipboardCodecRegistry,
  CellFormatTransferRegistry,
  CellCommitStrategyRegistry,
  assertCellExtensionWrite,
  type CellCommitStrategyDefinition,
} from '@searsuite/sear-domain-cell-types';

import {
  CellDisplayTextRegistry,
  type CellDisplayContext,
  type CellDisplayData,
  type CellDisplayTextProvider,
} from './CellDisplayTextRegistry';
import { CellTypeDefinition } from './CellTypeDefinition';

/**
 * Editor-local catalog of persisted cell types and their semantic capabilities.
 *
 * Registering a definition installs all of its capabilities atomically into
 * the specialised registries; disposing it restores the definition it replaced.
 */
@Injectable()
export class CellTypeCatalog {
  readonly #commitStrategies: CellCommitStrategyRegistry;
  readonly #displayTexts: CellDisplayTextRegistry;
  readonly #clipboardCodecs: CellClipboardCodecRegistry;
  readonly #formatCodecs: CellFormatTransferRegistry | undefined;

  /** DI token for resolving the workbook cell type catalog. */
  public static readonly symbol = Symbol.for('CellTypeCatalog');

  readonly #definitions = new Map<string | symbol, CellTypeDefinition>();
  readonly #disposers = new Map<string | symbol, () => void>();
  readonly #capabilities = new Map<
    CellTypeDefinition,
    {
      commitStrategies: readonly CellCommitStrategyDefinition[];
      displayTextProvider: CellDisplayTextProvider | undefined;
      clipboardCodec: ReturnType<CellTypeDefinition['createClipboardCodec']>;
      formatCodec: ReturnType<CellTypeDefinition['createFormatTransferCodec']>;
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

  /** Creates a catalog over the commit, display-text, clipboard and format registries. */
  constructor(
    @Inject(CellCommitStrategyRegistry.symbol)
    commitStrategies: CellCommitStrategyRegistry,
    @Inject(CellDisplayTextRegistry.symbol)
    displayTexts: CellDisplayTextRegistry,
    @Inject(CellClipboardCodecRegistry.symbol)
    clipboardCodecs: CellClipboardCodecRegistry,
    @Inject(CellFormatTransferRegistry.symbol) formatCodecs?: CellFormatTransferRegistry,
  ) {
    this.#commitStrategies = commitStrategies;
    this.#displayTexts = displayTexts;
    this.#clipboardCodecs = clipboardCodecs;
    this.#formatCodecs = formatCodecs;
  }

  /** Registers a definition atomically and returns a disposer that restores the previous definition. */
  register(definition: CellTypeDefinition): () => void {
    assertCellExtensionWrite(this);
    const type = definition.type;
    const previous = this.#definitions.get(type);
    this.unregister(type);

    const capabilities = this.#capabilities.get(definition) ?? {
      commitStrategies: definition instanceof CellTypeDefinition ? definition.createCommitStrategies() : [],
      displayTextProvider: definition instanceof CellTypeDefinition ? definition.createDisplayTextProvider() : void 0,
      clipboardCodec: definition instanceof CellTypeDefinition ? definition.createClipboardCodec() : void 0,
      formatCodec: definition instanceof CellTypeDefinition ? definition.createFormatTransferCodec() : void 0,
    };
    this.#capabilities.set(definition, capabilities);

    const disposers = [
      ...(definition instanceof CellTypeDefinition
        ? capabilities.commitStrategies.map((strategy) => this.#commitStrategies.register(strategy))
        : []),
      capabilities.formatCodec && this.#formatCodecs?.register(capabilities.formatCodec),
      capabilities.clipboardCodec && this.#clipboardCodecs.register(capabilities.clipboardCodec),
      capabilities.displayTextProvider && this.#displayTexts.register(capabilities.displayTextProvider),
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
  get(type: string | symbol): CellTypeDefinition | undefined {
    return this.#definitions.get(type);
  }

  /** Returns all registered definitions in insertion order. */
  getAll(): readonly CellTypeDefinition[] {
    return [...this.#definitions.values()];
  }

  /** Resolves display text through the registered provider for a persisted cell type. */
  getDisplayText(cell: CellDisplayData, context: CellDisplayContext): string {
    return this.#displayTexts.getDisplayText(cell, context);
  }
}
