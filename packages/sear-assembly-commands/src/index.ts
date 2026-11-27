/**
 * Run Sheet and Doc commands and build the transactions they commit.
 *
 * @packageDocumentation
 */

/**
 * @referenceChapter 0 mutation-path Commands are the mutation boundary
 * @referenceBody
 * A host or input handler requests a change by running a feature-owned command. The command definition identifies
 * the operation; the registered handler builds the state owner's operations. The Sheet core stages those operations
 * and commits them as one change. Rendering and observers then see the committed result rather than a partial step.
 *
 * `SheetCommandDispatcher` and `DocCommandBus` are dispatch contracts, not alternate state stores. Use the typed
 * command exported by the feature that owns the behavior. For selection, `SelectRangeCommand` changes the selected
 * range and `GetSelection` reads it afterward.
 *
 * **Use when:** changing editor state from application code or wiring a host event. Read-only questions belong to a
 * query; ongoing notifications belong to observations. Neither should mutate committed state.
 */

/**
 * @referenceChapter 1 transaction-flow What happens after a command runs
 * @referenceBody
 * A command can stage several owner-specific operations in one pipeline. If preparation or staging fails, the
 * transaction does not publish a partial document. Successful commits advance history and collaboration through the
 * owning feature's adapters; local interaction and render updates follow the commit boundary.
 *
 * Command definitions, transaction factories, and handlers work together: definitions provide typed inputs and
 * results, handlers decide which operations to make, and state owners define how those operations change their own
 * data. This is why an optional plugin can add a command without expanding a central command switch.
 */

/**
 * @guideChapter 2 data-flow Design principles
 * @guideBody
 * Document state has explicit owners. Assemblies connect selected plugins and host adapters through contracts, while
 * the core editor remains independent of individual optional features.
 *
 * ### One mutation path
 *
 * A typed command is a request to change editor state with a defined input contract. Each feature owns its command
 * definition, which gives the command a stable identifier and specifies the types of its input and result. Application
 * code and input handlers run these commands through `editor.commands.run(...)`.
 *
 * For example, to select cell D3 (zero-based coordinates `[2, 3]`) and then read the selection:
 *
 * ```ts
 * import { GetSelection, SelectRangeCommand } from '@searsuite/sear-plugin-selection';
 *
 * editor.commands.run(SelectRangeCommand, { anchor: [2, 3], focus: [2, 3] });
 * const selection = editor.queries.run(GetSelection, undefined);
 * ```
 *
 * `SelectRangeCommand` requires an anchor and a focus. `SheetSelectionPlugin` handles the command and prepares the
 * selection change. The Sheet kernel commits the prepared operations together; rendering and observations then receive
 * the committed result. `GetSelection` reads the current selection through a separate query.
 *
 * ### One owner per state
 *
 * Every independently stateful plugin defines its state and the operations that change it. The runtime coordinates
 * commits across owners without requiring a shared schema for all plugin state. The same ownership contract applies
 * to built-in and third-party plugins.
 *
 * ### Adapt through contracts
 *
 * SearSuite is designed for cross-platform implementations by separating editor behavior from platform-specific
 * services. In the current TypeScript implementation, reusable packages depend on platform-neutral interfaces, and
 * assemblies connect concrete host adapters when an editor is created. The visual editor currently runs in Web browsers,
 * while the headless assembly runs on Node.js. A cross-platform Rust implementation is under development and will
 * require adapters for each target platform.
 *
 * ### Queries, observations, and services
 *
 * The editor facade separates current-state reads, subscriptions, and service lookup. These contracts prevent hosts and
 * plugins from depending on another owner's storage, event source, or service construction:
 *
 * - **Queries** read the editor's current state synchronously without changing it. After selecting D3,
 *   `editor.queries.run(GetSelection, undefined)` returns a snapshot of the selected range. If the selection later
 *   moves to E4, that earlier result still describes D3; run the query again to get the new selection. Some queries
 *   return a read-only reader instead of a snapshot. For example, `ReadSheetCellFormatQuery` returns a reader whose
 *   `getItem(2, 3)` method reads D3's current cell format each time it is called. Queries do not notify callers when
 *   state changes; use observations for updates.
 * - **Observations** let application code receive changes without repeatedly querying the editor. Each observation
 *   defines the type of value its listener receives. For example, when subscribing to `SheetZoomObservation`, the
 *   listener receives a `number` representing the zoom level. Because this is a state observation, it receives the
 *   current zoom level immediately and then receives later changes. An event observation, such as
 *   `DataValidationWarningObservation`, delivers only warnings emitted after subscription; it has no current value
 *   to send immediately. `subscribe()` returns a function that stops the subscription. State observations also
 *   provide `getSnapshot()` to read the current value without subscribing.
 * - **Services** provide access to editor-local services and extension values through typed tokens. Optional services
 *   can be shared without extending the editor facade or exposing its DI container. The facade provides a read-only lookup:
 *   `get` returns `undefined` for an absent capability, while `require` throws. Returned values follow their own
 *   contracts and may expose operations.
 *
 * ```ts
 * await editor.commands.run(commandDefinition, commandInput);
 * const result = editor.queries.run(queryDefinition, queryInput);
 * const dispose = editor.observations.subscribe(observationDefinition, listener);
 * const service = editor.services.get(serviceDefinition);
 * ```
 */

