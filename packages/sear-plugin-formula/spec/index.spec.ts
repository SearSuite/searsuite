import * as ownerApi0 from '@searsuite/sear-render';
import * as publicApi from '../src/index';

describe('sear-plugin-formula public API', () => {
  it('exports formula plugin runtime and status command contracts', () => {
    expect(publicApi.SheetFormulaPlugin).toBeDefined();
    expect(publicApi.RecalcScheduler).toBeDefined();
    expect(publicApi.FormulaRefShifter).toBeDefined();
    expect(publicApi.FormulaResultStore).toBeDefined();
    expect(publicApi.FormulaCalculationTraceBus).toBeDefined();
    expect(publicApi.FormulaValuePublisher).toBeDefined();
    expect(publicApi.FormulaResultProviderRegistry).toBeDefined();
    expect(publicApi.FormulaSourceProviderRegistry).toBeDefined();
    expect(publicApi.FormulaSchedulerDataSource).toBeDefined();
    expect(publicApi.GetFormulaCellStatusCommand).toBeDefined();
    expect(publicApi.FormulaCalculationTraceObservation).toBeDefined();
    expect(publicApi.registerFormulaStatusCommands).toBeDefined();
    expect(ownerApi0.SheetFormulaReferenceHighlightView).toBeDefined();
    expect(publicApi.CellFormulaValueConverterRegistry).toBeDefined();
    expect(publicApi.sheetFormulaPluginKey).toBeDefined();
    expect(ownerApi0.formulaReferenceHighlightConfig).toBeDefined();
    expect(ownerApi0.getFormulaReferenceColor).toBeDefined();
  });
});
