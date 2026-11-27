import { DocInputPlugin } from '../input/DocInputPlugin';
import { DocCommandBus } from '@searsuite/sear-assembly-commands';

import {
  hasPluginCommandRegistrar,
  hasPluginObservationRegistrar,
  hasPluginRuntimeCapabilityRegistrar,
  hasPluginSessionStateRegistrar,
  Plugin,
  type PluginExtension,
  type PluginManager,
  type SessionStateRegistry,
} from '@searsuite/sear-assembly-plugin';
import {
  DocNodeRegistry,
  RichTextInlineStyleRegistry,
  RichTextLineBoxRegistry,
  RichTextBlockFlowRegistry,
  type RichTextInlineStyleContribution,
  type RichTextLineBoxContribution,
  type RichTextBlockFlowContribution,
} from '@searsuite/sear-domain-doc';
import { DocLayoutEngine } from '@searsuite/sear-domain-editor';
import { type Container } from '@searsuite/sear-foundation-di';
import { Platform } from '@searsuite/sear-foundation-platform';
import { type ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import { defineDocRuntimeCapability, DocRuntimeExtensionRegistry } from './DocRuntimeExtensionRegistry';

/** State and command capabilities available to document feature owners. */
export interface DocPluginRuntime {
  readonly extensions: DocRuntimeExtensionRegistry;
  readonly platform: Platform;
  readonly commands: DocCommandBus;
  readonly observations: ObservationRegistry;
  readonly session: SessionStateRegistry;
  readonly plugins: PluginManager;
  readonly document: {
    readonly input: DocInputPlugin;
    readonly nodes: DocNodeRegistry;
    readonly layout: DocLayoutEngine;
    readonly inlineStyles: RichTextInlineStyleRegistry;
    readonly lineBoxes: RichTextLineBoxRegistry;
    readonly blockFlows: RichTextBlockFlowRegistry;
  };
}
export const DocRuntimeCapability = {
  Platform: defineDocRuntimeCapability<Platform>('doc.runtime.platform'),
  Commands: defineDocRuntimeCapability<DocCommandBus>('doc.runtime.commands'),
  Observations: defineDocRuntimeCapability<ObservationRegistry>('doc.runtime.observations'),
  Session: defineDocRuntimeCapability<SessionStateRegistry>('doc.runtime.session'),
  Plugins: defineDocRuntimeCapability<PluginManager>('doc.runtime.plugins'),
  Document: defineDocRuntimeCapability<DocPluginRuntime['document']>('doc.runtime.document'),
  InlineStyles: defineDocRuntimeCapability<RichTextInlineStyleRegistry>('doc.runtime.inlineStyles'),
  LineBoxes: defineDocRuntimeCapability<RichTextLineBoxRegistry>('doc.runtime.lineBoxes'),
  BlockFlows: defineDocRuntimeCapability<RichTextBlockFlowRegistry>('doc.runtime.blockFlows'),
} as const;

/** Services available while createDocEditor() registers document plugins. */
export interface DocPluginServiceContext {
  /** DI container used by the document assembly root. */
  readonly container: Container;
}

/** Neutral services available while document plugins are configured. */
export interface DocPluginSetupContext {
  /** DI container used by the document assembly root. */
  readonly container: Container;
  /** Runtime services available to document plugins. */
  readonly runtime: DocPluginRuntime;
}

/** Initialized document capabilities with commands and subscriptions. */
export interface DocPluginRuntimeContext extends DocPluginSetupContext {}

/** Convenience base class for a Plugin targeting createDocEditor(). */
export abstract class DocPlugin<StateType>
  extends Plugin<StateType>
  implements PluginExtension<DocCommandBus, ObservationRegistry, SessionStateRegistry, DocRuntimeExtensionRegistry>
{
  /** Registers bindings required before this Doc plugin is instantiated. */
  public static registerServices?(context: DocPluginServiceContext): void;

  /** Registers every stable command id owned by this document plugin. */
  public registerCommands?(commands: DocCommandBus): void;

  /** Registers typed state and event observations owned by this document plugin. */
  public registerObservations?(observations: ObservationRegistry): void;

  /** Registers plugin-owned inline text style readers and mutation policies. */
  public registerInlineStyles?(registry: RichTextInlineStyleRegistry): void;

  /** Registers plugin-owned rich-text line box resolvers. */
  public registerLineBoxes?(registry: RichTextLineBoxRegistry): void;

  /** Registers plugin-owned top-level block flow resolvers. */
  public registerBlockFlows?(registry: RichTextBlockFlowRegistry): void;

  /** Registers local state that must survive an in-memory editor remount. */
  public registerSessionState?(registry: SessionStateRegistry): void;

  /** Publishes typed runtime services owned by this document plugin. */
  public registerCapabilities?(registry: DocRuntimeExtensionRegistry): void;

  /** Configures the document editor before runtime start. */
  public configure?(context: DocPluginSetupContext): void;

  /** Prepares behavior that requires initialized state before runtime effects. */
  public initialize?(context: DocPluginRuntimeContext): void;

  /** Starts lifecycle-owned behavior after document initialization. */
  public start?(context: DocPluginRuntimeContext): void;

  /** Releases subscriptions and resources owned by this plugin during teardown. */
  public onEditorDestroy?(context: DocPluginRuntimeContext): void;
}

/** Injectable DocPlugin class accepted by createDocEditor(). */
export interface DocPluginImplementation<TPlugin extends DocPlugin<unknown>> {
  new (...args: never[]): TPlugin;
  readonly symbol: symbol;
  registerServices?(context: DocPluginServiceContext): void;
}

/** Runs the register document plugin commands helper. */
export function registerDocPluginCommands(plugins: readonly unknown[], commands: DocCommandBus): () => void {
  const unregisterCommands: Array<() => void> = [];
  const registrarCommands = createDocCommandRegistrationRecorder(commands, unregisterCommands);
  try {
    plugins.forEach(function registerDocPluginCommand(plugin) {
      if (hasPluginCommandRegistrar<DocCommandBus>(plugin)) plugin.registerCommands(registrarCommands);
    });
  } catch (error) {
    unregisterRecordedDocCommands(unregisterCommands);
    throw error;
  }
  return function unregisterDocPluginCommands(): void {
    unregisterRecordedDocCommands(unregisterCommands);
  };
}

/** Registers every typed observation source contributed by document plugins. */
export function registerDocPluginObservations(plugins: readonly unknown[], observations: ObservationRegistry): void {
  plugins.forEach(function registerDocPluginObservation(plugin) {
    if (hasPluginObservationRegistrar<ObservationRegistry>(plugin)) plugin.registerObservations(observations);
  });
}

/** Registers every inline text-style contribution owned by document plugins. */
export function registerDocPluginInlineStyles(
  plugins: readonly unknown[],
  registry: RichTextInlineStyleRegistry,
): () => void {
  const unregisterContributions: Array<() => void> = [];
  const registrar = createDocInlineStyleRegistrationRecorder(registry, unregisterContributions);
  try {
    plugins.forEach(function registerDocPluginInlineStyle(plugin) {
      if (hasDocInlineStyleRegistrar(plugin)) plugin.registerInlineStyles(registrar);
    });
  } catch (error) {
    unregisterRecordedDocInlineStyles(unregisterContributions);
    throw error;
  }
  return function unregisterDocPluginInlineStyles(): void {
    unregisterRecordedDocInlineStyles(unregisterContributions);
  };
}

/** Registers every rich-text line box contribution owned by document plugins. */
export function registerDocPluginLineBoxes(plugins: readonly unknown[], registry: RichTextLineBoxRegistry): () => void {
  const unregisterContributions: Array<() => void> = [];
  const registrar = createDocLineBoxRegistrationRecorder(registry, unregisterContributions);
  try {
    plugins.forEach(function registerDocPluginLineBox(plugin) {
      if (hasDocLineBoxRegistrar(plugin)) plugin.registerLineBoxes(registrar);
    });
  } catch (error) {
    unregisterRecordedDocLineBoxes(unregisterContributions);
    throw error;
  }
  return function unregisterDocPluginLineBoxes(): void {
    unregisterRecordedDocLineBoxes(unregisterContributions);
  };
}

/** Registers every top-level block flow contribution owned by document plugins. */
export function registerDocPluginBlockFlows(
  plugins: readonly unknown[],
  registry: RichTextBlockFlowRegistry,
): () => void {
  const unregisterContributions: Array<() => void> = [];
  const registrar = createDocBlockFlowRegistrationRecorder(registry, unregisterContributions);
  try {
    plugins.forEach(function registerDocPluginBlockFlow(plugin) {
      if (hasDocBlockFlowRegistrar(plugin)) plugin.registerBlockFlows(registrar);
    });
  } catch (error) {
    unregisterRecordedDocBlockFlows(unregisterContributions);
    throw error;
  }
  return function unregisterDocPluginBlockFlows(): void {
    unregisterRecordedDocBlockFlows(unregisterContributions);
  };
}

/** Registers every local session-state adapter contributed by document plugins. */
export function registerDocPluginSessionStates(plugins: readonly unknown[], registry: SessionStateRegistry): void {
  plugins.forEach(function registerDocPluginSessionState(plugin) {
    if (hasPluginSessionStateRegistrar<SessionStateRegistry>(plugin)) plugin.registerSessionState(registry);
  });
}

/** Publishes every typed runtime capability contributed by document plugins. */
export function registerDocPluginCapabilities(
  plugins: readonly unknown[],
  registry: DocRuntimeExtensionRegistry,
): void {
  plugins.forEach(function registerDocPluginCapability(plugin) {
    if (hasPluginRuntimeCapabilityRegistrar<DocRuntimeExtensionRegistry>(plugin)) {
      plugin.registerCapabilities(registry);
    }
  });
}

interface DocInlineStyleRegistrar {
  registerInlineStyles(registry: RichTextInlineStyleRegistry): void;
}

function hasDocInlineStyleRegistrar(plugin: unknown): plugin is DocInlineStyleRegistrar {
  return typeof (plugin as { registerInlineStyles?: unknown }).registerInlineStyles === 'function';
}

interface DocLineBoxRegistrar {
  registerLineBoxes(registry: RichTextLineBoxRegistry): void;
}

interface DocBlockFlowRegistrar {
  registerBlockFlows(registry: RichTextBlockFlowRegistry): void;
}

function hasDocLineBoxRegistrar(plugin: unknown): plugin is DocLineBoxRegistrar {
  return typeof (plugin as { registerLineBoxes?: unknown }).registerLineBoxes === 'function';
}

function hasDocBlockFlowRegistrar(plugin: unknown): plugin is DocBlockFlowRegistrar {
  return typeof (plugin as { registerBlockFlows?: unknown }).registerBlockFlows === 'function';
}

function createDocInlineStyleRegistrationRecorder(
  registry: RichTextInlineStyleRegistry,
  unregisterContributions: Array<() => void>,
): RichTextInlineStyleRegistry {
  return createDocRegistryRegistrar(registry, (contribution: RichTextInlineStyleContribution) => {
    const unregister = registry.register(contribution);
    unregisterContributions.push(unregister);
    return unregister;
  });
}

function createDocLineBoxRegistrationRecorder(
  registry: RichTextLineBoxRegistry,
  unregisterContributions: Array<() => void>,
): RichTextLineBoxRegistry {
  return createDocRegistryRegistrar(registry, (contribution: RichTextLineBoxContribution) => {
    const unregister = registry.register(contribution);
    unregisterContributions.push(unregister);
    return unregister;
  });
}

function createDocBlockFlowRegistrationRecorder(
  registry: RichTextBlockFlowRegistry,
  unregisterContributions: Array<() => void>,
): RichTextBlockFlowRegistry {
  return createDocRegistryRegistrar(registry, (contribution: RichTextBlockFlowContribution) => {
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

function unregisterRecordedDocBlockFlows(unregisters: readonly (() => void)[]): void {
  for (let index = unregisters.length - 1; index >= 0; index--) unregisters[index]();
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

function unregisterRecordedDocCommands(unregisterCommands: Array<() => void>): void {
  for (let index = unregisterCommands.length - 1; index >= 0; index--) unregisterCommands[index]();
  unregisterCommands.length = 0;
}

function unregisterRecordedDocInlineStyles(unregisterContributions: Array<() => void>): void {
  for (let index = unregisterContributions.length - 1; index >= 0; index--) unregisterContributions[index]();
  unregisterContributions.length = 0;
}

function unregisterRecordedDocLineBoxes(unregisterContributions: Array<() => void>): void {
  for (let index = unregisterContributions.length - 1; index >= 0; index--) unregisterContributions[index]();
  unregisterContributions.length = 0;
}
