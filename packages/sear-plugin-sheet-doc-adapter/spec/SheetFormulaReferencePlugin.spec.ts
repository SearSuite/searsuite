import { SheetFormulaReferencePlugin } from '../src/adapterPlugin/formulaReference/SheetFormulaReferencePlugin';

describe('SheetFormulaReferencePlugin', () => {
  it('does not expose its mutable reference cache', () => {
    const plugin = new SheetFormulaReferencePlugin();
    plugin.initialize({ document: [{ type: 'text', text: '=Sheet1!A1' }] } as never);

    (plugin.getReferences() as string[]).push('B2');
    Object.assign(plugin, { references: ['C3'] });

    expect(plugin.getReferences()).toEqual(['Sheet1!A1']);
  });
});
