import { DocCommandBus } from '@searsuite/sear-assembly-commands';
import { type IncrementalRenderPolicyLimitsConfig } from '@searsuite/sear-assembly-config';
import {
  type DocPlugin,
  type DocPluginImplementation,
  type DocRuntimeCapabilityReader,
} from '@searsuite/sear-assembly-doc';
import { type DocDocumentState, type DocKernelEditor, type DocSessionState } from '@searsuite/sear-assembly-doc-kernel';
import { type RichDocNode } from '@searsuite/sear-domain-doc';
import { type DocVerticalAlign } from '@searsuite/sear-domain-editor';
import { type Container } from '@searsuite/sear-foundation-di';
import { Platform } from '@searsuite/sear-foundation-platform';
import { type ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import { RenderContext } from '@searsuite/sear-render-context';
import { type EventRegistrar } from '@searsuite/sear-render-event-engine';
import { KeyboardRouter, PointerCapture, TextInput } from '@searsuite/sear-render-input';
import { type TextShaper } from '@searsuite/sear-render-metrics';
import { Scroller, type ScrollPublisher } from '@searsuite/sear-render-scroll';
import { type DocView, type DocViewImplementation } from './DocViewContracts';

/** Constructor contract for DI-registered adapter implementations. */
export type InjectableImplementation<T> = new (...args: never[]) => T;

/** Viewport dimensions in host-view coordinates. */
export interface DocEditorViewport {
  /** Viewport width in host-view units. */
  width: number;
  /** Viewport height in host-view units. */
  height: number;
}

/** Rectangle used for document text layout and rendering. */
export interface DocEditorContentRect extends DocEditorViewport {
  /** Left edge in host-view coordinates. */
  x: number;
  /** Top edge in host-view coordinates. */
  y: number;
}

export type { DocDocumentState, DocEditorChange, DocSessionState } from '@searsuite/sear-assembly-doc-kernel';

/** Platform-specific services required to assemble a standalone document editor. */
export interface DocEditorAdapters {
  /** Platform implementation that owns timers, resize observation, and diagnostics. */
  platform: InjectableImplementation<Platform>;
  /** Creates the visible render context used by the document editor. */
  createRenderContext(): RenderContext;
  /** Optional text-shaping adapter; omission uses render-context measurements. */
  createTextShaper?(renderContext: RenderContext): TextShaper;
  /** Optional host scroller adapter for wheel/touch viewport scrolling. */
  scroller?: InjectableImplementation<Scroller & { getPublisher(): ScrollPublisher }>;
  /** Host event registrar selected explicitly by the visual host. */
  eventRegistrar: InjectableImplementation<EventRegistrar>;
  /** Text input adapter for printable text, paste/cut, and IME composition. */
  textInput: InjectableImplementation<TextInput>;
  /** Keyboard router for action keys such as arrows, backspace, enter, and select-all. */
  keyboardRouter: InjectableImplementation<KeyboardRouter>;
  /** Host-wide pointer capture adapter that emits render-root view coordinates. */
  pointerCapture: InjectableImplementation<PointerCapture>;
  /**
   * Registers host environment values, such as keyboard and pointer event sources.
   * Runs after base services are registered and before adapters are resolved.
   */
  registerEnvironment?(container: Container): void;
}

/** Configuration for assembling a standalone rich-document editor. */
export interface DocEditorConfiguration {
  /** Initial viewport size; defaults to 800 by 600 when the host cannot know it yet. */
  viewport?: DocEditorViewport;
  /** Platform adapters supplied by the host application. */
  adapters: DocEditorAdapters;
  /** Initial document-owned state. */
  documentState: DocDocumentState;
  /** Optional editor-local state restored during an in-memory remount. */
  sessionState?: DocSessionState;
  /** Raster scale used to initialize and resize the render context. */
  devicePixelRatio?: number;
  /** Default font size applied when measuring and rendering document text. */
  fontSize?: number;
  /** Default font family and fallback list applied to document text. */
  fontFamily?: string;
  /** Default line-height multiplier applied to paragraphs without an explicit override. */
  lineHeightMultiplier?: number;
  /** Default spacing after non-final paragraphs. */
  paragraphSpacingAfter?: number;
  /** Guardrails used when deciding whether document block raster reuse should run for a frame. */
  incrementalRenderPolicyLimits?: IncrementalRenderPolicyLimitsConfig;
  /** Vertical positioning used by standalone document layout; defaults to top. */
  verticalAlign?: DocVerticalAlign;
  /**
   * Resolves the editable content rectangle from the current viewport.
   * Hosts use this to add page margins, rulers, or chrome without changing core document layout.
   */
  contentRect?(viewport: DocEditorViewport): DocEditorContentRect;
  /** Called once the editor object has been assembled and initial content rendered. */
  onCreated?(editor: DocEditor): void;
  /** Default document feature plugins; pass false to assemble only custom plugins. */
  defaultPlugins?: readonly DocPluginImplementation<DocPlugin<unknown>>[] | false;
  /** Document plugins installed after the default editing and rendering features. */
  plugins?: DocPluginImplementation<DocPlugin<unknown>>[];
  /** Presentation extensions selected independently of state plugins. */
  defaultViews?: readonly DocViewImplementation<DocView>[] | false;
  viewExtensions?: readonly DocViewImplementation<DocView>[];
}

/** Public standalone document editor API returned by `createDocEditor()`. */
export interface DocEditor extends DocKernelEditor {
  /** The supported command entry point for document user and program actions. */
  readonly commands: DocCommandBus;
  /** Typed editor-local state and event observations exposed to the host. */
  readonly observations: ObservationRegistry;
  /** Read-only access to typed services owned by this editor's isolated runtime. */
  readonly services: DocRuntimeCapabilityReader;
  /** Replaces the document content and renders the new state. */
  loadDocument(document: RichDocNode[]): void;
  /** Returns a clone of the current rich-document content. */
  getDocument(): RichDocNode[];
  /** Returns the current plain-text view using one newline between paragraphs. */
  getText(): string;
  /** Requests focus for the host text-input adapter, preserving IME placement. */
  focus(): void;
  /** Renders the current editor state into the configured render context. */
  render(): void;
  /** Releases listeners, timers, adapter state, and DI-owned services for this editor instance. */
  destroy(): void;
}
