import { PluginKey, Plugin } from '@searsuite/sear-assembly-plugin';
import { NodeProperties } from '@searsuite/sear-render-node';

/** Platform-neutral core contract shared by sheet and document hosts. */
export abstract class SearCore<ChildType, NodeTypeProperties extends NodeProperties, RenderCoordinatorManagerType> {
  /** DI token for resolving the active core implementation. */
  public static readonly symbol: symbol = Symbol.for('SearCore');

  /** Initializes core-owned state, scene nodes, and runtime services. */
  protected abstract initialize(): void;

  /** Registers a plugin with the core's plugin manager. */
  public abstract registerPlugin<T>(plugin: Plugin<this, NodeTypeProperties, T>): void;

  /** Retrieves a plugin instance by plugin key. */
  public abstract getPlugin(pluginKey: PluginKey): unknown;
}
