import type {
  SheetEmbeddedEditorPlugin,
  SheetEmbeddedEditorPluginImplementation,
} from './adapterPlugin/embeddedEditor/SheetEmbeddedEditorPlugin';
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
  /** Optional Sheet-only plugins. Defaults to the built-in adapter plugins. */
  readonly plugins?: readonly (SheetEmbeddedEditorPlugin | SheetEmbeddedEditorPluginImplementation)[];
  /** Host text shaper; defaults to the portable render-context measurement adapter. */
  readonly createTextShaper?: (renderContext: RenderContext) => TextShaper;
}
