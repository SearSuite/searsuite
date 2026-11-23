import { SearError } from '@searsuite/sear-foundation-error';

import { createReactiveConfig } from '../src/createReactive';

describe('createReactiveConfig', () => {
  it('notifies on changed top-level and nested values but not identical assignments', () => {
    const onChange = jest.fn();
    const config = createReactiveConfig({ enabled: true, nested: { width: 10 } }, onChange);

    config.enabled = true;
    config.enabled = false;
    config.nested.width = 20;

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(config).toMatchObject({ enabled: false, nested: { width: 20 } });
  });

  it('rejects arrays so reactive configuration stays object-shaped', () => {
    const config = createReactiveConfig({ values: [1, 2] }, () => void 0);

    expect(() => config.values).toThrow(SearError);
  });
});
