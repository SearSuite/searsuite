import { ViewExtensionRole } from '@searsuite/sear-render-event-engine';
import { SheetGridOverflowView } from '../src/sheet/SheetGridOverflow';
describe('SheetGridOverflowView', () => {
  it('reserves a presentation identity without owning document state', () => {
    const view = new SheetGridOverflowView();
    expect(view[ViewExtensionRole]).toBe(true);
    expect(view.registerConfig()).toEqual([]);
    expect('apply' in view).toBe(false);
    expect('registerState' in view).toBe(false);
  });
});
