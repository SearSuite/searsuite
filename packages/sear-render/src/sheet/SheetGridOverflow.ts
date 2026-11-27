import { ViewExtensionBase } from '@searsuite/sear-render-event-engine';
import { SearCoreSheet } from '@searsuite/sear-assembly-core';
import { PluginKey } from '@searsuite/sear-assembly-plugin';
import { Injectable } from '@searsuite/sear-foundation-di';

import { CellProperties } from '@searsuite/sear-render-registry';

/** Stable plugin key for grid overflow rendering. */
export const SheetGridOverflowPluginKey = new PluginKey('SheetGridOverflowView');

/** Placeholder plugin for future grid overflow rendering. */
@Injectable()
export class SheetGridOverflowView extends ViewExtensionBase<SearCoreSheet, CellProperties> {
  /** DI token for resolving the grid overflow plugin. */
  public static readonly symbol: symbol = Symbol.for('SheetGridOverflowView');

  /** Constructs the grid overflow placeholder. */
  constructor() {
    super(SheetGridOverflowPluginKey);
  }
}
