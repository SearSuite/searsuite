/**
 * Small dependency-free values and contracts shared across SearSuite packages.
 *
 * @packageDocumentation
 */

/**
 * @guideChapter 1 package-map Modules and their relationships
 * @guideBody
 * SearSuite separates portable contracts, editor composition, optional features, and host integration across these
 * package families:
 *
 * - `sear-foundation-*` defines dependency injection, platform, geometry, error, and shared utility contracts.
 * - `sear-domain-*` defines document data, sparse matrices, operations, and protocols independently of a host interface.
 * - `sear-render-*` defines scene, input, and drawing contracts for visual editors.
 * - `sear-assembly-*` constructs editor runtimes and coordinates plugins, commands, and lifecycle.
 * - `sear-plugin-*` contributes optional state, commands, and extension points.
 * - **Host application** selects an assembly and plugins, then supplies UI, platform adapters, and transport.
 *
 * <figure class="module-architecture">
 *   <div class="module-architecture-scroll">
 *     <svg viewBox="0 0 920 760" role="img" aria-labelledby="module-diagram-title module-diagram-description">
 *       <title id="module-diagram-title">How a SearSuite editor is composed</title>
 *       <desc id="module-diagram-description">The host configures assembly setup, selects feature plugins, and supplies rendering adapters. Assembly creates the editor, plugins register services, and rendering connects to it. The editor uses domain operations, which depend on foundation primitives.</desc>
 *       <defs><marker id="module-arrow" viewBox="0 0 10 10" markerWidth="8" markerHeight="8" refX="9" refY="5" orient="auto"><path d="M1 1 L9 5 L1 9 Z" /></marker></defs>
 *       <g class="module-architecture-links" marker-end="url(#module-arrow)">
 *         <path d="M385 92 L155 212" />
 *         <path d="M460 92 V212" />
 *         <path d="M535 92 L765 212" />
 *         <path d="M155 296 L385 390" />
 *         <path d="M460 296 V390" />
 *         <path d="M765 296 L535 390" />
 *         <path d="M460 474 V535" />
 *         <path d="M460 619 V675" />
 *       </g>
 *       <g class="module-architecture-labels">
 *         <text x="249" y="135">configures</text>
 *         <text x="460" y="153">selects</text>
 *         <text x="671" y="135">supplies adapters</text>
 *         <text x="244" y="359">creates</text>
 *         <text x="460" y="352">registers state, commands, queries</text>
 *         <text x="676" y="359">connects to</text>
 *         <text x="460" y="511">uses</text>
 *         <text x="460" y="653">depends on</text>
 *       </g>
 *       <g class="module-architecture-node module-architecture-host">
 *         <rect x="315" y="8" width="290" height="84" rx="6" />
 *         <text x="460" y="39" class="module-architecture-name">Host application</text>
 *         <text x="460" y="68" class="module-architecture-detail">UI · transport · platform adapters</text>
 *       </g>
 *       <g class="module-architecture-node module-architecture-assembly">
 *         <rect x="20" y="212" width="270" height="84" rx="6" />
 *         <text x="155" y="243" class="module-architecture-name">Assembly setup</text>
 *         <text x="155" y="272" class="module-architecture-detail">sear-assembly-*</text>
 *       </g>
 *       <g class="module-architecture-node module-architecture-plugin">
 *         <rect x="325" y="212" width="270" height="84" rx="6" />
 *         <text x="460" y="243" class="module-architecture-name">Feature plugins</text>
 *         <text x="460" y="272" class="module-architecture-detail">sear-plugin-*</text>
 *       </g>
 *       <g class="module-architecture-node module-architecture-render">
 *         <rect x="630" y="212" width="270" height="84" rx="6" />
 *         <text x="765" y="243" class="module-architecture-name">Rendering and input</text>
 *         <text x="765" y="272" class="module-architecture-detail">sear-render-*</text>
 *       </g>
 *       <g class="module-architecture-node module-architecture-editor">
 *         <rect x="315" y="390" width="290" height="84" rx="6" />
 *         <text x="460" y="421" class="module-architecture-name">Sheet / Workbook editor</text>
 *         <text x="460" y="450" class="module-architecture-detail">Runtime instance</text>
 *       </g>
 *       <g class="module-architecture-node module-architecture-domain">
 *         <rect x="245" y="535" width="430" height="84" rx="6" />
 *         <text x="460" y="566" class="module-architecture-name">Domain contracts and operations</text>
 *         <text x="460" y="595" class="module-architecture-detail">sear-domain-*</text>
 *       </g>
 *       <g class="module-architecture-node module-architecture-foundation">
 *         <rect x="315" y="675" width="290" height="84" rx="6" />
 *         <text x="460" y="706" class="module-architecture-name">Foundation primitives</text>
 *         <text x="460" y="735" class="module-architecture-detail">sear-foundation-*</text>
 *       </g>
 *     </svg>
 *   </div>
 *   <div class="module-architecture-mobile" aria-label="How a SearSuite editor is composed">
 *     <div class="module-architecture-mobile-node module-architecture-host"><strong>Host application</strong><span>UI · transport · platform adapters</span></div>
 *     <div class="module-architecture-mobile-branches">
 *       <div class="module-architecture-mobile-node module-architecture-assembly"><small>Configures ↓ · Creates ↓</small><strong>Assembly setup</strong><span>sear-assembly-*</span></div>
 *       <div class="module-architecture-mobile-node module-architecture-plugin"><small>Selects ↓ · Registers state, commands, queries ↓</small><strong>Feature plugins</strong><span>sear-plugin-*</span></div>
 *       <div class="module-architecture-mobile-node module-architecture-render"><small>Supplies adapters ↓ · Connects to ↓</small><strong>Rendering and input</strong><span>sear-render-*</span></div>
 *     </div>
 *     <div class="module-architecture-mobile-node module-architecture-editor"><strong>Sheet / Workbook editor</strong><span>Runtime instance</span></div>
 *     <div class="module-architecture-mobile-link">uses ↓</div>
 *     <div class="module-architecture-mobile-node module-architecture-domain"><strong>Domain contracts and operations</strong><span>sear-domain-*</span></div>
 *     <div class="module-architecture-mobile-link">depends on ↓</div>
 *     <div class="module-architecture-mobile-node module-architecture-foundation"><strong>Foundation primitives</strong><span>sear-foundation-*</span></div>
 *   </div>
 * </figure>
 */

