import { ConfigEngine } from '@searsuite/sear-assembly-config';
import { DocCommandBus } from '@searsuite/sear-assembly-commands';
import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { SearError } from '@searsuite/sear-foundation-error';
import { Platform } from '@searsuite/sear-foundation-platform';
import { RenderContext } from '@searsuite/sear-render-context';
import { DocRenderEngine } from '@searsuite/sear-render-engine';
import { ScrollManager } from '@searsuite/sear-render-scroll';

import { type DocEditorContentRect, type DocEditorViewport } from './createDocEditor';
import {
  type DocEditorRuntimeConfiguration,
  DocEditorRuntimeConfigurationSymbol,
} from './DocEditorRuntimeConfiguration';
import { DocEditorLifecycleState } from './DocEditorLifecycleState';
import { ResizeDocViewportCommand } from './DocViewportCommands';

/** Owns standalone document root geometry, viewport state, and host resize observation. */
@Injectable()
export class DocViewportEnvironment {
  readonly #configuration: DocEditorRuntimeConfiguration;
  readonly #configEngine: ConfigEngine;
  readonly #platform: Platform;
  readonly #renderContext: RenderContext;
  readonly #renderEngine: DocRenderEngine;
  readonly #scrollManager: ScrollManager;
  readonly #lifecycle: DocEditorLifecycleState;

  /** DI token for resolving the document viewport environment. */
  public static readonly symbol = Symbol.for('DocViewportEnvironment');

  #currentViewport: DocEditorViewport;
  #currentContentRect: DocEditorContentRect;
  #disposeResize: (() => void) | null = null;
  readonly #commands: DocCommandBus;
  #teardownToken: object | undefined;
  #destroyed = false;

  /** Reserves viewport cleanup and scroll disconnection for the editor owner. */
  public enforceTeardownBoundary(ownerToken: object): void {
    if (this.#teardownToken) throw new SearError('Doc viewport teardown boundary is already installed.');
    this.#teardownToken = ownerToken;
    this.#scrollManager.enforceTeardownBoundary(ownerToken);
  }

  /** Creates a viewport environment for one document editor instance. */
  public constructor(
    @Inject(DocEditorRuntimeConfigurationSymbol)
    configuration: DocEditorRuntimeConfiguration,
    @Inject(ConfigEngine.symbol)
    configEngine: ConfigEngine,
    @Inject(Platform.symbol)
    platform: Platform,
    @Inject(RenderContext.symbol)
    renderContext: RenderContext,
    @Inject(DocRenderEngine.symbol)
    renderEngine: DocRenderEngine,
    @Inject(ScrollManager.symbol)
    scrollManager: ScrollManager,
    @Inject(DocCommandBus.symbol)
    commands: DocCommandBus,
    @Inject(DocEditorLifecycleState.symbol)
    lifecycle: DocEditorLifecycleState,
  ) {
    this.#configuration = configuration;
    this.#configEngine = configEngine;
    this.#platform = platform;
    this.#renderContext = renderContext;
    this.#renderEngine = renderEngine;
    this.#scrollManager = scrollManager;
    this.#lifecycle = lifecycle;
    this.#commands = commands;
    this.#currentViewport = { ...configuration.initialViewport };
    this.#currentContentRect = { ...configuration.resolveContentRect(this.#currentViewport) };
  }

  /** Starts observing root resize changes. */
  public start(): void {
    if (this.#destroyed) throw new SearError('Doc viewport environment has been destroyed.');
    if (this.#disposeResize) return;
    this.#disposeResize = this.#platform.observeResize(this.getRoot(), this.#handleResize.bind(this));
  }

  /** Stops observing root resize changes and disconnects scroll publishers. */
  public destroy(ownerToken?: object): void {
    if (this.#destroyed) return;
    if (this.#teardownToken && ownerToken !== this.#teardownToken) {
      throw new SearError('Doc viewport cleanup requires its editor owner.');
    }
    this.#destroyed = true;
    this.#disposeResize?.();
    this.#disposeResize = null;
    this.#scrollManager.destroy(ownerToken);
  }

  /** Returns the render root that receives pointer events. */
  public getRoot(): unknown {
    return this.#renderContext.getRoot();
  }

  /** Returns the current viewport model. */
  public getViewport(): DocEditorViewport {
    return { ...this.#currentViewport };
  }

  /** Returns the current editable content rectangle. */
  public getContentRect(): DocEditorContentRect {
    return { ...this.#currentContentRect };
  }

  /** Resolves render-root offset in host-view coordinates. */
  public readRootViewOffset(): { x: number; y: number } {
    return this.#platform.readViewOffset(this.getRoot());
  }

  /** Applies a command-owned viewport resize local action. */
  public applyViewportResize(size: DocEditorViewport): void {
    if (!this.#commands.isExecuting()) {
      throw new SearError('Doc viewport changes must run through editor.commands.run(...).');
    }
    this.#currentViewport = { width: size.width, height: size.height };
    this.#currentContentRect = { ...this.#configuration.resolveContentRect(this.#currentViewport) };
    this.#renderEngine.resize(
      this.#currentViewport.width,
      this.#currentViewport.height,
      this.#configEngine.getDefaultConfig().devicePixelRatio,
    );
    this.#scrollManager.resize(this.#currentViewport.width, this.#currentViewport.height);
  }

  #handleResize(size: DocEditorViewport): void {
    if (this.#lifecycle.isDestroyed()) return;
    this.#commands.run(ResizeDocViewportCommand, size);
  }
}
