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
  coverageThreshold: {
    global: {
      branches: 40,
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },
};
