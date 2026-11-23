/**
 * Plugin lifecycle, runtime capabilities, state contributions, and extension registries.
 *
 * @packageDocumentation
 */

/**
 * @referenceChapter 0 registration Register behavior with its owner
 * @referenceBody
 * `Plugin` and `PluginSpec` describe an optional feature. During assembly, a plugin can register services, state,
 * commands, queries, observations, capabilities, and codecs. Registration establishes who owns a value and which
 * operation may change it. A feature that owns Sheet fill, for example, keeps its fill matrix and commands in its own
 * package while the assembly only connects it to an editor.
 *
 * **Use when:** adding optional built-in or third-party behavior. Choose the lowest layer that owns the behavior:
 * portable values in a domain package, feature state and commands in a plugin, platform conversion in a host adapter.
 * A plugin should not reach into another feature's state or duplicate its finite values.
 */

/**
 * @referenceChapter 1 lifecycle Registration, commit, and teardown
 * @referenceBody
 * The composition root runs explicit lifecycle phases. A state contribution is available before commands and
 * consumers that need it; successful commands publish committed changes to observers and renderers. Resources
 * acquired during registration must be released in reverse order when setup fails or the editor is destroyed.
 *
 * `PluginManager` coordinates registration. Runtime capabilities expose editor-owned services to the host without
 * exposing its dependency-injection container. Session adapters capture transient values across a Workbook Sheet
 * remount; document codecs and versioned OT contributions handle durable export and collaboration separately.
 */

