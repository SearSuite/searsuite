import { PluginKey } from '@searsuite/sear-assembly-plugin';
import { Injectable } from '@searsuite/sear-foundation-di';
import { type Node } from '@searsuite/sear-render-node';
import { type CellProperties } from '@searsuite/sear-render-registry';
import { SheetPlugin } from '../../SheetPluginContracts';

/** Empty Sheet debug overlay placeholder used by hosts that enable ?debug. */
@Injectable()
export class SheetDebugOverlayPlugin extends SheetPlugin<null> {
  /** DI token for resolving SheetDebugOverlayPlugin. */
  public static readonly symbol = Symbol.for('SheetDebugOverlayPlugin');

  /** Creates a SheetDebugOverlayPlugin instance. */
  public constructor() {
    super({ key: new PluginKey('SheetDebugOverlay'), state: null });
  }

  public registerState() {
    return { key: this.key, state: null };
  }

  public apply(_state: null, _transaction: unknown): null {
    return null;
  }

  public getPluginConfig(): null {
    return null;
  }

  public render(): Node<CellProperties>[] | null {
    return null;
  }
}
