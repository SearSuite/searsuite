import { SearError } from '../src';

class TestError extends SearError {
  public readonly code = 'TEST_ERROR';

  constructor() {
    super('Test error', { key: 'value' });
  }
}

describe('SearError', () => {
  it('can represent a generic framework failure', () => {
    const error = new SearError('Generic failure');

    expect(error.code).toBe('SEAR_ERROR');
    expect(error.name).toBe('SearError');
  });

  it('preserves the stable code, details, and subclass name', () => {
    const error = new TestError();

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(SearError);
    expect(error.name).toBe('TestError');
    expect(error.code).toBe('TEST_ERROR');
    expect(error.details).toEqual({ key: 'value' });
  });

  it('reports a styled header, details, and stack to the console', () => {
    const error = new TestError();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => void 0);

    expect(error.report()).toBe(error);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('%c TestError %c TEST_ERROR %c Test error'),
      expect.any(String),
      expect.any(String),
      expect.any(String),
    );
    expect(errorSpy).toHaveBeenCalledWith('%c details', expect.any(String), {
      key: 'value',
    });

    errorSpy.mockRestore();
  });

  it('omits optional diagnostics when details and stack are absent', () => {
    const error = new SearError('Minimal failure');
    Object.defineProperty(error, 'stack', { value: '' });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => void 0);

    error.report();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});
