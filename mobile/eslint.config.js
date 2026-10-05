// ESLint flat config — eslint-config-expo plus unused-import enforcement.
// The project previously had no linter at all, which let ~95 dead imports
// accumulate with nothing to catch them. Run with `npm run lint`.
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const unusedImports = require('eslint-plugin-unused-imports');

module.exports = defineConfig([
  expoConfig,
  {
    plugins: { 'unused-imports': unusedImports },
    rules: {
      // unused-imports handles (and can autofix) dead imports; keep the
      // overlapping core rule off so they don't double-report.
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        { vars: 'all', varsIgnorePattern: '^_', args: 'after-used', argsIgnorePattern: '^_' },
      ],
      // The react-hooks v6 lint family (set-state-in-effect, refs, purity, …)
      // flags ~220 pre-existing patterns in this codebase. Real signal, but not
      // adoptable as hard errors in one step — keep them visible as warnings
      // and ratchet later. rules-of-hooks stays an error: those are actual bugs.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/use-memo': 'warn',
      'react/no-unescaped-entities': 'warn',
      'react/no-children-prop': 'warn',
    },
  },
  {
    // Sentry 6cbb6c10: prod sends { error: { message, code, timestamp,
    // request_id } }, so `err.response?.data?.error || '...'` handed an object
    // to toast.error / setError and crashed the render ("Objects are not
    // valid as a React child"). Read server errors through apiError.ts.
    files: ['app/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}'],
    ignores: ['src/services/apiError.ts', '**/__tests__/**', '**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[property.name='error'][object.type='MemberExpression'][object.property.name='data'][object.object.type='MemberExpression'][object.object.property.name='response']",
          message:
            "The server error may be an object. Use extractApiError(err, 'fallback').message (or apiErrorBodyMessage(body, fallback)) from src/services/apiError.ts.",
        },
      ],
    },
  },
  {
    ignores: ['dist/*', 'coverage/*', 'e2e/**', '.expo/*'],
  },
]);
