// ESLint flat config for the web app.
//
// Why this file exists: web/package.json carried an `eslintConfig` block for a
// long time that had NEVER executed. eslint was not a dependency, there was no
// `lint` script, and the block `extends: ["react-app"]` -- a Create React App
// preset, in a project that is Vite and has never had react-scripts. So two
// rules, one of them a security control, read as enforced and were not (CI-03).
//
// The rule set mirrors mobile/eslint.config.js, which is eslint-config-expo
// plus unused-imports. eslint-config-expo itself cannot be used here: it pulls
// in eslint-plugin-expo and React Native globals for an app that is neither.
// What is reproduced instead is its *rules* -- expo's `utils/core.js` and
// `utils/react.js`, verbatim -- so a rule that fires in one app fires in the
// other. The two apps are permanent siblings, so their linters should agree.
//
// Two rules are ours rather than expo's, and both used to live as regex
// assertions in src/__tests__/lintRules.test.js:
//
//   no-console          -- console.warn/error stay allowed; they are how the app
//                          reports real problems. logger.debug replaces .log.
//   no-restricted-syntax -- the C2 security control. Auth tokens live in memory
//                          plus httpOnly cookies (docs/ADR-001-token-storage.md).
//                          One localStorage.setItem('access_token', ...) undoes
//                          that for every user on the machine.
//
// Those two are `error`. Everything else inherited from expo keeps expo's
// severity, which for most of the codebase-shaped rules is `warn`. The counts
// are ratcheted by src/__tests__/eslintRatchet.test.js -- this codebase has
// 273k lines that have never been linted, and fixing them all was never the
// point. The point is that the number stops growing.
//
// Run with `npm run lint`.
const js = require('@eslint/js');
const globals = require('globals');
const pluginReact = require('eslint-plugin-react');
const pluginReactHooks = require('eslint-plugin-react-hooks');
const pluginImport = require('eslint-plugin-import');
const unusedImports = require('eslint-plugin-unused-imports');
const tsParser = require('@typescript-eslint/parser');

/** The credential keys that must never reach web storage (C2 / ADR-001). */
const BANNED_STORAGE_KEYS = [
  'access_token',
  'refresh_token',
  'app_access_token',
  'app_refresh_token',
  'user',
  'original_admin_token',
  'masquerade_token',
  'session_encryption_key',
].join('|');

/**
 * Matches `localStorage.setItem('access_token', ...)` and the sessionStorage
 * twin. Selector rather than regex, so a commented-out call or a mention in a
 * docstring is not a finding -- which the regex version in lintRules.test.js
 * had to strip comments by hand to avoid.
 */
const noCredentialsInWebStorage = ['localStorage', 'sessionStorage'].map((object) => ({
  selector:
    `CallExpression[callee.object.name='${object}'][callee.property.name='setItem']`
    + `[arguments.0.value=/^(${BANNED_STORAGE_KEYS})$/]`,
  message:
    'C2 security: never persist auth tokens, the user object, or the legacy '
    + 'encryption key in web storage. Tokens live in memory + httpOnly cookies '
    + 'via tokenStore (services/api.ts). See docs/ADR-001-token-storage.md.',
}));

