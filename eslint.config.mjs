import typescriptParser from '@typescript-eslint/parser';

export default [
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/playwright-report/**',
      '**/.generated/**',
      '**/public/api/**',
      '**/src/generated/**',
      '**/test-results/**',
    ],
  },
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      semi: ['error', 'always'],
      'func-names': ['error', 'as-needed'],
      'no-warning-comments': ['error', { terms: ['@ts-ignore', '@ts-expect-error'], location: 'anywhere' }],
    },
  },
];
