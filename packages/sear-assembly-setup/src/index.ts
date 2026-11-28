/**
 * Public Sheet and Doc editor composition, lifecycle, commands, queries, and host-adapter wiring.
 *
 * @packageDocumentation
 */

/**
 * @referenceChapter 0 entry-points Choose an editor entry point
 * @referenceBody
 * `createSheetEditor()` assembles one visual Sheet editor from an initial document, selected plugins, and host-provided
 * platform, rendering, and input adapters. Use `createDocEditor()` for a standalone rich-text document. A Workbook
 * host uses `createWorkbookEditor()` when it needs stable Sheet identities and switching between Sheets.
 *
 * Import these entry points from their owning `@searsuite/sear-assembly-*` package. The assembly connects contracts;
 * it does not take ownership of a feature's document state. If no visual host is needed, `createHeadlessEditor()`
 * provides a smaller entry point for server work and tests.
 *
 * **Use when:** the application is ready to provide the adapters required by its chosen editor and to own the editor
 * lifecycle. Start with the headless assembly when rendering and input are unnecessary.
 */

/**
 * @referenceChapter 1 editor-lifecycle Follow state through the editor lifecycle
 * @referenceBody
 * `createEmptySheetDocumentState()` supplies a starting Sheet state. After creation, application actions and input
 * handlers run typed commands through `editor.commands`; state owners stage operations, and the editor commits them
 * together. Queries read the current state, observations report committed changes, and services expose editor-owned
 * adapters and extensions.
 *
 * A visual Sheet session also contains viewport and other local state. That session is separate from the durable
 * document. A Workbook captures the mounted Sheet's document and local session before switching Sheets. Call
 * `editor.destroy()` when the host unmounts the editor so adapters, listeners, and plugins release their resources.
 *
 * **Related concepts:** commands define the mutation path; plugins own feature state; the Workbook assembly owns
 * Sheet structure and switching.
 */

/**
 * @guideChapter 0 introduction Introduction
 * @guideBody
 * SearSuite provides composable infrastructure for spreadsheet editors. Its current implementation uses TypeScript.
 * The packages separate structured document models, transactional commands, rendering contracts, and optional
 * plugins. Host applications select plugins and supply the platform adapters required by their editor configuration.
 *
 * Sheet and Workbook content is represented as explicit document state. Each stateful plugin owns its contribution.
 * Commands provide the mutation boundary: the editor stages owner-defined operations and publishes committed results
 * to observers and rendering. Hosts can inspect or observe state through typed public contracts.
 *
 * Assemblies construct editor runtimes from selected packages. The current visual editor renders in Web browsers
 * through host-provided rendering and input adapters. The headless assembly runs on Node.js and does not require visual
 * adapters. The host remains responsible for application UI, persistence, credentials, and product policy.
 * State plugins remain independent of the optional view extensions.
 *
 * The Guide describes the package boundaries and runtime model. The [Reference Manual](/docs/ref/) documents public
 * types, functions, and commands.
 */