/**
 * @guideChapter 7 plugins Plugins
 * @guideBody
 * Plugins carry editor features: each feature owns its state and behavior and contributes commands or other extension
 * points through a plugin. `sear-plugin-*` packages provide these contributions, and built-in and third-party plugins
 * participate in the same lifecycle and registration contracts. For example, `SheetCellFillPlugin` owns fill colors,
 * the command that changes them, and the visual reader that exposes them to rendering.
 *
 * ### Registration and ownership
 *
 * Registration follows explicit lifecycle phases. Plugins may contribute state, commands, queries, observations,
 * runtime services, session adapters, visual readers, and document-state codecs. The assembly
 * orders these contributions and releases acquired resources in reverse order on failure or teardown.
 *
 * State registration establishes ownership, and commands define mutations. Queries provide on-demand reads;
 * observations publish state and event streams; service tokens expose editor-local services and extension values.
 * Session adapters capture local remount state. Collaborative state owners also contribute versioned OT definitions
 * and a durable export codec.
 *
 * For example, `SheetCellFillPlugin` publishes its matrix as a field and registers its own mutation command:
 *
 * ```ts
 * registerState() {
 *   return {
 *     key: this.key,
 *     state: this.getState(),
 *     dataEngine: { dataView: [{
 *       viewKey: SheetDataFieldNamespace,
 *       fieldKey: SheetCellFillFieldKey,
 *       select: (state: SheetCellFillPluginState) => state.cellFills,
 *     }] },
 *   };
 * }
 *
 * registerCommands(commands: SheetCommandBus) {
 *   const plugin = this;
 *   registerSheetCellFillCommand(commands, {
 *     target: this.key,
 *     getRowCount: () => plugin.getState().cellFills.shape[0],
 *     getColumnCount: () => plugin.getState().cellFills.shape[1],
 *     readCellFill: (row, column) => plugin.getState().cellFills.getItem(row, column),
 *   });
 * }
 * ```
 *
 * Package placement follows dependency direction:
 *
 * - Domain packages define portable values and protocols.
 * - Plugin packages own optional stateful behavior.
 * - Host adapters implement platform-specific conversion.
 * - Assembly packages coordinate composition and lifecycle.
 *
 * Finite feature values have one canonical enum-like contract. Consumers import that definition instead of maintaining
 * independent value lists or literal unions.
 *
 * <h3 id="collaboration">History, collaboration, and export</h3>
 *
 * History records successful commits. Sheet history uses each transaction owner's registered OT definition to invert
 * its operations; Workbook history records structural transactions separately. Undo and redo update their stacks only
 * after inverse or replay operations succeed.
 *
 * For example, the cell-fill command records the previous fill alongside the new fill. `SheetHistoryPlugin` uses
 * `SheetCellFillPlugin`'s Matrix OT definition to produce the reverse operation for undo:
 *
 * ```ts
 * const forward = createUpdateCellOTOperation([1, 1], '#00a870', null);
 * const inverse = MatrixTransactionOT.invert([forward]);
 * // inverse[0].uc is { value: null, prev: '#00a870' }.
 * ```
 *
 * Collaborative transaction owners declare a stable identifier, versioned encode/decode/invert functions, and the
 * required pairwise transform relations. Editor plugins connect committed transactions to host transport. Revision
 * tracking and rebasing remain in the collaboration domain.
 *
 * `SheetCellFillPlugin` marks the same operation family as collaborative. It reuses the shared Matrix OT definition,
 * which provides versioned encoding, decoding, and inversion, and the Matrix relation for concurrent changes:
 *
 * ```ts
 * readonly transactionOT = {
 *   ownerId: 'sheet.cellFill',
 *   definition: MatrixTransactionOT,
 *   relations: [MatrixTransactionOTRelation],
 *   collaborative: true,
 * };
 * ```
 *
 * The relevant methods of the shared `MatrixTransactionOT` definition are:
 *
 * ```ts
 * export const MatrixTransactionOT = Object.freeze({
 *   id: 'sear.matrix',
 *   version: 1,
 *   isOperation: isMatrixOperation,
 *   encode: encodeOperations,
 *   decode(payload: unknown) {
 *     return decodeOperations(payload, isMatrixOperation, 'sear.matrix@1');
 *   },
 *   invert(operations: readonly MatrixOTOperation<unknown>[]) {
 *     return MatrixOT.invert([...operations]);
 *   },
 * });
 * ```
 *
 * The plugin supplies its owner identity and operation family; the shared definition reverses its Matrix OT changes.
 * The relation transforms concurrent Matrix OT operation lists before they are applied.
 *
 * Durable export uses owner-provided codecs registered by stateful plugins. Runtime snapshot commands capture state
 * for in-memory remounting; persisted files require explicit versioned codecs. Third-party plugins use the same export
 * registry as built-in plugins.
 *
 * For example, the cell-fill plugin captures its matrix and defines how exported fill data is serialized and restored:
 *
 * ```ts
 * static readonly documentState = {
 *   key: 'sheet.cellFills',
 *   capture: (state: SheetCellFillPluginState) => ({ cellFills: state.cellFills.clone() }),
 *   codec: {
 *     key: 'sheet.cellFills',
 *     serialize: (state: SheetCellFillPluginState) => serializeSparseMatrix(state.cellFills),
 *     deserialize: (payload: unknown, path: string) => ({
 *       cellFills: deserializeSparseMatrix<SheetCellFill | null, CellFillMatrix>(payload, CellFillMatrix, path),
 *     }),
 *   },
 * };
 * ```
 */

