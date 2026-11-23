import { printNameAndVersion } from '../src/printNameAndVersion';

describe('printNameAndVersion', () => {
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('Basic functionality', () => {
    it('should call console.log', () => {
      printNameAndVersion('TestPlugin', '1.0.0');
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should call console.log exactly once', () => {
      printNameAndVersion('TestPlugin', '1.0.0');
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    });

    it('should output formatted string with name', () => {
      printNameAndVersion('MyPlugin', '1.0.0');
      const args = consoleLogSpy.mock.calls[0];
      expect(args[0]).toContain('MyPlugin');
    });

    it('should output formatted string with version', () => {
      printNameAndVersion('MyPlugin', '2.3.4');
      const args = consoleLogSpy.mock.calls[0];
      expect(args[0]).toContain('v2.3.4');
    });

    it('should include style parameters', () => {
      printNameAndVersion('TestPlugin', '1.0.0');
      const args = consoleLogSpy.mock.calls[0];
      expect(args.length).toBeGreaterThanOrEqual(3);
      expect(typeof args[1]).toBe('string');
      expect(typeof args[2]).toBe('string');
    });
  });

  describe('Output format', () => {
    it('should format message with leading space', () => {
      printNameAndVersion('Plugin', '1.0.0');
      const message = consoleLogSpy.mock.calls[0][0];
      expect(message).toMatch(/^%c /);
    });

    it('should include %c format specifiers', () => {
      printNameAndVersion('Plugin', '1.0.0');
      const message = consoleLogSpy.mock.calls[0][0];
      const specifiers = (message.match(/%c/g) || []).length;
      expect(specifiers).toBe(2);
    });

    it('should format version with v prefix', () => {
      printNameAndVersion('MyApp', '3.2.1');
      const message = consoleLogSpy.mock.calls[0][0];
      expect(message).toContain('v3.2.1');
    });

    it('should have dark background style for name section', () => {
      printNameAndVersion('Plugin', '1.0.0');
      const style1 = consoleLogSpy.mock.calls[0][1];
      expect(style1).toContain('background:#111827');
      expect(style1).toContain('color:#f9fafb');
    });

    it('should have light background style for version section', () => {
      printNameAndVersion('Plugin', '1.0.0');
      const style2 = consoleLogSpy.mock.calls[0][2];
      expect(style2).toContain('background:#38bdf8');
      expect(style2).toContain('color:#082f49');
    });

    it('should have rounded corners', () => {
      printNameAndVersion('Plugin', '1.0.0');
      const style1 = consoleLogSpy.mock.calls[0][1];
      const style2 = consoleLogSpy.mock.calls[0][2];
      expect(style1).toContain('border-radius:4px 0 0 4px');
      expect(style2).toContain('border-radius:0 4px 4px 0');
    });

    it('should have consistent padding', () => {
      printNameAndVersion('Plugin', '1.0.0');
      const style1 = consoleLogSpy.mock.calls[0][1];
      const style2 = consoleLogSpy.mock.calls[0][2];
      expect(style1).toContain('padding:3px 6px');
      expect(style2).toContain('padding:3px 6px');
    });

    it('should have font size 10px', () => {
      printNameAndVersion('Plugin', '1.0.0');
      const style1 = consoleLogSpy.mock.calls[0][1];
      const style2 = consoleLogSpy.mock.calls[0][2];
      expect(style1).toContain('font:600 11px/1');
      expect(style2).toContain('font:600 11px/1');
    });
  });

  describe('Different name formats', () => {
    it('should handle simple plugin names', () => {
      printNameAndVersion('Editor', '1.0.0');
      const message = consoleLogSpy.mock.calls[0][0];
      expect(message).toContain('Editor');
    });

    it('should handle names with hyphens', () => {
      printNameAndVersion('sear-editor', '1.0.0');
      const message = consoleLogSpy.mock.calls[0][0];
      expect(message).toContain('sear-editor');
    });

    it('should handle names with underscores', () => {
      printNameAndVersion('sear_common', '1.0.0');
      const message = consoleLogSpy.mock.calls[0][0];
      expect(message).toContain('sear_common');
    });

    it('should handle empty name string', () => {
      printNameAndVersion('', '1.0.0');
      expect(consoleLogSpy).toHaveBeenCalled();
      const message = consoleLogSpy.mock.calls[0][0];
      expect(message).toContain('%c');
    });

    it('should handle names with special characters', () => {
      printNameAndVersion('@scope/package', '1.0.0');
      const message = consoleLogSpy.mock.calls[0][0];
      expect(message).toContain('@scope/package');
    });
  });

  describe('Different version formats', () => {
    it('should handle standard semver', () => {
      printNameAndVersion('Plugin', '1.2.3');
      const message = consoleLogSpy.mock.calls[0][0];
      expect(message).toContain('v1.2.3');
    });

    it('should handle major.minor version', () => {
      printNameAndVersion('Plugin', '2.5');
      const message = consoleLogSpy.mock.calls[0][0];
      expect(message).toContain('v2.5');
    });

    it('should handle major version only', () => {
      printNameAndVersion('Plugin', '3');
      const message = consoleLogSpy.mock.calls[0][0];
      expect(message).toContain('v3');
    });

    it('should handle version with pre-release tag', () => {
      printNameAndVersion('Plugin', '1.0.0-beta');
      const message = consoleLogSpy.mock.calls[0][0];
      expect(message).toContain('v1.0.0-beta');
    });

    it('should handle empty version string', () => {
      printNameAndVersion('Plugin', '');
      const message = consoleLogSpy.mock.calls[0][0];
      expect(message).toContain('v ');
    });
  });

  describe('Real-world scenarios', () => {
    it('should display sear-editor plugin info', () => {
      printNameAndVersion('SearEditor', '1.5.2');
      const message = consoleLogSpy.mock.calls[0][0];
      expect(message).toContain('SearEditor');
      expect(message).toContain('v1.5.2');
    });

    it('should handle multiple plugins', () => {
      const plugins = [
        { name: 'SearCore', version: '1.0.0' },
        { name: 'SearEditor', version: '1.2.3' },
      ];

      plugins.forEach((plugin) => {
        printNameAndVersion(plugin.name, plugin.version);
      });

      expect(consoleLogSpy).toHaveBeenCalledTimes(2);
    });

    it('should work with scoped packages', () => {
      printNameAndVersion('@searsuite/sear-domain-editor', '1.0.0');
      const message = consoleLogSpy.mock.calls[0][0];
      expect(message).toContain('@searsuite/sear-domain-editor');
    });
  });

  describe('Console integration', () => {
    it('should work without errors', () => {
      expect(() => {
        printNameAndVersion('TestPlugin', '1.0.0');
      }).not.toThrow();
    });

    it('should not return any value', () => {
      const result = printNameAndVersion('Plugin', '1.0.0');
      expect(result).toBeUndefined();
    });

    it('should handle rapid successive calls', () => {
      for (let i = 0; i < 5; i++) {
        printNameAndVersion(`Plugin${i}`, `${i}.0.0`);
      }
      expect(consoleLogSpy).toHaveBeenCalledTimes(5);
    });
  });
});
