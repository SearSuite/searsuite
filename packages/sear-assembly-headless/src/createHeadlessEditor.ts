import { type SheetEditor } from '@searsuite/sear-assembly-commands';
import {
  createSheetKernelEditor,
  type SheetKernelConfiguration,
  type SheetRuntimeAdapters,
} from '@searsuite/sear-assembly-sheet-kernel';
import {
  createWorkbookRuntime,
  type WorkbookEditor,
  type WorkbookRuntimeConfiguration,
} from '@searsuite/sear-assembly-workbook-kernel';
import {
  IFormulaDateSystemProvider,
  IFormulaIterationSettingsProvider,
  type FormulaDateSystem,
  type FormulaIterationSettings,
} from '@searsuite/sear-domain-formula-engine';
import { NodePlatform, NodeWebServiceClient } from '@searsuite/sear-node-adapters';
import { type CollabTransport } from '@searsuite/sear-plugin-collab';
import { createHeadlessFunctionRegistry } from './HeadlessFunctionRegistry';
import { NodeXmlDocumentParser } from './NodeXmlDocumentParser';
import { NodeXmlXPathEngine } from './NodeXmlXPathEngine';

/** Node-owned clock and calculation settings shared by Sheet and Workbook hosts. */
export interface HeadlessCalculationOptions {
  readonly currentDateTime?: () => number;
  readonly dateSystem?: FormulaDateSystem;
  readonly iteration?: FormulaIterationSettings;
}

/** Optional Node host capabilities; omitted collaboration installs no channel or transport. */
export interface HeadlessHostOptions extends HeadlessCalculationOptions {
  readonly collabTransport?: new (...args: never[]) => CollabTransport;
}

/** Business-only Sheet options with Node host services supplied by this assembly. */
export type HeadlessEditorOptions = Omit<SheetKernelConfiguration, 'adapters'> & HeadlessHostOptions;
/** Business-only Workbook options with Node host services supplied by this assembly. */
export type HeadlessWorkbookEditorOptions = Omit<WorkbookRuntimeConfiguration, 'adapters'> & HeadlessHostOptions;
/** The neutral Sheet business facade returned by the Node assembly. */
export type HeadlessEditor = SheetEditor;
/** The neutral Workbook business facade returned by the Node assembly. */
export type HeadlessWorkbookEditor = WorkbookEditor;

/** Creates a Sheet business kernel without allocating a scene, renderer or native input adapter. */
export function createHeadlessEditor(options: HeadlessEditorOptions): HeadlessEditor {
  const { currentDateTime, dateSystem, iteration, collabTransport, ...business } = options;
  return createSheetKernelEditor({
    ...business,
    adapters: createNodeRuntimeAdapters({
      ...(currentDateTime ? { currentDateTime } : {}),
      ...(dateSystem === undefined ? {} : { dateSystem }),
      ...(iteration ? { iteration } : {}),
      ...(collabTransport ? { collabTransport } : {}),
    }),
  });
}

/** Creates a Workbook whose mounted Sheets use business kernels directly. */
export function createHeadlessWorkbookEditor(options: HeadlessWorkbookEditorOptions): HeadlessWorkbookEditor {
  const { currentDateTime, dateSystem, iteration, collabTransport, ...business } = options;
  return createWorkbookRuntime({
    ...business,
    adapters: createNodeRuntimeAdapters({
      ...(currentDateTime ? { currentDateTime } : {}),
      ...(dateSystem === undefined ? {} : { dateSystem }),
      ...(iteration ? { iteration } : {}),
      ...(collabTransport ? { collabTransport } : {}),
    }),
  });
}

function createNodeRuntimeAdapters(options: HeadlessHostOptions): SheetRuntimeAdapters {
  class ClockedNodePlatform extends NodePlatform {
    public override currentDateTime(): number {
      return options.currentDateTime?.() ?? super.currentDateTime();
    }
  }
  return {
    platform: options.currentDateTime ? ClockedNodePlatform : NodePlatform,
    ...(options.collabTransport ? { collabTransport: options.collabTransport } : {}),
    createFunctionRegistry: createHeadlessFunctionRegistry,
    xmlDocumentParser: NodeXmlDocumentParser,
    xmlXPathEngine: NodeXmlXPathEngine,
    webServiceClient: NodeWebServiceClient,
    registerEnvironment(container) {
      if (options.dateSystem !== undefined)
        container.registerInstance(IFormulaDateSystemProvider.symbol, { getDateSystem: () => options.dateSystem });
      if (options.iteration !== undefined)
        container.registerInstance(IFormulaIterationSettingsProvider.symbol, { getSettings: () => options.iteration });
    },
  };
}
