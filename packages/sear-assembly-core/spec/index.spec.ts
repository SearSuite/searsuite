import * as publicApi from '../src/index';

describe('@searsuite/sear-assembly-core public API', () => {
  it('exports all core types and entry points', () => {
    expect(publicApi.SearCore).toBeDefined();
    expect(publicApi.SearCoreSheet).toBeDefined();
    expect(publicApi.SearCoreDoc).toBeDefined();
    expect(publicApi.DocCursorManager).toBeDefined();
    expect(publicApi.DocInputPlugin).toBeDefined();
    expect(publicApi.DocRenderEngine).toBeDefined();
    expect(publicApi.SearAssemblyErrorCode).toBeDefined();
    expect(publicApi.SearRegistryConflictError).toBeDefined();
    expect(publicApi.SearRegistryEntryNotFoundError).toBeDefined();
    expect(publicApi.SearPipelineStepExecutorNotFoundError).toBeDefined();
    expect(publicApi.SearLifecycleError).toBeDefined();
    expect(publicApi.SearDocParseError).toBeDefined();
    expect(publicApi.SearContractViolationError).toBeDefined();
    expect(publicApi.Pipeline).toBeDefined();
    expect(publicApi.PipelineStepKind).toBeDefined();
    expect(publicApi.PipelineStepExecutorRegistry).toBeDefined();
    expect(publicApi.ConsolePipelineLogger).toBeDefined();
    expect(publicApi.SheetLifecycleCoordinator).toBeDefined();
    expect(publicApi.SheetViewportResizeController).toBeDefined();
    expect(publicApi.SheetInteractionStore).toBeDefined();
    expect(publicApi.SheetInteractionReducerRegistry).toBeDefined();
    expect(publicApi.SheetMatrix).toBeDefined();
  });
});
