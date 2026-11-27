import { ViewExtensionBase } from '@searsuite/sear-render-event-engine';
import { DocCursorManager, SearCoreDoc } from '@searsuite/sear-assembly-core';
import { DocInputPlugin } from '@searsuite/sear-assembly-doc';
import { DocCommandBus } from '@searsuite/sear-assembly-commands';
import { ConfigEngine } from '@searsuite/sear-assembly-config';
import { type PluginManager, type SessionStateRegistry } from '@searsuite/sear-assembly-plugin';
import { DocNodeRegistry, RichTextInlineStyleRegistry, RichTextLineBoxRegistry, RichTextBlockFlowRegistry } from '@searsuite/sear-domain-doc';
import { DocLayoutEngine, type DocBlockRenderDebugSnapshot } from '@searsuite/sear-domain-editor';
import { type Container } from '@searsuite/sear-foundation-di';
import { Platform } from '@searsuite/sear-foundation-platform';
import { RenderContext } from '@searsuite/sear-render-context';
import { EventEngine, EventRegistrar } from '@searsuite/sear-render-event-engine';
import { TextInput, KeyboardRouter, PointerCapture, type KeyboardRouterHandlers } from '@searsuite/sear-render-input';
import { TextShaper } from '@searsuite/sear-render-metrics';
import { RichTextRunRenderRegistry, type NodeProperties, type RichTextRunRenderContribution } from '@searsuite/sear-render-node';
import { ScrollManager } from '@searsuite/sear-render-scroll';
import { type ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import { defineDocRuntimeCapability, DocRuntimeExtensionRegistry } from '@searsuite/sear-assembly-doc';
import { type DocInputBindingRegistryCapability } from './DocViewCapabilities';

/** Render phase reported by virtual document layout instrumentation. */
export type DocVirtualLayoutRenderPhase = 'initial' | 'realtime';

/** Timing summary reported by virtual document layout instrumentation. */
export interface DocVirtualLayoutTimingSummary {
  readonly documentModelMs: number;
  readonly viewportRangeMs: number;
  readonly materializeBlocksMs: number;
  readonly heightCorrectionMs: number;
  readonly snapshotCacheMs: number;
  readonly cursorSelectionMs: number;
  readonly virtualLayoutTotalMs: number;
  readonly renderPrepareMode?: 'full' | 'viewport';
  readonly renderPrepareMs?: number;
}

/** Public virtual layout summary exposed through the Doc layout-service capability. */
export interface DocVirtualLayoutSummary {
  readonly renderPhase?: DocVirtualLayoutRenderPhase;
  readonly initialLoadMs?: number;
  readonly model: 'reused' | 'rebuilt';
  readonly totalBlocks: number;
  readonly rangeStart: number;
  readonly rangeEnd: number;
  readonly cursorBlock: number | null;
  readonly materializedBlocks: number;
  readonly materializedIndexes: string;
  readonly cacheHits: number;
  readonly cacheMisses: number;
  readonly heightIndexUpdated: boolean;
  readonly documentHeight: number;
  readonly blockRender?: DocBlockRenderDebugSnapshot;
  readonly timings: DocVirtualLayoutTimingSummary;
}

/** Listener notified when the virtual layout summary changes. */
export type DocVirtualLayoutSummaryListener = (summary: DocVirtualLayoutSummary) => void;

/** Public layout-service surface exposed to Doc plugins and hosts. */
export interface DocRenderLayoutServiceCapability {
  reset(): void;
  getLatestVirtualLayoutSummary(): DocVirtualLayoutSummary | null;
  subscribeVirtualLayoutSummary(listener: DocVirtualLayoutSummaryListener): () => void;
}

/** Render-engine surface exposed to Doc plugins. */
export interface DocRenderEngineCapability {
  /** Reads committed state and returns retained nodes for the current viewport. */
  render(pluginKey?: unknown): void;
}

/** Stable host capabilities supplied to a DocView after editor assembly. */
export interface DocViewRuntime {
  /** Extension capability registry for third-party document plugins. */
  readonly extensions: DocRuntimeExtensionRegistry;
  /** Platform adapter for timers, resize observation, and diagnostics. */
  readonly platform: Platform;
  /** Command bus exposed by the document editor instance. */
  readonly commands: DocCommandBus;
  /** Typed state and event observations owned by this editor instance. */
  readonly observations: ObservationRegistry;
  /** Local remount state contributed by built-in and third-party plugins. */
  readonly session: SessionStateRegistry;
  /** Ordered document plugin registry for this editor. */
  readonly plugins: PluginManager;
  /** Text shaper used by document layout and rendering. */
  readonly textShaper: TextShaper;
  /** Document render services and visible context. */
  readonly render: {
    /** Render engine that schedules full or partial document redraws. */
    readonly engine: DocRenderEngineCapability;
    /** Visible render context selected by the host. */
    readonly context: RenderContext;
  };
  /** Event and hit-test services used by document interactions. */
  readonly events: {
    /** Event engine that dispatches normalized host events with hit targets. */
    readonly engine: EventEngine<NodeProperties>;
    /** Event registrar selected by the host adapter. */
    readonly registrar: EventRegistrar;
  };
  /** Host input adapters used by document editing commands. */
  readonly input: {
    /** Text input adapter for printable text, paste/cut, and IME composition. */
    readonly text: TextInput;
    /** Keyboard router for action keys. */
    readonly keyboard: KeyboardRouter;
    /** Host-wide pointer capture adapter using render-root view coordinates. */
    readonly pointer: PointerCapture;
  };
  /** Scroll state shared by document layout and rendering. */
  readonly scroll: {
    /** Scroll manager for the visible document viewport. */
    readonly manager: ScrollManager;
  };
  /** Rich-document domain services. */
  readonly document: {
    /** Core document runtime. */
    readonly core: SearCoreDoc;
    /** Node registry for schema-owned rich document nodes. */
    readonly nodes: DocNodeRegistry;
    /** Layout engine used by cursor, selection, pagination, and rendering. */
    readonly layout: DocLayoutEngine;
    /** Cursor, selection, IME composition, and caret render state. */
    readonly cursor: DocCursorManager;
    /** Plugin-owned inline text style readers and mutation policies. */
    readonly inlineStyles: RichTextInlineStyleRegistry;
    /** Plugin-owned line box resolver contributions. */
    readonly lineBoxes: RichTextLineBoxRegistry;
    /** Plugin-owned block flow resolver contributions. */
    readonly blockFlows: RichTextBlockFlowRegistry;
    /** Default input plugin that applies rich-document editing operations. */
    readonly input: DocInputPlugin;
  };
}

/** Document runtime capabilities registered by the default assembly root. */
export const DocViewCapability = {
  Platform: defineDocRuntimeCapability<Platform>('doc.runtime.platform'),
  Config: defineDocRuntimeCapability<ConfigEngine>('doc.runtime.config'),
  Commands: defineDocRuntimeCapability<DocCommandBus>('doc.runtime.commands'),
  Observations: defineDocRuntimeCapability<ObservationRegistry>('doc.runtime.observations'),
  Session: defineDocRuntimeCapability<SessionStateRegistry>('doc.runtime.session'),
  Plugins: defineDocRuntimeCapability<PluginManager>('doc.runtime.plugins'),
  TextShaper: defineDocRuntimeCapability<TextShaper>('doc.runtime.textShaper'),
  Render: defineDocRuntimeCapability<DocViewRuntime['render']>('doc.runtime.render'),
  Events: defineDocRuntimeCapability<DocViewRuntime['events']>('doc.runtime.events'),
  Input: defineDocRuntimeCapability<DocViewRuntime['input']>('doc.runtime.input'),
  Scroll: defineDocRuntimeCapability<DocViewRuntime['scroll']>('doc.runtime.scroll'),
  Document: defineDocRuntimeCapability<DocViewRuntime['document']>('doc.runtime.document'),
  InlineStyles: defineDocRuntimeCapability<RichTextInlineStyleRegistry>('doc.runtime.inlineStyles'),
  LineBoxes: defineDocRuntimeCapability<RichTextLineBoxRegistry>('doc.runtime.lineBoxes'),
  BlockFlows: defineDocRuntimeCapability<RichTextBlockFlowRegistry>('doc.runtime.blockFlows'),
  LayoutService: defineDocRuntimeCapability<DocRenderLayoutServiceCapability>('doc.runtime.layoutService'),
} as const;

/** Services available while createDocEditor() registers document plugins. */
export interface DocViewServiceContext {
  /** DI container used by the document assembly root. */
  readonly container: Container;
}

/** Typed public services available before createDocEditor() starts Core. */
export interface DocViewSetupContext {
  /** DI container used by the document assembly root. */
  readonly container: Container;
  /** Runtime services available to document plugins. */
  readonly runtime: DocViewRuntime;
}

/** Services available while a Doc plugin registers keyboard bindings. */
export interface DocKeyboardHandlerRegistrationContext {
  /** Aggregates plugin-owned keyboard handlers for the host adapter. */
  readonly bindings: DocInputBindingRegistryCapability;
  /** Executes semantic editor commands from keyboard handlers. */
  readonly commands: DocCommandBus;
}

/** Document setup capabilities plus the Core created by createDocEditor(). */
export interface DocViewRuntimeContext extends DocViewSetupContext {
  /** Core document runtime. */
  readonly core: SearCoreDoc;
}

/** Convenience base class for a Plugin targeting createDocEditor(). */
export abstract class DocView extends ViewExtensionBase<SearCoreDoc, NodeProperties> {
  /** Registers editor-local dependencies before this contribution is constructed. */
  public static registerServices?(context: DocViewServiceContext): void;
  /** Registers typed commands; subsequent mutations run through the owning command bus. */
  public registerCommands?(commands: DocCommandBus): void;
  /** Registers native shortcuts and returns ownership of their disposal to the host. */
  public registerKeyboardHandlers?(context: DocKeyboardHandlerRegistrationContext): void;
  /** Maps semantic inline styles to drawing contributions in this view. */
  public registerInlineStyleRenderers?(registry: RichTextRunRenderRegistry): void;
  /** Connects editor-local capabilities during assembly before startup. */
  public configure?(context: DocViewSetupContext): void;
  /** Completes setup after command, query and observation registrations are available. */
  public initialize?(context: DocViewRuntimeContext): void;
  /** Starts lifecycle-owned subscriptions after initialization succeeds. */
  public start?(context: DocViewRuntimeContext): void;
  /** Releases this presentation and its native listeners without changing document state. */
  public destroyView?(): void;
}

/** Injectable DocView class accepted by createDocEditor(). */
export interface DocViewImplementation<TPlugin extends DocView> {
  new (...args: never[]): TPlugin;
  /** Dependency injection token for this editor-local implementation. */
  readonly symbol: symbol;
  /** Registers editor-local dependencies before this contribution is constructed. */
  registerServices?(context: DocViewServiceContext): void;
}

/** Registers every keyboard binding contributed by document plugins. */
export function registerDocPluginKeyboardHandlers(
  plugins: readonly unknown[],
  context: DocKeyboardHandlerRegistrationContext,
): () => void {
  const unregisterHandlers: Array<() => void> = [];
  const registrar: DocKeyboardHandlerRegistrationContext = {
    commands: context.commands,
    bindings: createDocKeyboardBindingRegistrationRecorder(context.bindings, unregisterHandlers),
  };
  try {
    plugins.forEach(function registerDocPluginKeyboardHandler(plugin) {
      if (hasPluginKeyboardHandlerRegistrar(plugin)) plugin.registerKeyboardHandlers(registrar);
    });
  } catch (error) {
    unregisterRecordedKeyboardHandlers(unregisterHandlers);
    throw error;
  }
  return function unregisterDocPluginKeyboardHandlers(): void {
    unregisterRecordedKeyboardHandlers(unregisterHandlers);
  };
}

/** Registers every rich-text run renderer contributed by document plugins. */
export function registerDocPluginInlineStyleRenderers(
  plugins: readonly unknown[],
  registry: RichTextRunRenderRegistry,
): () => void {
  const unregisterContributions: Array<() => void> = [];
  const registrar = createDocInlineStyleRenderRegistrationRecorder(registry, unregisterContributions);
  try {
    plugins.forEach(function registerDocPluginInlineStyleRenderer(plugin) {
      if (hasDocInlineStyleRenderRegistrar(plugin)) plugin.registerInlineStyleRenderers(registrar);
    });
  } catch (error) {
    unregisterRecordedDocInlineStyleRenderers(unregisterContributions);
    throw error;
  }
  return function unregisterDocPluginInlineStyleRenderers(): void {
    unregisterRecordedDocInlineStyleRenderers(unregisterContributions);
  };
}

interface DocKeyboardHandlerRegistrar {
  /** Registers native shortcuts and returns ownership of their disposal to the host. */
  registerKeyboardHandlers(context: DocKeyboardHandlerRegistrationContext): void;
}

function hasPluginKeyboardHandlerRegistrar(plugin: unknown): plugin is DocKeyboardHandlerRegistrar {
  return (
    typeof (
      plugin as {
        /** Registers native shortcuts and returns ownership of their disposal to the host. */
        registerKeyboardHandlers?: unknown;
      }
    ).registerKeyboardHandlers === 'function'
  );
}

interface DocInlineStyleRenderRegistrar {
  /** Maps semantic inline styles to drawing contributions in this view. */
  registerInlineStyleRenderers(registry: RichTextRunRenderRegistry): void;
}

function hasDocInlineStyleRenderRegistrar(plugin: unknown): plugin is DocInlineStyleRenderRegistrar {
  return (
    typeof (
      plugin as {
        /** Maps semantic inline styles to drawing contributions in this view. */
        registerInlineStyleRenderers?: unknown;
      }
    ).registerInlineStyleRenderers === 'function'
  );
}

function createDocInlineStyleRenderRegistrationRecorder(
  registry: RichTextRunRenderRegistry,
  unregisterContributions: Array<() => void>,
): RichTextRunRenderRegistry {
  return createDocRegistryRegistrar(registry, (contribution: RichTextRunRenderContribution) => {
    const unregister = registry.register(contribution);
    unregisterContributions.push(unregister);
    return unregister;
  });
}

function createDocRegistryRegistrar<Registry extends object, Contribution>(
  registry: Registry,
  register: (contribution: Contribution) => () => void,
): Registry {
  return new Proxy(registry, {
    get(target, property) {
      if (property === 'register') return register;
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function createDocCommandRegistrationRecorder(
  commands: DocCommandBus,
  unregisterCommands: Array<() => void>,
): DocCommandBus {
  const register: DocCommandBus['register'] = function registerDocCommandAndRecord(definition, factory) {
    const unregister = commands.register(definition, factory);
    unregisterCommands.push(unregister);
    return unregister;
  } as DocCommandBus['register'];
  return new Proxy(commands, {
    get(target, property) {
      if (property === 'register') return register;
      const value = Reflect.get(target, property, target);
      if (Object.getOwnPropertyDescriptor(target, property)?.configurable === false) return value;
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function createDocKeyboardBindingRegistrationRecorder(
  bindings: DocInputBindingRegistryCapability,
  unregisterHandlers: Array<() => void>,
): DocInputBindingRegistryCapability {
  return {
    registerTextHandlers: bindings.registerTextHandlers.bind(bindings),
    /** Registers native shortcuts and returns ownership of their disposal to the host. */
    registerKeyboardHandlers(handlers: KeyboardRouterHandlers): () => void {
      const unregister = bindings.registerKeyboardHandlers(handlers);
      unregisterHandlers.push(unregister);
      return unregister;
    },
  };
}

function unregisterRecordedDocCommands(unregisterCommands: Array<() => void>): void {
  for (let index = unregisterCommands.length - 1; index >= 0; index--) unregisterCommands[index]();
  unregisterCommands.length = 0;
}

function unregisterRecordedKeyboardHandlers(unregisterHandlers: Array<() => void>): void {
  for (let index = unregisterHandlers.length - 1; index >= 0; index--) unregisterHandlers[index]();
  unregisterHandlers.length = 0;
}

function unregisterRecordedDocInlineStyleRenderers(unregisterContributions: Array<() => void>): void {
  for (let index = unregisterContributions.length - 1; index >= 0; index--) unregisterContributions[index]();
  unregisterContributions.length = 0;
}
