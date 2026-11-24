/** @jest-environment node */

import { LocalActionCommand, defineSheetCommand, type SheetCommandBus } from '@searsuite/sear-assembly-commands';
import { SheetMatrix } from '@searsuite/sear-assembly-core';
import { AlignmentMatrix, VerticalAlignmentMatrix } from '@searsuite/sear-plugin-alignment';
import { CellFillMatrix } from '@searsuite/sear-plugin-cell-fill';
import { CellHighlightMatrix } from '@searsuite/sear-plugin-cell-highlight';
import { DuplicateMatrix } from '@searsuite/sear-plugin-duplicate';
import { CellFormatMatrix } from '@searsuite/sear-plugin-cell-format';
import { CellMergeMatrix } from '@searsuite/sear-plugin-cell-merge';
import { PluginKey } from '@searsuite/sear-assembly-plugin';
import { ColumnShapeDimensionsCSRMatrix, RowShapeDimensionsCSRMatrix } from '@searsuite/sear-domain-matrix';
import { Injectable } from '@searsuite/sear-foundation-di';
import {
  defineEventObservation,
  defineStateObservation,
  type ObservationRegistry,
} from '@searsuite/sear-foundation-subscription';
import {
  SheetPlugin,
  type SheetDocumentState,
  type SheetPluginRuntimeContext,
  type SheetPluginSetupContext,
} from '@searsuite/sear-assembly-setup';

import { createHeadlessEditor } from '../src';

const CoordinationStateObservation = defineStateObservation<number>('test.coordination.state');
const CoordinationEventObservation = defineEventObservation<string>('test.coordination.event');
const RecordCoordinationCommand = defineSheetCommand<{ readonly source: 'state' | 'event'; readonly value: string }>(
  'test.coordination.record',
);

@Injectable()
class CoordinationPublisherPlugin extends SheetPlugin<null> {
  public static readonly symbol = Symbol.for('CoordinationPublisherPlugin');
  public static current: CoordinationPublisherPlugin | null = null;

  private readonly stateListeners = new Set<(value: number) => void>();
  private readonly eventListeners = new Set<(value: string) => void>();
  private value = 1;

  public constructor() {
    super({ key: new PluginKey('CoordinationPublisherPlugin'), state: null });
    CoordinationPublisherPlugin.current = this;
  }

  public registerObservations(observations: ObservationRegistry): void {
    observations.register(CoordinationStateObservation, {
      getSnapshot: () => this.value,
      subscribe: (listener) => {
        this.stateListeners.add(listener);
        return () => this.stateListeners.delete(listener);
      },
    });
    observations.register(CoordinationEventObservation, {
      subscribe: (listener) => {
        this.eventListeners.add(listener);
        return () => this.eventListeners.delete(listener);
      },
    });
  }

  public configure(_context: SheetPluginSetupContext): void {
    this.publishEvent('before-subscribe');
  }

  public publish(value: number, event: string): void {
    this.value = value;
    this.stateListeners.forEach((listener) => listener(value));
    this.publishEvent(event);
  }

  public get listenerCount(): number {
    return this.stateListeners.size + this.eventListeners.size;
  }

  public registerState() {
    return { key: this.key, state: null, dataEngine: { enabled: false } };
  }

  public getPluginConfig(): null {
    return null;
  }

  public apply(): null {
    return null;
  }

  public render(): null {
    return null;
  }

  private publishEvent(event: string): void {
    this.eventListeners.forEach((listener) => listener(event));
  }
}

@Injectable()
class CoordinationCommandPlugin extends SheetPlugin<null> {
  public static readonly symbol = Symbol.for('CoordinationCommandPlugin');
  public static readonly records: Array<{ readonly source: 'state' | 'event'; readonly value: string }> = [];

  public constructor() {
    super({ key: new PluginKey('CoordinationCommandPlugin'), state: null });
  }

  public registerCommands(commands: SheetCommandBus): void {
    commands.register(
      RecordCoordinationCommand,
      (input) =>
        new LocalActionCommand(RecordCoordinationCommand.id, () => CoordinationCommandPlugin.records.push(input)),
    );
  }

