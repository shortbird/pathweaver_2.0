/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testMatch: [
    '<rootDir>/src/**/*.test.{ts,tsx}',
    '<rootDir>/app/**/*.test.{ts,tsx}',
  ],
  moduleNameMapper: {
    '^@legal/(.*)$': '<rootDir>/../shared/legal/$1',
    '^@/(.*)$': '<rootDir>/$1',
  },
  setupFiles: [
    '<rootDir>/src/__tests__/setup.tsx',
  ],
  // React-Native component renders (SafeAreaView + gluestack UI + Ionicons) have
  // a heavy cold-start on the FIRST test of a suite. Under CI's parallel-worker
  // contention that first render can exceed Jest's 5s default and flake out a
  // passing test (e.g. bounties/review). 15s gives cold starts enough headroom
  // without letting a genuinely hung test run long.
  testTimeout: 15000,
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(-.*)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@gluestack-ui/.*|nativewind|react-native-css-interop|react-native-reanimated|react-native-gesture-handler|react-native-screens|react-native-safe-area-context|react-native-mmkv|react-native-web|react-native-webview|react-native-worklets|react-native-qrcode-svg|react-native-svg|posthog-react-native|@tanstack/react-query|zustand|axios)/)',
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    'app/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!src/__tests__/**',
  ],
  // RATCHET FLOOR -- these are the coverage numbers we actually have, not the
  // ones we want. They are set 1 point under the 2026-08-13 measurement so a
  // regression fails CI while normal churn does not.
  //
  // Until 2026-08-13 these read 40/50/50/50, which looked like a gate but was
  // not one twice over: CI ran `jest` without --coverage so the threshold never
  // evaluated, and actual coverage had drifted to about half the declared
  // number. Aspiration was mistaken for enforcement for as long as it went
  // unmeasured.
  //
  // Target remains branches 40 / functions 50 / lines 50 / statements 50.
  // Raise these toward it as tests land; never lower them to make CI green.
  coverageThreshold: {
    global: {
      branches: 24,    // measured 24.42 -- target 40
      functions: 23,   // measured 23.75 -- target 50
      lines: 32,       // measured 32.63 -- target 50
      statements: 31,  // measured 31.37 -- target 50
    },
  },
};
