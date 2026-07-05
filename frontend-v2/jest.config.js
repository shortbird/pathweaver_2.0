/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testMatch: [
    '<rootDir>/src/**/*.test.{ts,tsx}',
    '<rootDir>/app/**/*.test.{ts,tsx}',
  ],
  moduleNameMapper: {
    '^@legal/(.*)$': '<rootDir>/../shared/legal/$1',
    // FlashList renders nothing without a measured layout in Jest — map it to a
    // plain eager-rendering stub so screen tests can assert on list content.
    '^@shopify/flash-list$': '<rootDir>/src/__tests__/mocks/flashListMock.tsx',
    '^@/(.*)$': '<rootDir>/$1',
  },
  setupFiles: [
    '<rootDir>/src/__tests__/setup.tsx',
  ],
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
