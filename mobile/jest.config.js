/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testMatch: [
    '<rootDir>/src/**/*.test.{ts,tsx}',
    '<rootDir>/app/**/*.test.{ts,tsx}',
  ],
  moduleNameMapper: {
    '^@shared/(.*)$': '<rootDir>/../shared/$1',
    // shared/ sits ABOVE this project and has no node_modules of its own, so a
    // babel helper injected into a file there resolves by walking up from
    // shared/ -- past the repo root, finding nothing. Only files needing a
    // helper hit it, which is why shared/legal/* worked for months and the
    // first shared module with a default import did not. Pin the lookup here.
    '^@babel/runtime/(.*)$': '<rootDir>/node_modules/@babel/runtime/$1',
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
  // ones we want. They are set just under the last measurement so a regression
  // fails CI while normal churn does not.
  //
  // Until 2026-08-13 these read 40/50/50/50, which looked like a gate but was
  // not one twice over: CI ran `jest` without --coverage so the threshold never
  // evaluated, and actual coverage had drifted to about half the declared
  // number. Aspiration was mistaken for enforcement for as long as it went
  // unmeasured.
  //
  // Re-measured 2026-09-10: 37.94 / 30.67 / 39.35 / 30.01
  // (statements / branches / lines / functions), up about six points from the
  // 2026-08-13 numbers on other sessions' tests -- none of this phase's tests
  // are in this app. The floors below are floor(measured) - 1, which leaves
  // roughly a point of slack for flake without leaving the six points of dead
  // space the old numbers had become.
  //
  // Target remains branches 40 / functions 50 / lines 50 / statements 50.
  // Raise these toward it as tests land; never lower them to make CI green.
  coverageThreshold: {
    global: {
      branches: 29,    // measured 30.67 (was 24) -- target 40
      functions: 29,   // measured 30.01 (was 23) -- target 50
      lines: 38,       // measured 39.35 (was 32) -- target 50
      statements: 36,  // measured 37.94 (was 31) -- target 50
    },
  },
};