/**
 * @guideChapter 6 editors Assembly
 * @guideBody
 * `sear-assembly-*` composes Sheet and Workbook runtimes from document state, selected plugins, and host adapters.
 * Each assembly owns command dispatch, service wiring, and editor lifecycle. Plugin-owned state remains with its
 * contributor inside the isolated editor runtime.
 *
 * ### Editor facades
 *
 * `createSheetEditor()` assembles a single Sheet from document state, selected plugins, a viewport session, and
 * rendering and input adapters. Its facade exposes commands, queries, observations, and runtime services.
 *
 * `createSheetKernelEditor()` from `sear-assembly-sheet-kernel` composes the same business contracts without a scene
 * or native input adapters. The Headless assembly uses that independent runtime directly. Visual assembly adds
 * view extensions and subscribes to committed state; local painting does not create a document transaction.
 *
 * `createWorkbookEditor()` owns Workbook structure and mounts a Sheet editor for the active Sheet. Its facade exposes
 * commands, observations, and services. Structural reads use `document`; access to the mounted Sheet uses
 * `sheets`. Each editor facade provides `destroy()` for runtime teardown.
 *
 * ```ts
 * import {
 *   createSheetEditor, type SheetEditorAdapters,
 * } from './index';
 * import { createEmptySheetDocumentState } from '@searsuite/sear-assembly-sheet-state';
 * import { SelectRangeCommand } from '@searsuite/sear-plugin-selection';
 *
 * function openSheet(adapters: SheetEditorAdapters) {
 *   const editor = createSheetEditor({ adapters, sheetState: createEmptySheetDocumentState(20, 10) });
 *   editor.commands.run(SelectRangeCommand, { anchor: [0, 0], focus: [0, 0] });
 *   return editor;
 * }
 * ```
 *
 * The host retains the returned editor until its view is unmounted, then calls `destroy()`. The
 * Canvas demo in the sibling `searsuite-website/source/demo/canvas.ts` repository
 * provides a complete Web adapter configuration.
 *
 * <h3 id="workbooks">Workbook composition</h3>
 *
 * `WorkbookDocumentState` stores stable Sheet identities, names, order, visibility, and per-Sheet document state.
 * `WorkbookSessionState` stores the active Sheet identity, detached editor sessions, and local plugin values. Internal
 * references use stable `sheetId` values; display names can change independently.
 *
 * Only the active Sheet editor remains mounted after a switch. The Workbook first captures the current Sheet's document
 * and local session state. It then creates the destination Sheet editor from its saved state and destroys the previous
 * editor after the replacement succeeds. Returning to a Sheet restores its captured session, including viewport and
 * selection, without adding those local values to `WorkbookDocumentState`.
 *
 * For example, a host switches Sheets by stable identity and then reads the newly mounted Sheet editor:
 *
 * ```ts
 * workbook.commands.run(ActivateWorkbookSheetCommand, { sheetId: 'sheet-2' });
 * const activeSheet = workbook.sheets.getActiveEditor();
 * ```
 *
 * Workbook and Sheet plugins are configured separately. Workbook-owned services, including the formula-function
 * registry and Sheet-keyed collaboration channels, survive Sheet remounts. Structural operations use staged Workbook
 * transactions and history separate from content edits in the mounted Sheet.
 * A Workbook rename, for example, runs through `workbook.commands`, while a fill change runs through the active Sheet's
 * commands:
 *
 * ```ts
 * workbook.commands.run(RenameWorkbookSheetCommand, { sheetId: 'sheet-2', name: 'Results' });
 * activeSheet.commands.run(SetRangeCellFillCommand, {
 *   anchor: [0, 0], focus: [0, 0], fill: '#00a870',
 * });
 * ```
 */

/**
 * @guideChapter 8 host Host application
 * @guideBody
 * A host application selects the editor assembly and plugins, supplies concrete platform adapters, and owns the
 * surrounding interface and transport. Browser, headless, desktop, and other hosts can use the same domain and editor
 * contracts.
 *
 * A visual host provides a render context, text shaper, input and viewport adapters, and an implementation of
 * `Platform` for timers, events, and environment services. Dialogs, credentials, persistence, file downloads, and
 * collaboration transport remain host responsibilities. Reusable packages access them through abstract contracts.
 *
 * For example, the browser Canvas host supplies concrete implementations when creating the editor:
 *
 * ```ts
 * adapters: {
 *   ...WebSheetAdapterDefaults,
 *   platform: BrowserPlatform,
 *   createRenderContexts() {
 *     const renderContext = new WebCanvasRenderContext(canvas, false, new BrowserPlatform());
 *     return {
 *       renderContext,
 *       offScreenRenderContext: renderContext.cloneNode(),
 *       hitRenderContext: renderContext.createHitNode(),
 *     };
 *   },
 *   scroller: WebScroller,
 *   textInput: WebTextInput,
 *   keyboardRouter: WebKeyboardRouter,
 *   collabTransport: WebSocketTransport,
 * }
 * ```
 *
 * The [npm Workbook example](https://github.com/SearSuite/searsuite-browser/blob/main/examples/npm/src/workbook.ts) illustrates
 * host assembly with Web adapters. Headless assembly does not require visual host adapters.
 */