  public registerState() {
    return { key: this.key, state: null, dataEngine: { enabled: false } };
  }

  public getPluginConfig(): null {
    return null;
  }

  public apply(): null {
    return null;
  }

  public render(): null {
    return null;
  }
}

@Injectable()
class CoordinationConsumerPlugin extends SheetPlugin<null> {
  public static readonly symbol = Symbol.for('CoordinationConsumerPlugin');

  private readonly disposers: Array<() => void> = [];

  public constructor() {
    super({ key: new PluginKey('CoordinationConsumerPlugin'), state: null });
  }

  public initialize(context: SheetPluginRuntimeContext): void {
    if (!context.runtime.commands.has(RecordCoordinationCommand)) {
      throw new Error(`CoordinationConsumerPlugin requires ${RecordCoordinationCommand.id}.`);
    }
    if (
      !context.runtime.observations.has(CoordinationStateObservation) ||
      !context.runtime.observations.has(CoordinationEventObservation)
    ) {
      throw new Error('CoordinationConsumerPlugin requires its coordination observations.');
    }
    this.disposers.push(
      context.runtime.observations.subscribe(CoordinationStateObservation, (value) => {
        context.runtime.commands.run(RecordCoordinationCommand, { source: 'state', value: String(value) });
      }),
      context.runtime.observations.subscribe(CoordinationEventObservation, (value) => {
        context.runtime.commands.run(RecordCoordinationCommand, { source: 'event', value });
      }),
    );
  }

  public onEditorDestroy(): void {
    this.disposers.splice(0).forEach((dispose) => dispose());
  }

  public registerState() {
    return { key: this.key, state: null, dataEngine: { enabled: false } };
  }

  public getPluginConfig(): null {
    return null;
  }

  public apply(): null {
    return null;
  }

  public render(): null {
    return null;
  }
}

describe('third-party Sheet plugin coordination', () => {
  beforeEach(() => {
    CoordinationCommandPlugin.records.length = 0;
    CoordinationPublisherPlugin.current = null;
  });

  it('observes another plugin and runs a command owned by a third plugin after binding', () => {
    const editor = createHeadlessEditor({
      sheetState: createSheetState(),
      plugins: [CoordinationPublisherPlugin, CoordinationCommandPlugin, CoordinationConsumerPlugin],
    });
    const publisher = CoordinationPublisherPlugin.current;
    if (!publisher) throw new Error('Expected the coordination publisher plugin.');

    expect(CoordinationCommandPlugin.records).toEqual([{ source: 'state', value: '1' }]);
    expect(publisher.listenerCount).toBe(2);

    publisher.publish(2, 'after-subscribe');

    expect(CoordinationCommandPlugin.records).toEqual([
      { source: 'state', value: '1' },
      { source: 'state', value: '2' },
      { source: 'event', value: 'after-subscribe' },
    ]);
    expect(CoordinationCommandPlugin.records).not.toContainEqual({ source: 'event', value: 'before-subscribe' });

    editor.destroy();
    expect(publisher.listenerCount).toBe(0);
    publisher.publish(3, 'after-destroy');
    expect(CoordinationCommandPlugin.records).toHaveLength(3);
  });
});

function createSheetState(): SheetDocumentState {
  const shape: [number, number] = [1, 1];
  const rowSizes = new RowShapeDimensionsCSRMatrix(void 0, [1, shape[0]]);
  const columnSizes = new ColumnShapeDimensionsCSRMatrix(void 0, [1, shape[1]]);
  rowSizes.setDefaultValue(24);
  columnSizes.setDefaultValue(100);
  return {
    sheetData: new SheetMatrix(void 0, shape),
    rowSizes,
    columnSizes,
    cellAlignments: new AlignmentMatrix(void 0, shape),
    cellVerticalAlignments: new VerticalAlignmentMatrix(void 0, shape),
    cellFills: new CellFillMatrix(void 0, shape),
    cellHighlights: new CellHighlightMatrix(void 0, shape),
    duplicates: new DuplicateMatrix(void 0, shape),
    cellFormats: new CellFormatMatrix(void 0, shape),
    cellMerges: new CellMergeMatrix(void 0, shape),
  };
}