module.exports = [
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'public/**',
      '.vite/**',
    ],
  },

  js.configs.recommended,
  pluginImport.flatConfigs.recommended,
  pluginImport.flatConfigs.errors,

  {
    files: ['**/*.{js,jsx,mjs,cjs,ts,tsx}'],

    plugins: {
      react: pluginReact,
      'react-hooks': pluginReactHooks,
      'unused-imports': unusedImports,
    },

    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2021,
        process: 'readonly',
        // Injected by vite.config.js's `define`, so it exists at runtime but
        // in no lib -- without this it reads as an undefined global.
        __APP_VERSION__: 'readonly',
      },
      parserOptions: {
        ecmaFeatures: { impliedStrict: true, jsx: true },
      },
    },

    settings: {
      react: { version: 'detect' },
      'import/extensions': ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx'],
      'import/resolver': {
        // The typescript resolver, not the node one, because it reads
        // tsconfig.json's `paths` -- which is where the `@shared/*` alias is
        // declared. Without it every `@shared/...` import (the pillar palette,
        // the role and subject vocabularies, the legal copy) reads as
        // unresolved, and import/no-unresolved becomes noise people turn off.
        typescript: { project: './tsconfig.json' },
        node: { extensions: ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx'] },
      },
      // Without this, import/named and import/namespace try to read every
      // dependency's .d.ts with the default JS parser, fail on the first
      // `interface`, and report ~3,900 phantom "not found in 'react'" errors.
      // The rules are only worth having if they parse what they resolve to.
      'import/parsers': {
        '@typescript-eslint/parser': ['.ts', '.tsx', '.d.ts', '.mts', '.cts'],
      },
    },

    rules: {
      // --- expo utils/core.js, verbatim -------------------------------------
      eqeqeq: ['warn', 'smart'],
      'no-dupe-args': 'error',
      'no-dupe-class-members': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-empty-character-class': 'warn',
      'no-empty-pattern': 'warn',
      'no-extend-native': 'warn',
      'no-extra-bind': 'warn',
      'no-redeclare': 'warn',
      'no-undef': 'error',
      'no-unreachable': 'warn',
      'no-unsafe-negation': 'warn',
      'no-unused-expressions': ['warn', { allowShortCircuit: true, enforceForJSX: true }],
      'no-unused-labels': 'warn',
      'no-with': 'warn',
      'unicode-bom': ['warn', 'never'],
      'use-isnan': 'error',
      'valid-typeof': 'error',
      'import/first': 'warn',
      'import/default': 'off',
      'no-var': 'error',

      // --- expo utils/react.js, verbatim ------------------------------------
      ...pluginReact.configs.recommended.rules,
      ...pluginReactHooks.configs.recommended.rules,
      'react/no-unknown-property': 'warn',
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/jsx-no-target-blank': 'off',
      'react/no-this-in-sfc': 'warn',

      // --- mobile/eslint.config.js's own overrides, verbatim ----------------
      // unused-imports handles (and can autofix) dead imports; keep the
      // overlapping core rule off so they don't double-report.
      'no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        { vars: 'all', varsIgnorePattern: '^_', args: 'after-used', argsIgnorePattern: '^_' },
      ],
      // The react-hooks v6 lint family (set-state-in-effect, refs, purity, ...)
      // flags a large number of pre-existing patterns. Real signal, but not
      // adoptable as hard errors in one step -- keep them visible as warnings
      // and ratchet. rules-of-hooks stays an error: those are actual bugs.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/use-memo': 'warn',
      'react/no-unescaped-entities': 'warn',
      'react/no-children-prop': 'warn',

      // --- the two rules package.json declared and never ran (CI-03) --------
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-restricted-syntax': ['error', ...noCredentialsInWebStorage],
    },
  },

  {
    // TypeScript files -- currently the API boundary (src/services/api.ts and
    // src/types/) and nothing else. The rest of the app is untyped JSX and
    // stays that way; see tsconfig.json for why.
    files: ['**/*.{ts,tsx}'],
    languageOptions: { parser: tsParser },
    rules: {
      // TypeScript resolves these itself, and the core rules get them wrong on
      // type-only syntax (enums, overloads, declaration merging).
      'no-undef': 'off',
      'no-redeclare': 'off',
      'no-dupe-class-members': 'off',
    },
  },

  {
    // The logger IS the console wrapper. Banning console here would mean
    // banning the implementation of the thing everything else is told to use.
    files: ['src/utils/logger.js'],
    rules: { 'no-console': 'off' },
  },

  {
    // Tests and setup files run under vitest/node, not in the browser.
    files: [
      '**/*.test.{js,jsx,ts,tsx}',
      '**/__tests__/**',
      'src/tests/**',
      'src/setupTests.js',
      'vitest.setup.js',
    ],
    languageOptions: {
      globals: { ...globals.node, ...globals.vitest },
    },
    rules: {
      'no-console': 'off',
      // Tests seed legacy credentials into localStorage on purpose, to prove
      // that tokenStore's one-time purge removes them. The C2 rule is about
      // shipped code; a fixture that sets up the thing being purged is the
      // rule's evidence, not a violation of it. (The vitest re-implementation
      // this replaced skipped test files wholesale for the same reason.)
      'no-restricted-syntax': 'off',
    },
  },

  {
    // Config and tooling files are CommonJS/node.
    files: ['*.config.js', '*.config.cjs', 'scripts/**/*.{js,mjs,cjs}'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: {
      'no-console': 'off',
    },
  },
];
