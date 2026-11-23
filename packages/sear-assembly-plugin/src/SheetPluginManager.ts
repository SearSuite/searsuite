import { Injectable } from '@searsuite/sear-foundation-di';
import { CellProperties } from '@searsuite/sear-render-registry';

import { PluginManager } from './PluginManager';

/**
 * Plugin manager specialization for sheet plugins.
 *
 * It binds the generic plugin manager to sheet cell properties so sheet assembly
 * code can resolve one named manager token.
 */
@Injectable()
export class SheetPluginManager<SearCoreType> extends PluginManager<SearCoreType, CellProperties> {}
