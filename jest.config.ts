export default {
  moduleNameMapper: {
    '^@searsuite/sear-browser-adapters$': '<rootDir>/../searsuite-browser/packages/sear-browser-adapters/src',
    '^@searsuite-test/formula-coverage-cases$': '<rootDir>/scripts/fixtures/formula-coverage-cases.json',
    '^@searsuite/(.*)$': '<rootDir>/packages/$1/src',
  },
  testEnvironment: 'jsdom',
  transform: {
    '^.+.tsx?$': ['ts-jest', {}],
  },
  preset: 'ts-jest',
  setupFiles: ['jest-canvas-mock'],
  modulePathIgnorePatterns: ['<rootDir>/artifacts/'],
};
