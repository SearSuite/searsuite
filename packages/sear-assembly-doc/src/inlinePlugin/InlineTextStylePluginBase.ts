import { SearError } from '@searsuite/sear-foundation-error';
import { PluginKey } from '@searsuite/sear-assembly-plugin';
import { type RichTextInlineStyleContribution, type RichTextInlineStyleRegistry } from '@searsuite/sear-domain-doc';
import { DocPlugin, type DocPluginRuntime, type DocPluginSetupContext } from '../plugin/DocPluginContracts';

/** Shared lifecycle helper for concrete inline style plugins. */
export abstract class InlineTextStylePluginBase extends DocPlugin<null> {
  readonly #contribution: RichTextInlineStyleContribution;

  #runtime: DocPluginRuntime | null = null;

  protected constructor(key: PluginKey, contribution: RichTextInlineStyleContribution) {
    super({ key, state: null });
    this.#contribution = contribution;
  }

  public registerState() {
    return { key: this.key, state: null };
  }

  public apply(_state: null, _transaction: unknown): null {
    return null;
  }

  public configure(context: DocPluginSetupContext): void {
    this.#runtime = context.runtime;
  }

  public registerInlineStyles(registry: RichTextInlineStyleRegistry): void {
    registry.register(this.#contribution);
  }

  public onEditorDestroy(): void {
    this.#runtime = null;
  }

  protected requireRuntime(): DocPluginRuntime {
    if (!this.#runtime) throw new SearError(`${this.key.key} is not configured.`);
    return this.#runtime;
  }
}
