import {
  createSheetKernelEditor,
  type SheetKernelConfiguration,
  type SheetRuntimeAdapters,
} from '@searsuite/sear-assembly-sheet-kernel';
import { type SheetEditor } from '@searsuite/sear-assembly-commands';
import {
  createWorkbookRuntime,
  type WorkbookEditor,
  type WorkbookRuntimeConfiguration,
} from '@searsuite/sear-assembly-workbook-kernel';
import { NodePlatform, NodeWebServiceClient } from '@searsuite/sear-node-adapters';
import {
  IFormulaDateSystemProvider,
  IFormulaIterationSettingsProvider,
  type FormulaDateSystem,
  type FormulaIterationSettings,
} from '@searsuite/sear-domain-formula-engine';
import { HeadlessCollabTransport } from '@searsuite/sear-plugin-collab';
import { NodeXmlDocumentParser } from './NodeXmlDocumentParser';
import { NodeXmlXPathEngine } from './NodeXmlXPathEngine';
import { createHeadlessFunctionRegistry } from './HeadlessFunctionRegistry';

/** Node-owned clock and calculation settings shared by Sheet and Workbook hosts. */
export interface HeadlessCalculationOptions {
  readonly currentDateTime?: () => number;
  readonly dateSystem?: FormulaDateSystem;
  readonly iteration?: FormulaIterationSettings;
}

/** Business-only Sheet options with Node host services supplied by this assembly. */
export type HeadlessEditorOptions = Omit<SheetKernelConfiguration, 'adapters'> & HeadlessCalculationOptions;
/** Business-only Workbook options with Node host services supplied by this assembly. */
export type HeadlessWorkbookEditorOptions = Omit<WorkbookRuntimeConfiguration, 'adapters'> & HeadlessCalculationOptions;
/** The neutral Sheet business facade returned by the Node assembly. */
export type HeadlessEditor = SheetEditor;
/** The neutral Workbook business facade returned by the Node assembly. */
export type HeadlessWorkbookEditor = WorkbookEditor;

/** Creates a Sheet business kernel without allocating a scene, renderer or native input adapter. */
export function createHeadlessEditor(options: HeadlessEditorOptions): HeadlessEditor {
  const { currentDateTime, dateSystem, iteration, ...business } = options;
  return createSheetKernelEditor({
    ...business,
    adapters: createNodeRuntimeAdapters({
      ...(currentDateTime ? { currentDateTime } : {}),
      ...(dateSystem === undefined ? {} : { dateSystem }),
      ...(iteration ? { iteration } : {}),
    }),
  });
}

/** Creates a Workbook whose mounted Sheets use business kernels directly. */
export function createHeadlessWorkbookEditor(options: HeadlessWorkbookEditorOptions): HeadlessWorkbookEditor {
  const { currentDateTime, dateSystem, iteration, ...business } = options;
  return createWorkbookRuntime({
    ...business,
    adapters: createNodeRuntimeAdapters({
      ...(currentDateTime ? { currentDateTime } : {}),
      ...(dateSystem === undefined ? {} : { dateSystem }),
      ...(iteration ? { iteration } : {}),
    }),
  });
}

function createNodeRuntimeAdapters(options: HeadlessCalculationOptions): SheetRuntimeAdapters {
  class ClockedNodePlatform extends NodePlatform {
    public override currentDateTime(): number {
      return options.currentDateTime?.() ?? super.currentDateTime();
    }
  }
  return {
    platform: options.currentDateTime ? ClockedNodePlatform : NodePlatform,
    collabTransport: HeadlessCollabTransport,
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
