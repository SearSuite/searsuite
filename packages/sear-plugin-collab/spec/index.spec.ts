import * as moduleExports from '../src/index';

describe('@searsuite/sear-plugin-collab public API', () => {
  it('exports all collab plugin types and transport implementations', () => {
    expect(moduleExports.SheetCollaborationPlugin).toBeDefined();
    expect(moduleExports.CollaborationStatusObservation).toBeDefined();
    expect(moduleExports.CollabTransport).toBeDefined();
    expect(moduleExports.HeadlessCollabTransport).toBeDefined();
  });
});
