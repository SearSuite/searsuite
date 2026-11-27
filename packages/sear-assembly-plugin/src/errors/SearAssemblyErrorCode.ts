/** Stable machine-readable error codes owned by assembly packages. */
export const SearAssemblyErrorCode = {
  registryConflict: 'SEAR_REGISTRY_CONFLICT',
  registryEntryNotFound: 'SEAR_REGISTRY_ENTRY_NOT_FOUND',
  pipelineStepExecutorNotFound: 'SEAR_PIPELINE_STEP_EXECUTOR_NOT_FOUND',
  lifecycleInvalidState: 'SEAR_LIFECYCLE_INVALID_STATE',
  docParse: 'SEAR_DOC_PARSE',
  contractViolation: 'SEAR_CONTRACT_VIOLATION',
} as const;
