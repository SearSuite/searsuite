import { ConsolePipelineLogger } from '../src';
import { PipelineStepKind, type Pipeline, type PipelineStep } from '../src/Pipeline';

describe('ConsolePipelineLogger', () => {
  it('formats singular/plural dirty states, render/non-render steps, and both completion outcomes', () => {
    const logger = new ConsolePipelineLogger();
    const group = jest.spyOn(console, 'group').mockImplementation();
    const log = jest.spyOn(console, 'log').mockImplementation();
    const groupEnd = jest.spyOn(console, 'groupEnd').mockImplementation();
    const single = { name: 'single', steps: [{}], dirtyRects: [] } as unknown as Pipeline;
    const multiple = { name: 'multiple', steps: [{}, {}], dirtyRects: [{}] } as unknown as Pipeline;
    const render = { name: 'render', kind: PipelineStepKind.Render } as PipelineStep;
    const state = { name: 'state', kind: PipelineStepKind.Transaction } as PipelineStep;

    logger.onStart(single);
    logger.onStart(multiple);
    logger.onStepStart(render, single, 'paint');
    logger.onStepStart(state, single, 'apply');
    logger.onStepComplete(state, single);
    logger.onComplete(single, true);
    logger.onComplete(single, false);

    expect(group).toHaveBeenCalledWith(expect.stringContaining('(1 step)'), expect.any(String), expect.any(String));
    expect(group).toHaveBeenCalledWith(
      expect.stringContaining('(2 steps, 1 dirty)'),
      expect.any(String),
      expect.any(String),
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('🎨'),
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
    expect(log).toHaveBeenCalledWith(expect.stringContaining('— rendered'), expect.any(String));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('— no render needed'), expect.any(String));
    expect(groupEnd).toHaveBeenCalledTimes(2);
  });
});