export {
  SheetCommandDispatcher,
  type SheetCommand,
  type SheetCommandContext,
  type SheetCommandResult,
} from './SheetCommand';
export {
  DocCommandBus,
  DocCommandDispatcher,
  type DocCommandContext,
  type DocCommandEffect,
  type DocCommandEvent,
  type DocCommandFactory,
  type DocCommandListener,
  type DocCommandResult,
  type DocEditorCommand,
} from './DocEditorCommand';
export {
  defineDocCommand,
  type DocCommandDefinition,
  type DocCommandDefinitionResult,
  type DocCommandInput,
} from './DocCommandDefinition';
export {
  SheetCommandBus,
  type SheetCommandEvent,
  type SheetCommandListener,
  type SheetCommandFactory,
} from './SheetCommandBus';
export { SheetQueryRegistry, SheetQueryBus, type SheetQueryHandler } from './SheetQueryRegistry';
export {
  defineSheetQuery,
  defineSheetReaderQuery,
  type SheetQueryDefinition,
  type SheetQueryInput,
  type SheetQueryResult,
} from './SheetQueryDefinition';
export {
  defineSheetCommand,
  type SheetCommandDefinition,
  type SheetCommandDefinitionResult,
  type SheetCommandInput,
} from './SheetCommandDefinition';
export {
  TransactionPipelineCommand,
  PipelineExecutionCommand,
  LocalActionCommand,
  EffectCommand,
  createSheetTransaction,
} from './TransactionCommand';
export {
  ClearRangeContentsCommand,
  InsertRowCommand,
  MoveRowsCommand,
  MoveColumnsCommand,
  createMoveRowsOperations,
  createMoveColumnsOperations,
  type SheetMoveAxisInput,
  DeleteRowCommand,
  InsertColumnCommand,
  DeleteColumnCommand,
  registerSheetRangeCommands,
  createClearRangeContentsOperations,
  type SheetCellPoint,
  type SheetRangeBounds,
  type SheetRangeInput,
  type SheetClearRangeContentsInput,
  type SheetClearRangeContentsCommandDataSource,
  type SheetRangeCommandDataSource,
  registerSheetStructureCommands,
  createInsertRowOperations,
  createInsertColumnOperations,
  createDeleteRowOperations,
  createDeleteColumnOperations,
  type SheetInsertRowsInput,
  type SheetInsertColumnsInput,
  type SheetDeleteRowsInput,
  type SheetDeleteColumnsInput,
  type SheetStructureCommandDataSource,
} from './SheetOperationCommands';
export {
  moveSelection,
  SelectionMoveDirection,
  type MoveSelectionCommandInput,
  type MoveSelectionCommandResult,
} from './selection/MoveSelectionCommand';
export {
  selectRange,
  type SelectRangeCommandInput,
  type SelectRangeCommandResult,
} from './selection/SelectRangeCommand';
export { extendSelection, type ExtendSelectionCommandInput } from './selection/ExtendSelectionCommand';
export { CommandExecutionPhase } from '@searsuite/sear-foundation-common';
export { SheetAxisMoveBoundsError } from './sheetOperationCommands/SheetAxisMoveBoundsError';

export * from './SheetPluginContracts';
export * from './SheetRuntimeExtensionRegistry';

export * from './SheetStyleQueries';
export { registerSheetPluginCellStyles, type SheetCellStyleRegistrar } from './SheetCellStyleRegistrar';

export { SheetCommandEffectRegistry } from './SheetCommandEffectRegistry';

export * from './SheetDisplayedValueCommands';

export * from './SheetCommandClient';

export { type SheetEditor } from './SheetEditor';