export { PluginKey } from './PluginKey';
export { SearToolbar } from './SearToolbar';
export { SearFormulaBar } from './SearFormulaBar';
export { HeadlessToolbar } from './HeadlessToolbar';
export { EditorLifecycleStack } from './EditorLifecycleStack';
export { EditorLifecycleError, EditorLifecycleErrorCode } from './EditorLifecycleError';
export {
  Plugin,
  type PluginDataEngineRegistrationOptions,
  type PluginDataViewFieldSelector,
  type PluginDataViewFieldRegistration,
  type PluginConfigRegistration,
  type PluginSpec,
  type PluginStateRegistration,
  type PluginDocumentStateCodec,
  type PluginDocumentStateContribution,
  type PluginTransactionHistoryAdapter,
  type PluginTransactionOTContribution,
} from './Plugin';
export { PluginManager, type RegisteredPluginDocumentStateContribution } from './PluginManager';
export {
  createPluginTransactionHistoryAdapter,
  type PluginTransactionHistoryOperations,
} from './TransactionHistoryAdapter';
export {
  hasPluginCommandRegistrar,
  hasPluginQueryRegistrar,
  hasPluginObservationRegistrar,
  hasPluginRuntimeCapabilityRegistrar,
  hasPluginSessionStateRegistrar,
  type PluginCommandExtension,
  type PluginCommandRegistrar,
  type PluginQueryRegistrar,
  type PluginExtension,
  type PluginObservationExtension,
  type PluginObservationRegistrar,
  type PluginRuntimeCapabilityExtension,
  type PluginRuntimeCapabilityRegistrar,
  type PluginSessionStateExtension,
  type PluginSessionStateRegistrar,
} from './PluginExtension';
export {
  RuntimeCapabilityRegistry,
  createRuntimeCapabilityReader,
  defineRuntimeCapability,
  type RuntimeCapability,
  type RuntimeCapabilityReader,
} from './RuntimeCapability';
export { RuntimeCapabilityError, RuntimeCapabilityErrorCode } from './RuntimeCapabilityError';
export {
  SessionStateRestorePhase,
  defineSessionState,
  readSessionState,
  type SessionStateAdapter,
  type SessionStateDefinition,
  type SessionStateSnapshot,
} from './SessionState';
export { SessionStateError, SessionStateErrorCode } from './SessionStateError';
export { SessionStateRegistry } from './SessionStateRegistry';
export { cloneSessionStateValue } from './cloneSessionStateValue';
export { SheetRangeMoveRegistry } from './SheetRangeMoveRegistry';
export {
  SheetRangeReorderRegistry,
  type SheetRangeReorderContext,
  type SheetRangeReorderPlan,
  type SheetRangeReorderContribution,
} from './SheetRangeReorderRegistry';
export { intersectSheetMoveRanges, subtractSheetMoveRange, translateSheetMoveRange } from './SheetMoveRangeGeometry';
export {
  createSheetRangeRuleMoveContribution,
  type SheetRangeRuleEntry,
  type SheetRangeRuleFragment,
  type SheetRangeRuleMoveAdapter,
} from './SheetRangeRuleMove';
export { SheetRangeMoveStatus, type SheetRangeMoveAnalysis } from './SheetRangeMoveAnalysis';
export { SheetRangeMoveRejectedError } from './SheetRangeMoveRejectedError';
export { SheetStructureMoveRegistry } from './SheetStructureMoveRegistry';
export { type SheetStructureMoveContext, type SheetStructureMoveContribution } from './SheetStructureMoveContribution';
export {
  isPointInSheetMoveRange,
  type SheetMoveRange,
  type SheetRangeMoveContext,
  type SheetRangeMovePlan,
  type SheetRangeMoveContribution,
} from './SheetRangeMoveContribution';

export { SheetFormatTransferRegistry } from './SheetFormatTransferRegistry';
export { SheetClipboardTransferRegistry } from './SheetClipboardTransferRegistry';
export type {
  SheetClipboardCapturedInstance, SheetClipboardTransferContribution, SheetClipboardTransferPlan,
  SheetClipboardTransferRegistrar, SheetClipboardTransferRequest, SheetPortableClipboardTransfer,
} from './SheetClipboardTransfer';
export { sealSheetContributionWrites, assertSheetContributionWrite } from './SheetContributionWriteBoundary';
export { createMatrixFormatTransfer, type SheetFormatMatrix } from './createMatrixFormatTransfer';
export {
  type SheetFormatRange,
  type SheetFormatTransferPlan,
  type SheetPortableFormatTransfer,
  type SheetFormatTransferSnapshot,
  type SheetFormatTransferContribution,
  type SheetFormatTransferRegistrar,
} from './SheetFormatTransfer';