export { registerDefaultDependencies } from './registerDefaultDependencies';

export { PublishSheetDisplayedValueChangesCommand } from '@searsuite/sear-assembly-commands';
export {
  CaptureDocSessionStateCommand,
  DefaultDocFeaturePlugins,
  DocDocumentObservation,
  DocInlineStyleObservation,
  ExportDocStateCommand,
  UpdateDocDefaultConfigCommand,
  registerDefaultDocFeatures,
  registerDocConfigCommands,
  registerDocDocumentObservation,
  registerDocFeaturePlugins,
  registerDocInlineStyleObservation,
  registerDocSessionStateCommands,
  registerDocStateSnapshotCommands,
  type CaptureDocSessionStateCommandResult,
  type DocInlineStyleState,
  type DocInlineStyleStatus,
  type ExportDocStateCommandResult,
} from '@searsuite/sear-assembly-doc-kernel';
export {
  SessionStateError,
  SessionStateErrorCode,
  SessionStateRegistry,
  SessionStateRestorePhase,
  defineSessionState,
  readSessionState,
  type SessionStateAdapter,
  type SessionStateDefinition,
  type SessionStateSnapshot,
} from '@searsuite/sear-assembly-plugin';
export {
  RichTextBlockNode,
  RichTextRunNode,
  ViewportOverlayNode,
  createRichTextRunRect,
  type RichTextInlineStyle,
  type RichTextRenderLine,
  type RichTextRenderNodeProperties,
} from '@searsuite/sear-render-node';
export {
  createDocEditor,
  type DocDocumentState,
  type DocEditor,
  type DocEditorAdapters,
  type DocEditorChange,
  type DocEditorConfiguration,
  type DocEditorContentRect,
  type DocEditorViewport,
  type DocSessionState,
} from './doc/createDocEditor';
export { DocCaretState } from './doc/DocCaretState';
export { DocInputBindingRegistry } from './doc/DocInputBindingRegistry';
export {
  DocRenderLayoutService,
  type DocRenderLayout,
  type DocVirtualLayoutSummaryListener,
} from './doc/DocRenderLayoutService';
export {
  ApplyDocViewportScrollCommand,
  DocViewportObservation,
  DocViewportSessionStateDefinition,
  RenderDocViewportCommand,
  ResizeDocViewportCommand,
  ScrollDocViewportToCommand,
  registerDocViewportCommands,
  registerDocViewportState,
  type DocViewportScrollInput,
  type DocViewportSessionState,
} from './doc/DocViewportCommands';
export { type DocVirtualLayoutSummary } from './doc/DocVirtualLayoutStore';
export { registerDocBaseServices, type DocBaseServices } from './doc/registerDocBaseServices';
export { registerDocRuntime, type DocRuntime } from './doc/registerDocRuntime';
export { createSheetEditor, type SheetEditorAdapters, type SheetEditorConfiguration } from './sheet/createSheetEditor';
export {
  ApplyViewportScrollCommand,
  ResizeSheetViewportCommand,
  ScrollViewportToCommand,
  SheetViewportSessionStateDefinition,
  registerSheetViewportCommands,
  registerSheetViewportSessionState,
  type SheetScrollInput,
  type SheetScrollToInput,
  type SheetViewportSessionState,
} from './sheet/SheetViewportCommands';

export {
  SheetViewCapability,
  type SheetViewRuntime,
  type SheetViewRuntimeContext,
  type SheetViewSetupRuntime,
} from './sheet/SheetViewContracts';

export * from './doc/DocViewCapabilities';
export * from './doc/DocViewContracts';

export * from './doc/DefaultDocViews';

export {
  SheetView,
  type SheetViewImplementation,
  type SheetViewServiceContext,
  type SheetViewSetupContext,
} from './sheet/SheetViewContracts';

export * from './doc/DocViewCommands';
export * from './doc/DocViewKeys';
