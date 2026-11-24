import { SearError } from '@searsuite/sear-foundation-error';
import { PluginKey } from '@searsuite/sear-assembly-plugin';
import { type RichTextInlineStyleContribution, type RichTextInlineStyleRegistry } from '@searsuite/sear-domain-doc';
import {
  type Node,
  type NodeProperties,
  RichTextRunRenderRegistry,
  type RichTextRunRenderContribution,
} from '@searsuite/sear-render-node';
import { DocPlugin, type DocPluginRuntime, type DocPluginSetupContext } from '../plugin/DocPluginContracts';

/** Shared lifecycle helper for concrete inline style plugins. */
export abstract class InlineTextStylePluginBase extends DocPlugin<null> {
  readonly #contribution: RichTextInlineStyleContribution;
  readonly #renderContribution: RichTextRunRenderContribution | undefined;

  #runtime: DocPluginRuntime | null = null;

  protected constructor(
    key: PluginKey,
    contribution: RichTextInlineStyleContribution,
    renderContribution?: RichTextRunRenderContribution,
  ) {
    super({ key, state: null });
    this.#contribution = contribution;
    this.#renderContribution = renderContribution;
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

  public render(): Node<NodeProperties>[] | null {
    return null;
  }

  public configure(context: DocPluginSetupContext): void {
    this.#runtime = context.runtime;
  }

  public registerInlineStyles(registry: RichTextInlineStyleRegistry): void {
    registry.register(this.#contribution);
  }

  public registerInlineStyleRenderers(registry: RichTextRunRenderRegistry): void {
    if (this.#renderContribution) registry.register(this.#renderContribution);
  }

  public onEditorDestroy(): void {
    this.#runtime = null;
  }

  protected requireRuntime(): DocPluginRuntime {
    if (!this.#runtime) throw new SearError(`${this.key.key} is not configured.`);
    return this.#runtime;
  }
}
