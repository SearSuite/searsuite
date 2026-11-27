import { SheetCommandBus } from '@searsuite/sear-assembly-commands';
import { PluginKey } from '@searsuite/sear-assembly-plugin';
import {
  FormulaHyperlinkServiceDefinition,
  IFormulaExternalServiceProvider,
  IFormulaRichResultProvider,
} from '@searsuite/sear-domain-formula-engine';
import { Inject, Injectable } from '@searsuite/sear-foundation-di';
import { ActivateFormulaHyperlinkCommand } from '@searsuite/sear-plugin-formula';
import { ViewExtensionBase, type EventWithOffsetAndTarget } from '@searsuite/sear-render-event-engine';
import { CellRegion, type CellProperties } from '@searsuite/sear-render-registry';

/** Converts a hyperlink cell hit into the formula owner's semantic command. */
@Injectable()
export class SheetFormulaHyperlinkView extends ViewExtensionBase<unknown, CellProperties> {
  public static readonly symbol = Symbol.for('SheetFormulaHyperlinkView');
  readonly #commands: SheetCommandBus;
  readonly #results: IFormulaRichResultProvider;
  readonly #services: IFormulaExternalServiceProvider;

  public constructor(
    @Inject(SheetCommandBus.symbol) commands: SheetCommandBus,
    @Inject(IFormulaRichResultProvider.symbol) results: IFormulaRichResultProvider,
    @Inject(IFormulaExternalServiceProvider.symbol) services: IFormulaExternalServiceProvider,
  ) {
    super(new PluginKey('SheetFormulaHyperlinkView'));
    this.#commands = commands;
    this.#results = results;
    this.#services = services;
  }

  public onMouseUp(_context: unknown, event: EventWithOffsetAndTarget<CellProperties>): boolean | void {
    if ((event.origin.button ?? 0) !== 0 || (event.clickCount ?? 1) > 1) return;
    const properties = event.target?.properties;
    if (properties?.region !== CellRegion.Grid) return;
    const row = properties.startRowIndex;
    const column = properties.startColIndex;
    if (row === undefined || column === undefined) return;
    if (this.#results.getFormulaRichResult(row, column)?.kind !== 'hyperlink') return;
    if (!this.#services.get(FormulaHyperlinkServiceDefinition)?.openTarget) return;
    this.#commands.run(ActivateFormulaHyperlinkCommand, { row, column });
    event.origin.preventDefault();
    return false;
  }
}
