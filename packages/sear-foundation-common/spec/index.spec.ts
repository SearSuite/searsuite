/**
 * Comprehensive test suite for the index.ts exports.
 *
 * This test suite covers:
 * - BuildInStateName enum validation
 * - SearDocumentType enum validation
 * - Module exports and re-exports
 * - Enum value integrity
 * - Real-world usage scenarios
 */

import { BuildInStateName, SearDocumentType, SearKey, QuadTree, QuadTreeNode, printNameAndVersion } from '../src/index';

describe('index.ts exports', () => {
  describe('Module exports', () => {
    it('should export BuildInStateName enum', () => {
      expect(BuildInStateName).toBeDefined();
      expect(typeof BuildInStateName).toBe('object');
    });

    it('should export SearDocumentType enum', () => {
      expect(SearDocumentType).toBeDefined();
      expect(typeof SearDocumentType).toBe('object');
    });

    it('should export SearKey class', () => {
      expect(SearKey).toBeDefined();
      expect(typeof SearKey).toBe('function');
    });

    it('should export printNameAndVersion function', () => {
      expect(printNameAndVersion).toBeDefined();
      expect(typeof printNameAndVersion).toBe('function');
    });

    it('should export QuadTree and QuadTreeNode classes', () => {
      expect(QuadTree).toBeDefined();
      expect(QuadTreeNode).toBeDefined();
      expect(typeof QuadTree).toBe('function');
      expect(typeof QuadTreeNode).toBe('function');
    });

    it('should allow creating SearKey instances from export', () => {
      const key = new SearKey('test-export');
      expect(key.key).toBeDefined();
      expect(key.key).toContain('test-export');
    });

    it('should allow calling printNameAndVersion from export', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      printNameAndVersion('TestModule', '1.0.0');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should allow constructing and using QuadTree from index export', () => {
      const root = new QuadTreeNode<string>({ x: 0, y: 0, width: 20, height: 20 }, 2);
      const tree = new QuadTree(root);
      const inserted = tree.insert({ x: 5, y: 5 }, 'v1');
      const queried = tree.query({ x: 0, y: 0, width: 10, height: 10 });

      expect(inserted).toBe(true);
      expect(queried).toHaveLength(1);
    });
  });

  describe('BuildInStateName enum', () => {
    it('should have CORE_STATE value', () => {
      expect(BuildInStateName.CORE_STATE).toBe('CORE_STATE');
    });

    it('should have COLUMN_SHAPE_STATE value', () => {
      expect(BuildInStateName.COLUMN_SHAPE_STATE).toBe('COLUMN_SHAPE_STATE');
    });

    it('should have ROW_SHAPE_STATE value', () => {
      expect(BuildInStateName.ROW_SHAPE_STATE).toBe('ROW_SHAPE_STATE');
    });

    it('should have exactly 3 enum members', () => {
      const keys = Object.keys(BuildInStateName);
      expect(keys.filter((k) => isNaN(Number(k))).length).toBe(3);
    });

    it('should use consistent naming format', () => {
      expect(BuildInStateName.CORE_STATE).toMatch(/^[A-Z_]+$/);
      expect(BuildInStateName.COLUMN_SHAPE_STATE).toMatch(/^[A-Z_]+$/);
      expect(BuildInStateName.ROW_SHAPE_STATE).toMatch(/^[A-Z_]+$/);
    });

    it('should be usable as state keys', () => {
      const stateMap = new Map();
      stateMap.set(BuildInStateName.CORE_STATE, { value: 'core' });
      stateMap.set(BuildInStateName.COLUMN_SHAPE_STATE, { value: 'columns' });
      stateMap.set(BuildInStateName.ROW_SHAPE_STATE, { value: 'rows' });

      expect(stateMap.get(BuildInStateName.CORE_STATE)).toEqual({
        value: 'core',
      });
      expect(stateMap.get(BuildInStateName.COLUMN_SHAPE_STATE)).toEqual({
        value: 'columns',
      });
      expect(stateMap.get(BuildInStateName.ROW_SHAPE_STATE)).toEqual({
        value: 'rows',
      });
    });

    it('should be case-sensitive', () => {
      expect(BuildInStateName.CORE_STATE).not.toBe('core_state');
      expect(BuildInStateName.CORE_STATE).not.toBe('CoreState');
    });

    it('should have distinct values', () => {
      const values = [
        BuildInStateName.CORE_STATE,
        BuildInStateName.COLUMN_SHAPE_STATE,
        BuildInStateName.ROW_SHAPE_STATE,
      ];
      const uniqueValues = new Set(values);
      expect(uniqueValues.size).toBe(3);
    });

    it('should support enum-like usage patterns', () => {
      const activeState = BuildInStateName.CORE_STATE;
      expect([
        BuildInStateName.CORE_STATE,
        BuildInStateName.COLUMN_SHAPE_STATE,
        BuildInStateName.ROW_SHAPE_STATE,
      ]).toContain(activeState);
    });
  });

  describe('SearDocumentType enum', () => {
    it('should have UNKNOWN value', () => {
      expect(SearDocumentType.UNKNOWN).toBe(0);
    });

    it('should have SEAR_DOC value', () => {
      expect(SearDocumentType.SEAR_DOC).toBe(1);
    });

    it('should have SEAR_SHEET value', () => {
      expect(SearDocumentType.SEAR_SHEET).toBe(2);
    });

    it('should have SEAR_TABLE value', () => {
      expect(SearDocumentType.SEAR_TABLE).toBe(3);
    });

    it('should have SEAR_SLIDE value', () => {
      expect(SearDocumentType.SEAR_SLIDE).toBe(4);
    });

    it('should have SEAR_MIND value', () => {
      expect(SearDocumentType.SEAR_MIND).toBe(5);
    });

    it('should have SEAR_FLOW value', () => {
      expect(SearDocumentType.SEAR_FLOW).toBe(6);
    });

    it('should have numeric values for document types', () => {
      expect(typeof SearDocumentType.UNKNOWN).toBe('number');
      expect(typeof SearDocumentType.SEAR_DOC).toBe('number');
      expect(typeof SearDocumentType.SEAR_SHEET).toBe('number');
    });

    it('should have sequential numeric values', () => {
      expect(SearDocumentType.UNKNOWN).toBe(0);
      expect(SearDocumentType.SEAR_DOC).toBe(1);
      expect(SearDocumentType.SEAR_SHEET).toBe(2);
      expect(SearDocumentType.SEAR_TABLE).toBe(3);
      expect(SearDocumentType.SEAR_SLIDE).toBe(4);
      expect(SearDocumentType.SEAR_MIND).toBe(5);
      expect(SearDocumentType.SEAR_FLOW).toBe(6);
    });

    it('should have all document type values', () => {
      const allDocTypes = [
        SearDocumentType.UNKNOWN,
        SearDocumentType.SEAR_DOC,
        SearDocumentType.SEAR_SHEET,
        SearDocumentType.SEAR_TABLE,
        SearDocumentType.SEAR_SLIDE,
        SearDocumentType.SEAR_MIND,
        SearDocumentType.SEAR_FLOW,
      ];
      expect(allDocTypes).toHaveLength(7);
    });

    it('should be usable in switch statements', () => {
      const docType: number = SearDocumentType.SEAR_TABLE;
      let result = '';

      switch (docType) {
        case SearDocumentType.SEAR_TABLE:
          result = 'table';
          break;
        case SearDocumentType.SEAR_SHEET:
          result = 'sheet';
          break;
        default:
          result = 'unknown';
      }

      expect(result).toBe('table');
    });

    it('should support type checking in conditionals', () => {
      const docType: number = SearDocumentType.SEAR_SHEET;

      expect(docType === SearDocumentType.SEAR_SHEET).toBe(true);
      expect(docType === SearDocumentType.SEAR_TABLE).toBe(false);
    });
  });

  describe('Real-world usage scenarios', () => {
    it('should support document type classification', () => {
      const documents = [
        { id: 'doc1', type: SearDocumentType.SEAR_DOC },
        { id: 'sheet1', type: SearDocumentType.SEAR_SHEET },
        { id: 'table1', type: SearDocumentType.SEAR_TABLE },
      ];

      const sheets = documents.filter((d) => d.type === SearDocumentType.SEAR_SHEET);
      expect(sheets).toHaveLength(1);
      expect(sheets[0].id).toBe('sheet1');
    });

    it('should support state management with built-in state names', () => {
      const stateStore = {
        [BuildInStateName.CORE_STATE]: { data: [], cursor: 0 },
        [BuildInStateName.COLUMN_SHAPE_STATE]: { widths: [] },
        [BuildInStateName.ROW_SHAPE_STATE]: { heights: [] },
      };

      expect(stateStore[BuildInStateName.CORE_STATE].data).toBeDefined();
      expect(stateStore[BuildInStateName.COLUMN_SHAPE_STATE].widths).toBeDefined();
      expect(stateStore[BuildInStateName.ROW_SHAPE_STATE].heights).toBeDefined();
    });

    it('should support document factory based on type', () => {
      const createDocument = (type: number) => {
        switch (type) {
          case SearDocumentType.SEAR_DOC:
            return { type: 'Document', content: '' };
          case SearDocumentType.SEAR_SHEET:
            return { type: 'Spreadsheet', data: [] };
          case SearDocumentType.SEAR_TABLE:
            return { type: 'Table', rows: [] };
          default:
            return { type: 'Unknown', data: null };
        }
      };

      const doc = createDocument(SearDocumentType.SEAR_SHEET);
      expect(doc.type).toBe('Spreadsheet');
    });

    it('should support plugin key generation with imports', () => {
      const tablePluginKey = new SearKey('table-plugin');
      const editorPluginKey = new SearKey('editor-plugin');

      expect(tablePluginKey.key).toContain('table-plugin');
      expect(editorPluginKey.key).toContain('editor-plugin');
      expect(tablePluginKey.key).not.toBe(editorPluginKey.key);
    });

    it('should support module initialization logging', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      printNameAndVersion('@searsuite/sear-foundation-common', '0.0.1');

      expect(consoleSpy).toHaveBeenCalled();
      const message = consoleSpy.mock.calls[0][0];
      expect(message).toContain('@searsuite/sear-foundation-common');
      expect(message).toContain('v0.0.1');

      consoleSpy.mockRestore();
    });
  });

  describe('Export consistency', () => {
    it('should maintain consistent enum naming conventions', () => {
      const stateNames = Object.values(BuildInStateName).filter((v) => typeof v === 'string');
      stateNames.forEach((name) => {
        expect(name).toMatch(/^[A-Z_]+$/);
      });
    });

    it('should have no conflicting export names', () => {
      const exports = {
        BuildInStateName,
        SearDocumentType,
        SearKey,
        printNameAndVersion,
      };

      const names = Object.keys(exports);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });

    it('should support destructuring imports', () => {
      // This tests that all exports can be destructured
      expect(() => {
        const {
          BuildInStateName: StateNames,
          SearDocumentType: DocTypes,
          SearKey: KeyClass,
          printNameAndVersion: printVersion,
        } = {
          BuildInStateName,
          SearDocumentType,
          SearKey,
          printNameAndVersion,
        };

        expect(StateNames).toBeDefined();
        expect(DocTypes).toBeDefined();
        expect(KeyClass).toBeDefined();
        expect(printVersion).toBeDefined();
      }).not.toThrow();
    });

    it('should support namespace imports', () => {
      // Verify all exports can be used together
      const stateKey = new SearKey('state');
      const docType = SearDocumentType.SEAR_TABLE;
      const stateName = BuildInStateName.CORE_STATE;

      expect(stateKey.key).toBeDefined();
      expect(docType).toBeDefined();
      expect(stateName).toBe('CORE_STATE');
    });
  });
});
