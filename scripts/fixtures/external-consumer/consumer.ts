import { createHeadlessEditor } from '@searsuite/sear-assembly-headless';
import { NodePlatform } from '@searsuite/sear-node-adapters';
import { ReadDropdownCellQuery, PickDropdownOptionCommand, DropdownMode } from '@searsuite/sear-plugin-dropdown';
import {
  InsertCheckboxesCommand,
  ToggleCheckboxesCommand,
  ReadCheckboxRangeQuery,
  CheckboxRemovalMode,
} from '@searsuite/sear-plugin-checkbox';
import {
  PluginKey,
  SessionStateRestorePhase,
  defineSessionState,
  type PluginTransactionOTContribution,
  type SessionStateRegistry,
} from '@searsuite/sear-assembly-plugin';
import {
  createDocEditor,
  createSheetEditor,
  SheetPlugin,
  type DocEditorConfiguration,
  type SheetEditorConfiguration,
} from '@searsuite/sear-assembly-setup';
import {
  ExportWorkbookStateCommand,
  WorkbookPlugin,
  createWorkbookEditor,
  defineWorkbookCommand,
  defineWorkbookRuntimeCapability,
  deserializeWorkbookDocumentState,
  serializeWorkbookDocumentState,
  type WorkbookCommandBus,
  type WorkbookEditorConfiguration,
  type WorkbookPluginContext,
  type WorkbookPluginImplementation,
  type WorkbookRuntimeExtensionRegistry,
} from '@searsuite/sear-assembly-workbook';
import { type CollaborationContributorRegistry } from '@searsuite/sear-domain-collaboration';
import {
  OTTransformPriority,
  type OTEncodedValue,
  type OTOperation,
  type OTTransformRelation,
  type TransactionOTDefinition,
} from '@searsuite/sear-domain-ot';
import { type Transaction } from '@searsuite/sear-domain-transaction';
import { Injectable } from '@searsuite/sear-foundation-di';
import { FormulaWebServiceDefinition, type EvalContext } from '@searsuite/sear-domain-formula-engine';
import { ENCODEURL, FILTERXML, WEBSERVICE, FormulaWebServiceCache } from '@searsuite/sear-domain-formula-engine-ts';
import { type CollaborationChannel } from '@searsuite/sear-plugin-collab';
import { DocumentStateCodecRegistry } from '@searsuite/sear-plugin-export';
import {
  SheetCellVisualReaderRegistry,
  type SheetCellVisualReaderRegistrationContext,
} from '@searsuite/sear-render-registry';
import {
  defineStateObservation,
  type ObservationRegistry,
  type StateObservationSource,
} from '@searsuite/sear-foundation-subscription';

const IncrementCommand = defineWorkbookCommand<void, number>('external.consumer.increment');
const CountObservation = defineStateObservation<number>('external.consumer.count');
const CountSessionState = defineSessionState<number>('external.consumer.count');
const CountCapability = defineWorkbookRuntimeCapability<{ getCount(): number }>('external.consumer.count');
const externalDocumentStateRegistry = new DocumentStateCodecRegistry<Record<string, unknown>>();
void externalDocumentStateRegistry;

