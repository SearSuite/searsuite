import { ViewExtensionBase } from '@searsuite/sear-render-event-engine';
import { SearCoreSheet } from '@searsuite/sear-assembly-core';
import { LocalActionCommand, SheetCommandBus, type SheetQueryRegistry } from '@searsuite/sear-assembly-commands';
import { runOutsideCommandExecution } from '@searsuite/sear-assembly-plugin';
import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { SearError } from '@searsuite/sear-foundation-error';
import { KeyboardRouter } from '@searsuite/sear-render-input';
import {
  PluginKey,
  SessionStateRegistry,
  SessionStateRestorePhase,
  defineSessionState,
} from '@searsuite/sear-assembly-plugin';
import { ConfigUnit } from '@searsuite/sear-assembly-config';
import { CellProperties } from '@searsuite/sear-render-registry';

import { ReadSheetZoomQuery, SetSheetZoomCommand, SheetZoomObservation } from './SheetZoomCommands';
import { Platform } from '@searsuite/sear-foundation-platform';
import { type ObservationRegistry } from '@searsuite/sear-foundation-subscription';

const key = new PluginKey('SheetZoom');
/** Stable session-state identity owned by SheetZoomView. */
export const SheetZoomSessionStateDefinition = defineSessionState<number>('sheet.zoom');

export const sheetZoomPluginConfig = {
  minScale: 0.5,
  maxScale: 2,
  step: 0.1,
};

/** Local-only Excel-style sheet view zoom. It never changes document data or OT state. */
@Injectable()
export class SheetZoomView extends ViewExtensionBase<SearCoreSheet, CellProperties> {
  readonly #platform: Platform | undefined;

  /** DI token for resolving SheetZoomView. */
  public static readonly symbol = Symbol.for('SheetZoomView');
  /** Stable plugin key for SheetZoomView. */
  public static readonly pluginKey = key;

  #scale = 1;
  #commands: SheetCommandBus | null;
  #core: SearCoreSheet | undefined;
  readonly #zoomListeners = new Set<(scale: number) => void>();

  /** Creates a SheetZoomView instance. */
  constructor(
    @Inject(KeyboardRouter.symbol) keyboardRouter: KeyboardRouter,
    @Inject(SheetCommandBus.symbol) commands?: SheetCommandBus,
    @Inject(Platform.symbol) platform?: Platform,
  ) {
    super(key);
    this.#platform = platform;
    this.#commands = commands ?? null;
    keyboardRouter.subscribe({
      onZoomIn: this.#handleZoomInKey.bind(this),
      onZoomOut: this.#handleZoomOutKey.bind(this),
      onZoomReset: this.#handleZoomResetKey.bind(this),
    });
    keyboardRouter.startListener();
  }

  #handleZoomInKey(): void {
    this.setScale(this.#scale + this.#getConfig().step);
  }

  #handleZoomOutKey(): void {
    this.setScale(this.#scale - this.#getConfig().step);
  }

  #handleZoomResetKey(): void {
    this.setScale(1);
  }

  /** Registers the commands. */
  public registerCommands(commands: SheetCommandBus): void {
    if (this.#commands && this.#commands !== commands) {
      throw new SearError('Sheet zoom commands are already bound to an editor.');
    }
    this.#commands = commands;
    const zoomPlugin = this;
    commands.register(SetSheetZoomCommand, function createSetSheetZoomCommand(scale) {
      return new LocalActionCommand(SetSheetZoomCommand.id, function applySheetZoomScale(): void {
        const core = zoomPlugin.#core;
        if (core) zoomPlugin.#applyScale(core, scale);
      });
    });
  }

  /** Exposes the current zoom without requiring a session-state capture. */
  public registerQueries(queries: SheetQueryRegistry): void {
    queries.register(ReadSheetZoomQuery, () => this.#scale);
  }

  public registerObservations(observations: ObservationRegistry): void {
    observations.register(SheetZoomObservation, {
      getSnapshot: () => this.#scale,
      subscribe: (listener) => {
        this.#zoomListeners.add(listener);
        return () => this.#zoomListeners.delete(listener);
      },
    });
  }

  /** Registers local view scale after Core initialization makes zoom effects available. */
  public registerSessionState(registry: SessionStateRegistry): void {
    this.registerOwnedSessionState(registry, () => {
      registry.register(SheetZoomSessionStateDefinition, {
        restorePhase: SessionStateRestorePhase.AfterInitialize,
        capture: this.getScale.bind(this),
        restore: (scale) => {
          SessionStateRegistry.prototype.assertRestorationOpen.call(registry);
          this.setScale(scale);
        },
      });
    });
  }
  /** @inheritdoc */
  public override registerConfig() {
    return [{ key: this.key, config: new ConfigUnit(sheetZoomPluginConfig) }];
  }
  /** Returns the plugin config. */
  public getConfig(): unknown {
    return this.#getConfig();
  }
  /** Binds command and session behavior independently of scene generation. */
  public initializeView(core: SearCoreSheet): void {
    if (this.#core && this.#core !== core) throw new SearError('Sheet zoom core is already bound to an editor.');
    this.#core = core;
  }

  /** Returns the scale. */
  public getScale(): number {
    return this.#scale;
  }

  /** Updates the scale. */
  public setScale(nextScale: number): void {
    const core = this.#core;
    if (!core) return;
    const commands = this.#commands;
    if (!commands) {
      this.#platform?.warn('SheetZoomView setScale skipped: SheetCommandBus is missing.');
      return;
    }
    commands.run(SetSheetZoomCommand, nextScale);
  }

  #applyScale(core: SearCoreSheet, nextScale: number): void {
    const { minScale, maxScale } = this.#getConfig();
    const scale = Math.round(Math.min(maxScale, Math.max(minScale, nextScale)) * 100) / 100;
    if (scale === this.#scale) return;

    const scrollManager = core.renderEngine.scrollManager;
    const [oldWidth, oldHeight] = scrollManager.getShape();
    const { x, y } = scrollManager.getState();
    // Keep the logical viewport centre stable while its dimensions change.
    const anchorX = x + oldWidth / 2;
    const anchorY = y + oldHeight / 2;
    const width = (oldWidth * this.#scale) / scale;
    const height = (oldHeight * this.#scale) / scale;

    this.#scale = scale;
    core.renderEngine.setViewScale(scale);
    scrollManager.resize(width, height);
    scrollManager.scrollTo(x === 0 ? 0 : anchorX - width / 2, y === 0 ? 0 : anchorY - height / 2);
    // Scale changes the visible cell range as well as canvas coordinates.
    // Rebuild visual nodes and hit colors before the next pointer event.
    core.refreshViewport();
    runOutsideCommandExecution(() => {
      for (const listener of this.#zoomListeners) {
        try {
          listener(scale);
        } catch (error) {
          this.#platform?.warn('Sheet zoom listener failed.', error);
        }
      }
    });
  }

  #getConfig(): typeof sheetZoomPluginConfig {
    const core = this.#core;
    if (!core) return sheetZoomPluginConfig;
    return (core.configEngine.getConfig<typeof sheetZoomPluginConfig>(this.key) ??
      sheetZoomPluginConfig) as typeof sheetZoomPluginConfig;
  }
}
