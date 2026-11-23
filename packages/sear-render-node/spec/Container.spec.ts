import { Container } from '../src/Container';
import * as utils from '@searsuite/sear-foundation-utils';
import { SearError } from '@searsuite/sear-foundation-error';

describe('Container', () => {
  it('creates a container and handles children getter', () => {
    const container = new Container();
    expect(container.randomColorKey).toBeDefined();
    expect(container.children).toEqual([]);
  });

  it('throws SearError if randomColorKey cannot be generated', () => {
    jest.spyOn(utils, 'getRandomColor').mockReturnValueOnce(null);
    expect(() => new Container()).toThrow(SearError);
  });

  it('descendants returns empty array', () => {
    const container = new Container();
    expect(container.descendants()).toEqual([]);
  });

  it('add throws NotImplemented error', () => {
    const container = new Container();
    expect(() => container.add(container)).toThrow(SearError);
  });

  it('has no-op remove, query, updateBoundary, and toJSON', () => {
    const container = new Container();
    expect(container.remove()).toBeUndefined();
    expect(container.query()).toBeUndefined();
    expect(container.updateBoundary()).toBeUndefined();
    expect(container.toJSON()).toEqual({});
  });
});