/** Compiles the public Web formula/cache extension surface without workspace resolution. */
function registerExternalWebService(context: WorkbookPluginContext, evaluation: EvalContext): () => void {
  const cache = new FormulaWebServiceCache(async (url) => {
    const response = await context.runtime.formula.webService.request(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text;
  });
  evaluation.xmlXPath = context.runtime.formula.xmlXPath;
  const unregister = context.runtime.formula.externalServices.register(FormulaWebServiceDefinition, cache);
  for (const formula of [ENCODEURL, FILTERXML, WEBSERVICE]) void formula.descriptor;
  return () => {
    unregister();
    cache.destroy();
  };
}
void registerExternalWebService;

interface CounterOperation extends OTOperation {
  readonly delta: number;
}

const CounterTransactionOT: TransactionOTDefinition<CounterOperation> = {
  id: 'external.counter',
  version: 1,
  isOperation(operation): operation is CounterOperation {
    return typeof (operation as Partial<CounterOperation>).delta === 'number';
  },
  encode(operations): OTEncodedValue {
    return operations.map((operation) => ({ p: [...operation.p], delta: operation.delta }));
  },
  decode(payload): CounterOperation[] {
    if (!Array.isArray(payload) || !payload.every((value) => CounterTransactionOT.isOperation(value as OTOperation))) {
      throw new Error('Invalid external counter payload.');
    }
    return payload.map((operation) => ({ p: [...operation.p], delta: operation.delta }));
  },
  invert(operations): CounterOperation[] {
    return [...operations].reverse().map((operation) => ({ p: [...operation.p], delta: -operation.delta }));
  },
};

const CounterTransactionOTRelation: OTTransformRelation<CounterOperation, CounterOperation> = {
  left: CounterTransactionOT,
  right: CounterTransactionOT,
  transformPair(left, right, _priority: OTTransformPriority) {
    return { left: [...left], right: [...right] };
  },
};

@Injectable()
class ExternalCollaborativeSheetPlugin extends SheetPlugin<number> {
  public static readonly symbol = Symbol.for('ExternalCollaborativeSheetPlugin');
  public override readonly transactionOT = {
    ownerId: 'external.counter',
    definition: CounterTransactionOT,
    relations: [CounterTransactionOTRelation],
    collaborative: true,
  } satisfies PluginTransactionOTContribution<CounterOperation>;

  public constructor() {
    super({ key: new PluginKey('ExternalCollaborativeSheetPlugin'), state: 0 });
  }

  public apply(state: number, transaction: Transaction): number {
    return transaction.operations.reduce(
      (value, operation) => value + (CounterTransactionOT.isOperation(operation) ? operation.delta : 0),
      state,
    );
  }

  public render(): null {
    return null;
  }

  public getPluginConfig(): null {
    return null;
  }

  public registerState() {
    return { key: this.key, state: this.getState(), dataEngine: { enabled: false } };
  }

  public registerCellVisualReaders(
    registry: SheetCellVisualReaderRegistry,
    _context: SheetCellVisualReaderRegistrationContext,
  ): void {
    registry.register({
      id: 'external.cell-visual',
      properties: ['strokeWidth'],
      read: () => ({ strokeWidth: 1 }),
    });
  }
}

function registerExternalAuthorityContributor(registry: CollaborationContributorRegistry): () => void {
  return registry.register('external.counter', CounterTransactionOT, [CounterTransactionOTRelation]);
}

function registerExternalClientContributor(channel: CollaborationChannel): void {
  channel.registerContributor({
    ownerId: 'external.counter',
    definition: CounterTransactionOT,
    relations: [CounterTransactionOTRelation],
  });
}

void registerExternalAuthorityContributor;
void registerExternalClientContributor;

@Injectable()
class ExternalWorkbookPlugin extends WorkbookPlugin {
  public static readonly symbol = Symbol.for('ExternalWorkbookPlugin');

  private count = 0;
  private readonly listeners = new Set<(count: number) => void>();

  public registerCommands(commands: WorkbookCommandBus): void {
    commands.register(IncrementCommand, () => {
      this.count += 1;
      this.listeners.forEach((listener) => listener(this.count));
      return this.count;
    });
  }

  public registerObservations(observations: ObservationRegistry): void {
    const source: StateObservationSource<number> = {
      getSnapshot: () => this.count,
      subscribe: (listener) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
      },
    };
    observations.register(CountObservation, source);
  }

  public registerSessionState(session: SessionStateRegistry): void {
    session.register(CountSessionState, {
      restorePhase: SessionStateRestorePhase.BeforeInitialize,
      capture: () => this.count,
      restore: (count) => {
        this.count = count;
      },
    });
  }

  public registerCapabilities(capabilities: WorkbookRuntimeExtensionRegistry): void {
    capabilities.register(CountCapability, { getCount: () => this.count });
  }

  public initialize(_context: WorkbookPluginContext): () => void {
    return () => this.listeners.clear();
  }
}

const ExternalWorkbookPluginImplementation =
  ExternalWorkbookPlugin satisfies WorkbookPluginImplementation<ExternalWorkbookPlugin>;

declare const sheetConfiguration: SheetEditorConfiguration;
declare const docConfiguration: DocEditorConfiguration;
declare const workbookConfiguration: WorkbookEditorConfiguration;

const platform = new NodePlatform();
const headless = createHeadlessEditor({
  sheetState: sheetConfiguration.sheetState,
  currentDateTime: () => platform.currentDateTime(),
});
headless.destroy();

const sheet = createSheetEditor({
  ...sheetConfiguration,
  plugins: [...(sheetConfiguration.plugins ?? []), ExternalCollaborativeSheetPlugin],
});
const doc = createDocEditor(docConfiguration);
const workbook = createWorkbookEditor({
  ...workbookConfiguration,
  plugins: [...(workbookConfiguration.plugins ?? []), ExternalWorkbookPluginImplementation],
});

sheet.destroy();
doc.destroy();
workbook.commands.run(IncrementCommand, void 0);
workbook.observations.getSnapshot(CountObservation);
workbook.services.require(CountCapability).getCount();
workbook.document.getState();
workbook.sheets.getActiveId();
workbook.sheets.getActiveEditor();
workbook.sheets.getEditor(workbook.sheets.getActiveId());
deserializeWorkbookDocumentState(
  serializeWorkbookDocumentState(workbook.commands.run(ExportWorkbookStateCommand, void 0).documentState),
);
workbook.destroy();

function checkboxConsumer(editor: ReturnType<typeof createSheetEditor>) {
  const range = { anchor: [0, 0] as [number, number], focus: [2, 0] as [number, number] };
  editor.commands.run(InsertCheckboxesCommand, range);
  editor.commands.run(ToggleCheckboxesCommand, range);
  const state = editor.queries.run(ReadCheckboxRangeQuery, range);
  return { checked: state.checked, removal: CheckboxRemovalMode.Text };
}
void checkboxConsumer;

function dropdownConsumer(editor: ReturnType<typeof createSheetEditor>) {
  const target = { row: 3, column: 0 };
  const state = editor.queries.run(ReadDropdownCellQuery, target);
  if (state?.options.length)
    editor.commands.run(PickDropdownOptionCommand, { ...target, ruleId: state.ruleId, label: state.options[0]!.label });
  return DropdownMode.Multiple;
}
void dropdownConsumer;
