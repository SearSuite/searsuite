import {
  createSheetEditor,
  type SheetEditor,
  type SheetEditorAdapters,
  type SheetEditorConfiguration,
} from '@searsuite/sear-assembly-setup';
import {
  createWorkbookEditor,
  type WorkbookEditor,
  type WorkbookEditorConfiguration,
} from '@searsuite/sear-assembly-workbook';
import { NodePlatform, NodeWebServiceClient } from '@searsuite/sear-node-adapters';
import {
  HeadlessHitRenderContext,
  HeadlessOffScreenRenderContext,
  HeadlessRenderContext,
} from '@searsuite/sear-render-context';
import { HeadlessScroller } from '@searsuite/sear-render-scroll';
import { RenderContextTextShaper } from '@searsuite/sear-render-metrics';
import { HeadlessEventRegistrar } from '@searsuite/sear-render-event-engine';
import { HeadlessKeyboardRouter, HeadlessPointerCapture, HeadlessTextInput } from '@searsuite/sear-render-input';
import { HeadlessCursorEngine } from '@searsuite/sear-render-cursor';
import { HeadlessCollabTransport } from '@searsuite/sear-plugin-collab';
import { HeadlessToolbar } from '@searsuite/sear-assembly-plugin';
import { NodeXmlDocumentParser } from './NodeXmlDocumentParser';
import { NodeXmlXPathEngine } from './NodeXmlXPathEngine';
import { createHeadlessFunctionRegistry } from './HeadlessFunctionRegistry';
import {
  IFormulaDateSystemProvider,
  IFormulaIterationSettingsProvider,
  type FormulaDateSystem,
  type FormulaIterationSettings,
} from '@searsuite/sear-domain-formula-engine';

/** Sheet editor options for hosts that do not provide platform adapters. */
export type HeadlessEditorOptions = Omit<SheetEditorConfiguration, 'adapters'> & {
  /** Optional host wall-clock source for volatile formulas. */
  currentDateTime?: () => number;
  dateSystem?: FormulaDateSystem;
  iteration?: FormulaIterationSettings;
};

/** Workbook editor options for hosts that do not provide platform adapters. */
export type HeadlessWorkbookEditorOptions = Omit<WorkbookEditorConfiguration, 'adapters'> & {
  /** Optional host wall-clock source for volatile formulas. */
  currentDateTime?: () => number;
  dateSystem?: FormulaDateSystem;
  iteration?: FormulaIterationSettings;
};

/** Public editor returned by the headless assembly helper. */
export type HeadlessEditor = SheetEditor;

/** Public workbook editor returned by the headless assembly helper. */
export type HeadlessWorkbookEditor = WorkbookEditor;

/**
 * Creates a sheet editor backed entirely by headless adapters.
 * @param options - Sheet editor configuration excluding adapter overrides.
 * @returns A sheet editor suitable for tests, servers, or non-UI hosts.
 */
export function createHeadlessEditor(options: HeadlessEditorOptions): HeadlessEditor;
export function createHeadlessEditor(options: HeadlessWorkbookEditorOptions): HeadlessWorkbookEditor;
export function createHeadlessEditor(
  options: HeadlessEditorOptions | HeadlessWorkbookEditorOptions,
): HeadlessEditor | HeadlessWorkbookEditor {
  const { currentDateTime, dateSystem, iteration, ...configuration } = options;
  const adapters = createHeadlessAdapters(currentDateTime, dateSystem, iteration);
  if ('documentState' in configuration) {
    return createWorkbookEditor({ ...configuration, adapters });
  }
  return createSheetEditor({ ...(configuration as Omit<SheetEditorConfiguration, 'adapters'>), adapters });
}

/**
 * Creates a workbook editor backed entirely by platform-neutral headless adapters.
 *
 * Use this assembly for server-side processing, deterministic tests, and hosts that
 * provide their own visual presentation. The returned editor exposes the same typed
 * command, observation, capability, document, and sheet facades as the visual assembly.
 *
 * @param options - Workbook configuration excluding platform adapter construction.
 * @returns An isolated workbook editor that owns its plugins and runtime services.
 */
export function createHeadlessWorkbookEditor(options: HeadlessWorkbookEditorOptions): HeadlessWorkbookEditor {
  const { currentDateTime, dateSystem, iteration, ...configuration } = options;
  return createWorkbookEditor({ ...configuration, adapters: createHeadlessAdapters(currentDateTime, dateSystem, iteration) });
}

function createHeadlessAdapters(
  currentDateTime?: () => number,
  dateSystem?: FormulaDateSystem,
  iteration?: FormulaIterationSettings,
): SheetEditorAdapters {
  class ClockedNodePlatform extends NodePlatform {
    public currentDateTime(): number {
      return currentDateTime?.() ?? super.currentDateTime();
    }
  }
  return {
    ...(dateSystem === undefined && iteration === undefined ? {} : {
      registerEnvironment(container) {
        if (dateSystem !== undefined) {
          container.registerInstance(IFormulaDateSystemProvider.symbol, { getDateSystem: () => dateSystem });
        }
        if (iteration !== undefined) {
          container.registerInstance(IFormulaIterationSettingsProvider.symbol, { getSettings: () => iteration });
        }
      },
    }),
    platform: currentDateTime ? ClockedNodePlatform : NodePlatform,
    createTextShaper: (renderContext) => new RenderContextTextShaper(renderContext),
    createFunctionRegistry: createHeadlessFunctionRegistry,
    xmlDocumentParser: NodeXmlDocumentParser,
    xmlXPathEngine: NodeXmlXPathEngine,
    webServiceClient: NodeWebServiceClient,
    createRenderContexts() {
      return {
        renderContext: new HeadlessRenderContext(),
        offScreenRenderContext: new HeadlessOffScreenRenderContext(),
        hitRenderContext: new HeadlessHitRenderContext(),
      };
    },
    scroller: HeadlessScroller,
    eventRegistrar: HeadlessEventRegistrar,
    textInput: HeadlessTextInput,
    keyboardRouter: HeadlessKeyboardRouter,
    pointerCapture: HeadlessPointerCapture,
    cursorEngine: HeadlessCursorEngine,
    collabTransport: HeadlessCollabTransport,
    toolbar: HeadlessToolbar,
  };
}
