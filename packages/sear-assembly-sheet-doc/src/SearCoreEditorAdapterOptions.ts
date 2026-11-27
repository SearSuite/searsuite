import type { SheetEmbeddedEditorPlugin, SheetEmbeddedEditorPluginImplementation } from '@searsuite/sear-assembly-doc';
import type {
  SheetEmbeddedEditorView,
  SheetEmbeddedEditorViewImplementation,
} from './embeddedView/SheetEmbeddedEditorView';
import type { RenderContext } from '@searsuite/sear-render-context';
import type { TextShaper } from '@searsuite/sear-render-metrics';

/** Configuration for the Doc instance embedded inside a Sheet cell. */
export interface EmbeddedDocConfig {
  /** Default font size used by the active embedded document editor. */
  readonly fontSize: number;
  /** Default font family and fallback list used by the active embedded document editor. */
  readonly fontFamily: string;
  /** Padding between the cell edge and embedded document text. */
  readonly padding: number;
}

/** Configuration for the Sheet-specific SearCore document adapter. */
export interface SearCoreEditorAdapterOptions {
  /** Configuration scoped to the Doc embedded inside a Sheet cell. */
  readonly embeddedDocConfig?: Partial<EmbeddedDocConfig>;
  /** Semantic Sheet editing policies. Defaults to clipboard and formula-reference policies. */
  readonly plugins?: readonly (SheetEmbeddedEditorPlugin | SheetEmbeddedEditorPluginImplementation)[];
  /** Adapter presentation contributions; an empty list installs no default geometry or overflow views. */
  readonly viewExtensions?: readonly (SheetEmbeddedEditorView | SheetEmbeddedEditorViewImplementation)[];
  /** Host text shaper; defaults to the portable render-context measurement adapter. */
  readonly createTextShaper?: (renderContext: RenderContext) => TextShaper;
}
