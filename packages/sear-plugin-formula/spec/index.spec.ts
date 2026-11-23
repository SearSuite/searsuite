import * as publicApi from '../src/index';

describe('sear-plugin-formula public API', () => {
  it('exports formula plugin runtime and status command contracts', () => {
    expect(publicApi.SheetFormulaPlugin).toBeDefined();
    expect(publicApi.RecalcScheduler).toBeDefined();
    expect(publicApi.FormulaRefShifter).toBeDefined();
    expect(publicApi.FormulaResultStore).toBeDefined();
    expect(publicApi.FormulaCalculationTraceBus).toBeDefined();
    expect(publicApi.FormulaRenderInvalidator).toBeDefined();
    expect(publicApi.FormulaResultProviderRegistry).toBeDefined();
    expect(publicApi.FormulaSourceProviderRegistry).toBeDefined();
    expect(publicApi.FormulaSchedulerDataSource).toBeDefined();
    expect(publicApi.GetFormulaCellStatusCommand).toBeDefined();
    expect(publicApi.FormulaCalculationTraceObservation).toBeDefined();
    expect(publicApi.registerFormulaStatusCommands).toBeDefined();
    expect(publicApi.SheetFormulaReferenceHighlightPlugin).toBeDefined();
    expect(publicApi.CellFormulaValueConverterRegistry).toBeDefined();
    expect(publicApi.sheetFormulaPluginKey).toBeDefined();
    expect(publicApi.formulaReferenceHighlightConfig).toBeDefined();
    expect(publicApi.getFormulaReferenceColor).toBeDefined();
  });
});
