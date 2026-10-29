import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '.wrangler/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.js'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['eslint.config.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // core/ is the pure deterministic simulation: integers only, no randomness,
    // no clock, no floats. Enforced here so game, solver and tools can never
    // drift apart (Gate 1 — Technical specs).
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'MemberExpression[object.name="Math"][property.name="random"]',
          message: 'core/ is deterministic: no Math.random',
        },
        {
          selector: 'NewExpression[callee.name="Date"]',
          message: 'core/ must not read the clock: no new Date()',
        },
        {
          selector: 'CallExpression[callee.type="MemberExpression"][callee.object.name="Date"]',
          message: 'core/ must not read the clock: no Date.*()',
        },
        {
          selector: 'MemberExpression[object.name="performance"][property.name="now"]',
          message: 'core/ must not read the clock: no performance.now()',
        },
      ],
    },
  },
);
