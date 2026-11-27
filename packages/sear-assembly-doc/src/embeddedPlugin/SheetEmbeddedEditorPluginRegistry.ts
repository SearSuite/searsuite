import { SearError } from '@searsuite/sear-foundation-error';
import { type Schema } from '@searsuite/sear-domain-doc-schema';
import { type SheetEditInput, type SheetInlineStyleUpdate } from '../input/DocEditInput';
import { type SheetEmbeddedEditorPlugin, type SheetEmbeddedEditorPluginContext } from './SheetEmbeddedEditorPlugin';
type SheetDocument = readonly Schema[];

/** Ordered registry used by the lightweight Sheet embedded editor. */
export class SheetEmbeddedEditorPluginRegistry {
  readonly #plugins = new Map<string, SheetEmbeddedEditorPlugin>();
  #assertWrite: (() => void) | null = null;
  #teardownToken: object | null = null;

  /** Restricts plugin changes after the embedded editor joins a Sheet command bus. */
  public enforceWriteBoundary(assertWrite: () => void, teardownToken: object): void {
    if (this.#assertWrite) throw new SearError('Sheet embedded plugin write boundary is already installed.');
    this.#assertWrite = assertWrite;
    this.#teardownToken = teardownToken;
    Object.freeze(this);
  }

  public register(plugin: SheetEmbeddedEditorPlugin): void {
    this.#assertWrite?.();
    const key = plugin.key;
    if (this.#plugins.has(key)) throw new SearError(`Sheet embedded editor plugin ${key} already exists.`);
    const registration: SheetEmbeddedEditorPlugin = Object.freeze({
      key,
      ...(plugin.initialize ? { initialize: plugin.initialize.bind(plugin) } : {}),
      ...(plugin.transformInput ? { transformInput: plugin.transformInput.bind(plugin) } : {}),
      ...(plugin.transformInlineStyle ? { transformInlineStyle: plugin.transformInlineStyle.bind(plugin) } : {}),
      ...(plugin.transformCommit ? { transformCommit: plugin.transformCommit.bind(plugin) } : {}),
      ...(plugin.onDocumentChanged ? { onDocumentChanged: plugin.onDocumentChanged.bind(plugin) } : {}),
      ...(plugin.onCommit ? { onCommit: plugin.onCommit.bind(plugin) } : {}),
      ...(plugin.onCancel ? { onCancel: plugin.onCancel.bind(plugin) } : {}),
      ...(plugin.dispose ? { dispose: plugin.dispose.bind(plugin) } : {}),
    });
    this.#plugins.set(key, registration);
  }

  public getAll(): readonly SheetEmbeddedEditorPlugin[] {
    return [...this.#plugins.values()];
  }

  public get(key: string): SheetEmbeddedEditorPlugin | undefined {
    return this.#plugins.get(key);
  }

  public unregister(key: string): void {
    this.#assertWrite?.();
    const plugin = this.#plugins.get(key);
    if (!plugin) return;
    plugin.dispose?.();
    this.#plugins.delete(key);
  }

  public initialize(context: SheetEmbeddedEditorPluginContext): void {
    this.#assertWrite?.();
    try {
      this.getAll().forEach((plugin) => plugin.initialize?.(context));
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  public transformInput(input: SheetEditInput, context: SheetEmbeddedEditorPluginContext): SheetEditInput | null {
    this.#assertWrite?.();
    let current: SheetEditInput | null = input;
    for (const plugin of this.getAll()) {
      if (!current) break;
      const next: SheetEditInput | null | undefined | void = plugin.transformInput?.(current, context);
      if (next !== void 0) current = next;
    }
    return current;
  }

  public transformInlineStyle(
    update: SheetInlineStyleUpdate,
    context: SheetEmbeddedEditorPluginContext,
  ): SheetInlineStyleUpdate | null {
    this.#assertWrite?.();
    let current: SheetInlineStyleUpdate | null = update;
    for (const plugin of this.getAll()) {
      if (!current) break;
      const next: SheetInlineStyleUpdate | null | undefined | void = plugin.transformInlineStyle?.(current, context);
      if (next !== void 0) current = next;
    }
    return current;
  }

  public notifyDocumentChanged(context: SheetEmbeddedEditorPluginContext): void {
    this.getAll().forEach((plugin) => plugin.onDocumentChanged?.(context));
  }

  public transformCommit(document: SheetDocument, context: SheetEmbeddedEditorPluginContext): SheetDocument | null {
    this.#assertWrite?.();
    let current: SheetDocument | null = document;
    for (const plugin of this.getAll()) {
      if (!current) break;
      const next: SheetDocument | null | undefined | void = plugin.transformCommit?.(current, context);
      if (next !== void 0) current = next;
    }
    return current;
  }

  public notifyCommit(document: SheetDocument, context: SheetEmbeddedEditorPluginContext): void {
    this.#assertWrite?.();
    this.getAll().forEach((plugin) => plugin.onCommit?.(document, context));
  }

  public notifyCancel(context: SheetEmbeddedEditorPluginContext): void {
    this.#assertWrite?.();
    this.getAll().forEach((plugin) => plugin.onCancel?.(context));
  }

  public dispose(ownerToken?: object): void {
    if (this.#assertWrite && ownerToken !== this.#teardownToken) this.#assertWrite();
    for (const plugin of [...this.#plugins.values()].reverse()) plugin.dispose?.();
    this.#plugins.clear();
  }
}
