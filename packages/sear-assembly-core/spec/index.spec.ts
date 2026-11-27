import * as ownerApi2 from '@searsuite/sear-domain-sheet';
import * as ownerApi1 from '@searsuite/sear-assembly-plugin';
import * as ownerApi0 from '@searsuite/sear-assembly-doc';
import * as publicApi from '../src/index';

describe('@searsuite/sear-assembly-core public API', () => {
  it('exports all core types and entry points', () => {
    expect(publicApi.SearCoreSheet).toBeDefined();
    expect(publicApi.SearCoreDoc).toBeDefined();
    expect(publicApi.DocCursorManager).toBeDefined();
    expect(ownerApi0.DocInputPlugin).toBeDefined();
    expect(publicApi.DocRenderEngine).toBeDefined();
    expect(ownerApi1.SearAssemblyErrorCode).toBeDefined();
    expect(ownerApi1.SearRegistryConflictError).toBeDefined();
    expect(ownerApi1.SearRegistryEntryNotFoundError).toBeDefined();
    expect(ownerApi1.SearPipelineStepExecutorNotFoundError).toBeDefined();
    expect(ownerApi1.SearLifecycleError).toBeDefined();
    expect(ownerApi1.SearDocParseError).toBeDefined();
    expect(ownerApi1.SearContractViolationError).toBeDefined();
    expect(ownerApi1.Pipeline).toBeDefined();
    expect(ownerApi1.PipelineStepKind).toBeDefined();
    expect(ownerApi1.PipelineStepExecutorRegistry).toBeDefined();
    expect(publicApi.ConsolePipelineLogger).toBeDefined();
    expect(publicApi.SheetLifecycleCoordinator).toBeDefined();
    expect(publicApi.SheetViewportResizeController).toBeDefined();
    expect(ownerApi1.SheetInteractionStore).toBeDefined();
    expect(ownerApi1.SheetInteractionReducerRegistry).toBeDefined();
    expect(ownerApi2.SheetMatrix).toBeDefined();
  });
});
