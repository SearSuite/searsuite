import { SearCoreSheet } from '@searsuite/sear-assembly-core';
import { Plugin, PluginKey } from '@searsuite/sear-assembly-plugin';
import { Injectable } from '@searsuite/sear-foundation-di';
import { Node } from '@searsuite/sear-render-node';
import { CellProperties } from '@searsuite/sear-render-registry';
import { Transaction } from '@searsuite/sear-domain-transaction';

/** Stable plugin key for grid overflow rendering. */
export const SheetGridOverflowPluginKey = new PluginKey('SheetGridOverflowPlugin');

/** Placeholder plugin for future grid overflow rendering. */
@Injectable()
export class SheetGridOverflowPlugin extends Plugin<SearCoreSheet, CellProperties, null> {
  /** Grid overflow currently owns no state changes. */
  public apply(pluginState: null, transaction: Transaction): null {
    return null;
  }

  /** Registers placeholder grid overflow state for explicit plugin ownership. */
  public registerState(): { key: PluginKey; state: null } {
    return { key: this.key, state: this.getState() };
  }

  /** DI token for resolving the grid overflow plugin. */
  public static readonly symbol: symbol = Symbol.for('SheetGridOverflowPlugin');

  /** Constructs the grid overflow placeholder. */
  constructor() {
    super({
      key: SheetGridOverflowPluginKey,
      state: null,
    });
  }

  /** Grid overflow rendering currently contributes no nodes. */
  public render(
    searCore: SearCoreSheet,
    offset?: { x: number; y: number },
  ): Node<CellProperties> | Node<CellProperties>[] | null {
    return [];
  }

  /** Grid overflow has no configuration until overflow rendering is implemented. */
  public getPluginConfig(searCore: SearCoreSheet): null {
    return null;
  }
}
