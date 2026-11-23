/** Plugin capability for registering typed commands against one host command bus. */
export interface PluginCommandExtension<CommandBus> {
  /** Registers every stable command id owned by this plugin. */
  registerCommands?(commands: CommandBus): void;
}

/** Plugin capability for registering typed, side-effect-free queries. */
export interface PluginQueryExtension<QueryRegistry> {
  registerQueries?(queries: QueryRegistry): void;
}

/** Plugin capability for registering typed observations against one host observation registry. */
export interface PluginObservationExtension<ObservationRegistry> {
  /** Registers every typed state and event observation source owned by this plugin. */
  registerObservations?(observations: ObservationRegistry): void;
}

/** Plugin capability for registering editor-local session capture and restore behavior. */
export interface PluginSessionStateExtension<SessionStateRegistry> {
  /** Registers every local session value owned by this plugin. */
  registerSessionState?(registry: SessionStateRegistry): void;
}

/** Plugin capability for publishing typed editor-owned services to plugins and hosts. */
export interface PluginRuntimeCapabilityExtension<RuntimeCapabilityRegistry> {
  /** Registers every runtime capability owned by this plugin. */
  registerCapabilities?(registry: RuntimeCapabilityRegistry): void;
}

/** Minimal host-extension contract shared by Sheet, Doc, and Workbook plugin types. */
export type PluginExtension<
  CommandBus,
  ObservationRegistry = never,
  SessionStateRegistry = never,
  RuntimeCapabilityRegistry = never,
  QueryRegistry = never,
> = PluginCommandExtension<CommandBus> &
  ([QueryRegistry] extends [never] ? object : PluginQueryExtension<QueryRegistry>) &
  ([ObservationRegistry] extends [never] ? object : PluginObservationExtension<ObservationRegistry>) &
  ([SessionStateRegistry] extends [never] ? object : PluginSessionStateExtension<SessionStateRegistry>) &
  ([RuntimeCapabilityRegistry] extends [never] ? object : PluginRuntimeCapabilityExtension<RuntimeCapabilityRegistry>);

/** Required-method view used by host assemblies when invoking command registration. */
export interface PluginCommandRegistrar<CommandBus> {
  /** Registers every stable command id owned by this plugin. */
  registerCommands(commands: CommandBus): void;
}

export interface PluginQueryRegistrar<QueryRegistry> {
  registerQueries(queries: QueryRegistry): void;
}

/** Required-method view used by host assemblies when invoking observation registration. */
export interface PluginObservationRegistrar<ObservationRegistry> {
  /** Registers every typed state and event observation source owned by this plugin. */
  registerObservations(observations: ObservationRegistry): void;
}

/** Required-method view used by host assemblies when invoking session-state registration. */
export interface PluginSessionStateRegistrar<SessionStateRegistry> {
  /** Registers every local session value owned by this plugin. */
  registerSessionState(registry: SessionStateRegistry): void;
}

/** Required-method view used by host assemblies when invoking capability registration. */
export interface PluginRuntimeCapabilityRegistrar<RuntimeCapabilityRegistry> {
  registerCapabilities(registry: RuntimeCapabilityRegistry): void;
}

/** Returns whether a plugin contributes command registration for the current host. */
export function hasPluginCommandRegistrar<CommandBus>(plugin: unknown): plugin is PluginCommandRegistrar<CommandBus> {
  return typeof (plugin as { registerCommands?: unknown }).registerCommands === 'function';
}

export function hasPluginQueryRegistrar<QueryRegistry>(plugin: unknown): plugin is PluginQueryRegistrar<QueryRegistry> {
  return typeof (plugin as { registerQueries?: unknown }).registerQueries === 'function';
}

/** Returns whether a plugin contributes observation registration for the current host. */
export function hasPluginObservationRegistrar<ObservationRegistry>(
  plugin: unknown,
): plugin is PluginObservationRegistrar<ObservationRegistry> {
  return typeof (plugin as { registerObservations?: unknown }).registerObservations === 'function';
}

/** Returns whether a plugin contributes local session-state registration for the current host. */
export function hasPluginSessionStateRegistrar<SessionStateRegistry>(
  plugin: unknown,
): plugin is PluginSessionStateRegistrar<SessionStateRegistry> {
  return typeof (plugin as { registerSessionState?: unknown }).registerSessionState === 'function';
}

/** Returns whether a plugin publishes runtime capabilities for the current editor. */
export function hasPluginRuntimeCapabilityRegistrar<RuntimeCapabilityRegistry>(
  plugin: unknown,
): plugin is PluginRuntimeCapabilityRegistrar<RuntimeCapabilityRegistry> {
  return typeof (plugin as { registerCapabilities?: unknown }).registerCapabilities === 'function';
}
