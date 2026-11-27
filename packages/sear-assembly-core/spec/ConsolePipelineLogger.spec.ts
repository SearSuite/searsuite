import { ConsolePipelineLogger } from '../src';
import { PipelineStepKind, type Pipeline, type PipelineStep } from '@searsuite/sear-assembly-plugin';

describe('ConsolePipelineLogger', () => {
  it('formats step counts, projection notifications and commit completion', () => {
    const logger = new ConsolePipelineLogger();
    const group = jest.spyOn(console, 'group').mockImplementation();
    const log = jest.spyOn(console, 'log').mockImplementation();
    const groupEnd = jest.spyOn(console, 'groupEnd').mockImplementation();
    const single = { name: 'single', steps: [{}] } as unknown as Pipeline;
    const multiple = { name: 'multiple', steps: [{}, {}] } as unknown as Pipeline;
    const render = { name: 'render', kind: PipelineStepKind.Invalidate } as PipelineStep;
    const state = { name: 'state', kind: PipelineStepKind.Transaction } as PipelineStep;

    logger.onStart(single);
    logger.onStart(multiple);
    logger.onStepStart(render, single, 'paint');
    logger.onStepStart(state, single, 'apply');
    logger.onStepComplete(state, single);
    logger.onComplete(single);
    logger.onComplete(single);

    expect(group).toHaveBeenCalledWith(expect.stringContaining('(1 step)'), expect.any(String), expect.any(String));
    expect(group).toHaveBeenCalledWith(expect.stringContaining('(2 steps)'), expect.any(String), expect.any(String));
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('🔔'),
      expect.any(String),
      expect.any(String),
      expect.any(String),
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('📝'),
      expect.any(String),
      expect.any(String),
      expect.any(String),
    );
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Pipeline committed'), expect.any(String));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Pipeline committed'), expect.any(String));
    expect(groupEnd).toHaveBeenCalledTimes(2);
  });
});