/**
 * @guideChapter 3 foundation Foundation
 * @guideBody
 * Foundation packages provide small, reusable contracts and values shared by domain, rendering, assembly, and plugins.
 * They do not depend on a particular editor or host platform.
 *
 * `sear-foundation-di` gives each editor its own dependency container. For example, when two spreadsheets are open side
 * by side, each registers its own `RenderContext` (the drawing service). Rendering code resolves the instance belonging
 * to its editor.
 *
 * `sear-foundation-platform` defines the `Platform` interface for operations that depend on the host environment. For
 * example, when scrolling requires another render frame, the editor calls `platform.requestAnimationFrame(...)`.
 * The Browser package uses the browser's animation frame API, while the Server package's `NodePlatform` uses a timer.
 *
 * `sear-foundation-rect` defines points and rectangles in grid coordinates. For example, `new Rect([[2, 3], [4, 4]])`
 * describes D3:E5 using zero-based `[row, column]` coordinates. Selection and document operations can use this region
 * without depending on how the grid is drawn.
 *
 * Other foundation packages provide A1-style range parsing, observation contracts, error types, and shared utilities.
 * Assemblies connect the required contracts to concrete implementations when creating an editor.
 */

/**
 * Enumeration of built-in state names in the Sear framework.
 *
 * These state names are reserved and used internally by the Sear document editing system
 * to manage the core data structures and visual representations.
 *
 * State Types:
 * - CORE_STATE: The fundamental state managing document structure and content
 * - COLUMN_SHAPE_STATE: State tracking column dimensions and visual properties
 * - ROW_SHAPE_STATE: State tracking row dimensions and visual properties
 *
 * These are typically used as keys in the state management system to ensure
 * that core states don't conflict with user-defined or plugin-defined states.
 */
export enum BuildInStateName {
  /** Core state managing the fundamental document structure and content */
  CORE_STATE = 'CORE_STATE',

  /** State managing column dimensions and visual shape properties */
  COLUMN_SHAPE_STATE = 'COLUMN_SHAPE_STATE',

  /** State managing row dimensions and visual shape properties */
  ROW_SHAPE_STATE = 'ROW_SHAPE_STATE',
}

/**
 * Enumeration of supported document types in the Sear suite.
 *
 * The Sear suite is a comprehensive document editing and collaboration platform
 * that supports multiple document formats, each with specific features and use cases.
 *
 * Supported Types:
 * - UNKNOWN: Undefined or unrecognized document type
 * - SEAR_DOC: General-purpose text document (word processor)
 * - SEAR_SHEET: Spreadsheet with cells, formulas, and data analysis
 * - SEAR_TABLE: Structured table for tabular data presentation
 * - SEAR_SLIDE: Presentation slides for visual content delivery
 * - SEAR_MIND: Mind mapping document for brainstorming and organizing ideas
 * - SEAR_FLOW: Flowchart and diagram editor for process visualization
 */
export enum SearDocumentType {
  /** Unknown or unspecified document type */
  UNKNOWN,

  /** General document type (text processor) */
  SEAR_DOC,

  /** Spreadsheet document type with cell-based data */
  SEAR_SHEET,

  /** Table document type for structured tabular data */
  SEAR_TABLE,

  /** Slide presentation document type */
  SEAR_SLIDE,

  /** Mind map document type for hierarchical visualization */
  SEAR_MIND,

  /** Flowchart and diagram document type */
  SEAR_FLOW,
}

/**
 * Exports the SearKey class for generating unique identifiers.
 * @see {@link SearKey} for detailed documentation.
 */
export { SearKey } from './SearKey';

/**
 * Exports the console logging utility for displaying plugin name and version.
 * @see {@link printNameAndVersion} for detailed documentation.
 */
export { printNameAndVersion } from './printNameAndVersion';

/**
 * Exports the QuadTree data structure for efficient spatial indexing.
 * @see {@link QuadTree} for detailed documentation.
 */
export { QuadTree, QuadTreeNode } from './QuadTreeNode';

export { CommandExecutionPhase } from './CommandExecutionPhase';
