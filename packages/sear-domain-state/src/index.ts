/**
 * Typed data ownership, field projection, and state registry contracts.
 *
 * @packageDocumentation
 */

/**
 * @referenceChapter 0 ownership Know which state can change
 * @referenceBody
 * Sheet content, formatting, formulas, selection, and dimensions have separate owners. A feature registers the state
 * it owns and publishes typed reads or operations for that state. `SearState` and the domain contracts give the
 * runtime a way to compose those contributions without turning the base cell value into a universal feature object.
 *
 * **Document state** is durable editor or Workbook content. **Session state** is local state captured for remounting,
 * such as a viewport. **Derived state** is computed from other values, such as formula results or render projections.
 * **Host state** includes transport and product UI. A consumer should choose the corresponding query, observation,
 * or export contract rather than assuming every visible value is stored in the document.
 */

/**
 * @referenceChapter 1 projections Read a projection without taking ownership
 * @referenceBody
 * DataEngine fields and visual readers project owner state for consumers. The owner registers its field key and typed
 * reader; a renderer or host consumes that projection. A missing sparse entry means the current default applies, so
 * merely reading or painting a cell does not create persisted state.
 *
 * **Use when:** defining a new state-owning feature or reading its value in another layer. Mutate through the owning
 * feature's command, and use its projection for reads. Portable OT operations describe committed changes, while
 * export codecs describe durable file data; neither is inferred from a visual projection.
 */

