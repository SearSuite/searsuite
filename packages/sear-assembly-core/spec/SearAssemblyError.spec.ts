import { SearError } from '@searsuite/sear-foundation-error';

import {
  SearAssemblyErrorCode,
  SearContractViolationError,
  SearDocParseError,
  SearLifecycleError,
  SearPipelineStepExecutorNotFoundError,
  SearRegistryConflictError,
  SearRegistryEntryNotFoundError,
} from '../src';
import { PipelineStepExecutorRegistry } from '../src/PipelineStepExecutorRegistry';
import { SheetInteractionReducerRegistry } from '../src/SheetInteractionReducerRegistry';
import { SheetInteractionStore } from '../src/SheetInteractionStore';
import { SheetLifecycleCoordinator } from '../src/SheetLifecycleCoordinator';
import { type SheetLifecycleContext } from '../src/SheetLifecycleController';

describe('assembly errors', () => {
  it('uses a stable error type and context for duplicate registrations', () => {
    const registry = new PipelineStepExecutorRegistry();
    const executor = { kind: 'custom', execute: () => {} };
    registry.register(executor);

    expect(() => registry.register(executor)).toThrow(SearRegistryConflictError);
    try {
      registry.register(executor);
    } catch (error) {
      expect(error).toBeInstanceOf(SearError);
      expect(error).toMatchObject({
        code: SearAssemblyErrorCode.registryConflict,
        details: { registry: 'pipeline step executor', key: 'custom' },
      });
    }
  });

  it('uses a registry error when an interaction reducer is missing', () => {
    const store = new SheetInteractionStore(new SheetInteractionReducerRegistry());

    expect(() => store.apply({ type: 'unknown' })).toThrow(SearRegistryEntryNotFoundError);
  });

  it('uses a lifecycle error for operations after destruction', () => {
    const coordinator = new SheetLifecycleCoordinator();
    const context = {} as SheetLifecycleContext;
    coordinator.destroy();

    expect(() => coordinator.start(context)).toThrow(SearLifecycleError);
  });

  it('uses a parse error for invalid document input', () => {
    const error = new SearDocParseError('Invalid document input', { path: [0, 'content'] });

    expect(error).toBeInstanceOf(SearError);
    expect(error).toMatchObject({
      code: SearAssemblyErrorCode.docParse,
      details: { path: [0, 'content'] },
    });
  });

  it('preserves default and caller-provided diagnostics for every public assembly error', () => {
    expect(new SearRegistryConflictError('registry', 'key')).toMatchObject({
      code: SearAssemblyErrorCode.registryConflict,
      message: 'A registry entry for "key" is already registered.',
      details: { registry: 'registry', key: 'key' },
    });
    expect(new SearRegistryConflictError('registry', 'key', 'custom conflict').message).toBe('custom conflict');
    expect(new SearRegistryEntryNotFoundError('registry', 'key', 'custom')).toMatchObject({
      code: SearAssemblyErrorCode.registryEntryNotFound,
      message: 'custom',
    });
    expect(new SearRegistryEntryNotFoundError('registry', 'key').message).toBe(
      'No registry entry is registered for "key".',
    );
    expect(new SearPipelineStepExecutorNotFoundError('render')).toMatchObject({
      code: SearAssemblyErrorCode.pipelineStepExecutorNotFound,
      details: { kind: 'render' },
    });
    expect(new SearLifecycleError('start', 'stopped')).toMatchObject({
      code: SearAssemblyErrorCode.lifecycleInvalidState,
      message: 'Cannot start when the sheet lifecycle is stopped.',
    });
    expect(new SearLifecycleError('start', 'stopped', 'custom lifecycle').message).toBe('custom lifecycle');
    expect(new SearDocParseError('bad doc', { path: [0] })).toMatchObject({
      code: SearAssemblyErrorCode.docParse,
      details: { path: [0] },
    });
    expect(new SearContractViolationError('bad contract', { field: 'type' })).toMatchObject({
      code: SearAssemblyErrorCode.contractViolation,
      details: { field: 'type' },
    });
    expect(new SearContractViolationError('bad contract')).toMatchObject({
      details: {},
    });
  });
});