/**
 * @guideChapter 4 state Domain
 * @guideBody
 * `sear-domain-*` defines structured document data, sparse matrices, operations, and protocols. These packages specify
 * state representations and change semantics independently of rendering, host adapters, and optional features.
 *
 * For example, this standalone Domain example changes D3 from 10 to 20, then reverses the change:
 *
 * ```ts
 * const cells = new CSRMatrix<number>(
 *   undefined, // Use the default empty sparse storage.
 *   [10, 10],  // Set the matrix size to 10 rows and 10 columns.
 * );
 * cells.addItem(2, 3, 10); // D3 initially contains 10.
 *
 * const operation = {
 *   p: [2, 3],
 *   uc: { prev: 10, value: 20 },
 * };
 *
 * MatrixOT.apply(cells, [operation]);
 * cells.getItem(2, 3); // 20
 *
 * MatrixOT.apply(cells, MatrixOT.invert([operation]));
 * cells.getItem(2, 3); // 10
 * ```
 *
 * The matrix stores D3's value, while the operation records its position and the values before and after the change.
 * This example describes data and change semantics without choosing a rendering backend or host platform.
 *
 * In a running editor, application code issues a command; the editor applies the corresponding Domain operation within
 * a transaction.
 *
 * ### State has one owner
 *
 * Independently evolving plugins retain separate state contracts. Changes to one plugin's schema or transactions do
 * not require corresponding changes to unrelated plugins. A shared schema for all plugin state would couple those
 * otherwise independent changes.
 *
 * A state-owning plugin registers its state and mutation commands. It may also contribute field projections, queries,
 * observations, visual readers, export codecs, or OT definitions. `DataEngine` manages registered data and projections;
 * collaboration and persistence require explicit owner contributions.
 *
 * **State and field projection**
 *
 * For example, `SheetCellMergePlugin` stores each merged range in its own sparse matrix. Only the range's top-left cell
 * stores its end-row and end-column coordinates. The plugin publishes this matrix as a named `DataEngine` field.
 *
 * ```ts
 * export interface SheetCellMerge {
 *   readonly endRow: number;
 *   readonly endColumn: number;
 * }
 *
 * registerState() {
 *   return {
 *     key: this.key,
 *     state: this.getState(),
 *     dataEngine: {
 *       dataView: [{
 *         viewKey: SheetDataFieldNamespace,
 *         fieldKey: SheetCellMergeFieldKey,
 *         select: (state: SheetCellMergePluginState) =>
 *           state.cellMerges,
 *       }],
 *     },
 *   };
 * }
 * ```
 *
 * **Commands and query**
 *
 * `MergeCellsCommand` and `UnmergeCellsCommand` change the plugin's matrix through transactions. Before merging,
 * `AnalyzeMergeCellsQuery` reports which existing cell contents would be retained or discarded.
 *
 * ```ts
 * export const MergeCellsCommand =
 *   defineSheetCommand<SheetMergeInput>('range.mergeCells');
 * export const UnmergeCellsCommand =
 *   defineSheetCommand<SheetRangeInput>('range.unmergeCells');
 * export const AnalyzeMergeCellsQuery = defineSheetQuery<
 *   SheetRangeInput,
 *   SheetMergeAnalysis | null
 * >('range.analyzeMergeCells');
 *
 * commands.register(MergeCellsCommand, (input) =>
 *   createSheetCellMergeCommand(
 *     MergeCellsCommand.id, 'merge', input, dataSource,
 *   ),
 * );
 * queries.register(AnalyzeMergeCellsQuery, (input) =>
 *   analyzeMergeCells(input, dataSource),
 * );
 * ```
 *
 * **Rendering and observations**
 *
 * `SheetCellMergeRender` reads the published merge field to determine each merged region's bounds. It obtains the
 * region's visual properties from the shared visual-reader registry. `SheetCellMergePlugin` does not register its own
 * visual reader or observation; the contributions listed above are optional.
 *
 * ```ts
 * const merges = readSheetCellMerges(dataEngine);
 *
 * merges.forEachStored((value, row, column) => {
 *   if (value === null) return;
 *   const visual = this.cellVisualReaders.readVisual({
 *     rowIndex: row,
 *     columnIndex: column,
 *   });
 * });
 * ```
 *
 * **Persistence**
 *
 * The plugin's document-state codec captures, serializes, and restores its merge matrix. Publishing the matrix through
 * `DataEngine` alone would not make it part of exported document state.
 *
 * ```ts
 * static readonly documentState = {
 *   key: 'sheet.cellMerges',
 *   capture: (state: SheetCellMergePluginState) => ({
 *     cellMerges: state.cellMerges.clone(),
 *   }),
 *   codec: {
 *     key: 'sheet.cellMerges',
 *     serialize: (state: SheetCellMergePluginState) =>
 *       serializeSparseMatrix(state.cellMerges),
 *     deserialize: (payload: unknown, path: string) => ({
 *       cellMerges: deserializeSparseMatrix<
 *         SheetCellMerge | null,
 *         CellMergeMatrix
 *       >(payload, CellMergeMatrix, path),
 *     }),
 *   },
 * };
 * ```
 *
 * **Collaboration and OT**
 *
 * The plugin separately declares the OT definition for its transactions and marks them as collaborative. Its
 * `apply()` method applies merge operations to its matrix and adjusts merged ranges when rows or columns change.
 *
 * ```ts
 * readonly transactionOT = {
 *   ownerId: 'sheet.cellMerge',
 *   definition: MatrixTransactionOT,
 *   relations: [MatrixTransactionOTRelation],
 *   collaborative: true,
 * };
 * ```
 *
 * Runtime data falls into four categories:
 *
 * - **Document state** contains editor or Workbook content eligible for export.
 *
 *   `SheetDocumentState` includes cell data and plugin-owned fields such as merged ranges. These are two of its fields:
 *
 *   ```ts
 *   interface SheetDocumentState {
 *     sheetData: SheetMatrix;
 *     cellMerges: CellMergeMatrix;
 *   }
 *   ```
 *
 * - **Session state** contains contributor-keyed local values retained across editor remounts.
 *
 *   A session snapshot can retain a Sheet's viewport position and zoom while switching between Sheets. These values
 *   are not exported as document content:
 *
 *   ```ts
 *   const sessionState: SheetSessionState = {
 *     'sheet.viewport': { x: 240, y: 120 },
 *     'sheet.zoom': 1.25,
 *   };
 *   ```
 *
 * - **Derived state** contains computed values, indexes, layout caches, and render projections.
 *
 *   `SheetCellFillPlugin` stores a cell's fill color in document state. Its visual reader produces the `fill` property
 *   that the renderer needs; that render property is read from the stored value rather than saved separately:
 *
 *   ```ts
 *   const plugin = this;
 *   registry.register({
 *     id: 'sheet.cell-fill',
 *     properties: ['fill'],
 *     read({ rowIndex, columnIndex }) {
 *       const fill = plugin.getState().cellFills.getItem(rowIndex, columnIndex);
 *       return fill == null ? {} : { fill };
 *     },
 *   });
 *   ```
 *
 * - **Host state** contains transport, credentials, dialogs, application UI, and product policy.
 *
 *   The application owns these concerns and supplies concrete adapters when it creates the editor:
 *
 *   ```ts
 *   adapters: {
 *     ...WebSheetAdapterDefaults,
 *     collabTransport: WebSocketTransport,
 *     toolbar: SearWebToolbar,
 *   }
 *   ```
 *
 * Sparse storage represents defaults by absence. A missing alignment or row size uses the current configuration;
 * rendering that default does not create a persisted entry.
 *
 * <h3 id="sheet">The Sheet model</h3>
 *
 * The base Sheet matrix stores cell content. Other plugins own independent state, including dimensions, formatting,
 * merged ranges, formulas, and selection. An assembly composes the selected owners in one editor-local runtime.
 * Structural commands coordinate their typed operations while ownership remains with each plugin.
 *
 * `CellTypeCatalog` associates each persisted cell type with its behavior, including commit strategies, display text,
 * render registrations, and clipboard codecs. The following excerpt from `BooleanCellTypeDefinition` shows how Boolean
 * input is committed, displayed, and rendered:
 *
 * ```ts
 * class BooleanCellTypeDefinition extends CellTypeDefinition {
 *   readonly type = CellType.Boolean;
 *
 *   override createCommitStrategies() {
 *     return [new BooleanCellCommitStrategy()];
 *   }
 *
 *   override createDisplayTextProvider() {
 *     return {
 *       cellType: this.type,
 *       getDisplayText: (cell) =>
 *         typeof cell.value === 'boolean'
 *           ? (cell.value ? 'TRUE' : 'FALSE')
 *           : '',
 *     };
 *   }
 *
 *   override createRenderer() {
 *     return defineCellRenderer(this.type, BooleanCell);
 *   }
 * }
 *
 * catalog.register(new BooleanCellTypeDefinition());
 * ```
 *
 * Registering the definition installs its contributions into the corresponding registries. Provider registries
 * expose formula source, calculated values, images, and links as separate projections.
 *
 * `SheetCellVisualReaderRegistry` combines visual properties supplied by feature owners for a particular cell. Each
 * reader declares the properties it provides; conflicting base-property registrations are rejected.
 *
 * For example, the fill plugin reads its stored color and contributes `fill`:
 *
 * ```ts
 * const plugin = this;
 * registry.register({
 *   id: 'sheet.cell-fill',
 *   properties: ['fill'],
 *   read({ rowIndex, columnIndex }) {
 *     const fill = plugin.getState().cellFills.getItem(rowIndex, columnIndex);
 *     return fill == null ? {} : { fill };
 *   },
 * });
 * ```
 *
 * Grid and merged-cell renderers call `readVisual()` to receive `fill` together with properties supplied by other
 * plugins, such as alignment:
 *
 * ```ts
 * const visual = cellVisualReaders.readVisual({
 *   rowIndex: row,
 *   columnIndex: column,
 * });
 * const properties = visual.properties;
 * ```
 *
 * ### Portable operations and protocols
 *
 * Matrix OT and Rect OT describe changes independently of a view. The collaboration domain manages revisions,
 * pending operations, acknowledgements, catch-up, ordering, and rebasing. Unknown operation families are rejected
 * explicitly.
 *
 * For example, the cell-fill command creates a Matrix OT operation with both the new and previous value. The previous
 * value lets the same operation family reverse the change:
 *
 * ```ts
 * const operation = createUpdateCellOTOperation([1, 1], '#00a870', null);
 * const inverse = MatrixOT.invert([operation]);
 * // Applying inverse restores the previous (empty) fill at B2.
 * ```
 */

export { SearState } from './SearState';
