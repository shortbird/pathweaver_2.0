/**
 * Jest setup - runs before each test file.
 * Mocks native modules that are unavailable in the Jest environment.
 */

// Note: @testing-library/jest-native is deprecated.
// Use built-in matchers from @testing-library/react-native v13+ instead.

// ── @supabase/supabase-js (used by supabaseClient.ts for OAuth) ──
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      signInWithOAuth: jest.fn(),
      signOut: jest.fn(),
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    },
  })),
}));

// ── expo-secure-store ──
jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  getItemAsync: jest.fn().mockResolvedValue(null),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

// ── expo-image-picker ──
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  launchCameraAsync: jest.fn().mockResolvedValue({ canceled: true, assets: [] }),
  launchImageLibraryAsync: jest.fn().mockResolvedValue({ canceled: true, assets: [] }),
}));

// ── expo-haptics ──
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
}));

// ── expo-splash-screen ──
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(),
  hideAsync: jest.fn(),
}));

// ── expo-router ──
const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn().mockReturnValue(false),
};
jest.mock('expo-router', () => ({
  router: mockRouter,
  useRouter: () => mockRouter,
  useLocalSearchParams: jest.fn().mockReturnValue({}),
  useSegments: jest.fn().mockReturnValue([]),
  useFocusEffect: jest.fn(),
  Stack: { Screen: () => null },
  Redirect: () => null,
  Link: ({ children }: any) => children,
}));

// ── @react-navigation/native (useScrollToTop needs a navigation context that
//    isn't present in render() without wrapping a NavigationContainer) ──
jest.mock('@react-navigation/native', () => ({
  useScrollToTop: jest.fn(),
  useNavigation: jest.fn(() => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    setOptions: jest.fn(),
  })),
  useIsFocused: jest.fn(() => true),
}));

// ── expo-font ──
jest.mock('expo-font', () => ({
  useFonts: jest.fn().mockReturnValue([true, null]),
  loadAsync: jest.fn(),
}));

// ── @expo-google-fonts/poppins ──
jest.mock('@expo-google-fonts/poppins', () => ({
  Poppins_400Regular: 'Poppins_400Regular',
  Poppins_500Medium: 'Poppins_500Medium',
  Poppins_600SemiBold: 'Poppins_600SemiBold',
  Poppins_700Bold: 'Poppins_700Bold',
}));

// ── @expo/vector-icons ──
jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return {
    Ionicons: (props: any) => <Text testID={`icon-${props.name}`}>{props.name}</Text>,
  };
});

// ── expo-camera ──
jest.mock('expo-camera', () => ({
  Camera: 'Camera',
  CameraView: 'CameraView',
  useCameraPermissions: jest.fn().mockReturnValue([{ granted: true }, jest.fn()]),
}));

// ── expo-audio (VoiceRecorder pulls this in; native module unavailable in Jest) ──
jest.mock('expo-audio', () => ({
  AudioModule: { requestRecordingPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }) },
  RecordingPresets: { HIGH_QUALITY: {} },
  useAudioRecorder: () => ({
    prepareToRecordAsync: jest.fn(),
    record: jest.fn(),
    stop: jest.fn(),
    uri: null,
  }),
  useAudioPlayer: () => ({ play: jest.fn(), pause: jest.fn(), seekTo: jest.fn() }),
  useAudioRecorderState: () => ({ isRecording: false, durationMillis: 0 }),
  setAudioModeAsync: jest.fn(),
}));

// ── expo-web-browser (used by Supabase OAuth helper imported via authStore.web) ──
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn().mockResolvedValue({ type: 'cancel' }),
  maybeCompleteAuthSession: jest.fn(),
  dismissAuthSession: jest.fn(),
  WebBrowserResultType: { CANCEL: 'cancel', SUCCESS: 'success' },
}));

// ── expo-video ──
jest.mock('expo-video', () => ({
  VideoView: 'VideoView',
  useVideoPlayer: jest.fn(),
}));

// ── expo-constants ──
// __esModule + default so `import Constants from 'expo-constants'` resolves to
// the inner object (matching real babel interop), not the module wrapper.
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: {}, version: '1.0.0' }, nativeBuildVersion: '42' },
}));

// ── expo-device (diagnostics collector) ──
jest.mock('expo-device', () => ({
  osVersion: '18.0',
  modelName: 'iPhone Test',
}));

// ── expo-sensors (shake-to-report) ──
jest.mock('expo-sensors', () => ({
  Accelerometer: {
    setUpdateInterval: jest.fn(),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    removeAllListeners: jest.fn(),
  },
}));

// ── react-native-view-shot (bug-report screenshot) ──
jest.mock('react-native-view-shot', () => ({
  captureScreen: jest.fn().mockResolvedValue('file:///tmp/screenshot.jpg'),
  captureRef: jest.fn().mockResolvedValue('file:///tmp/screenshot.jpg'),
}));

// ── @sentry/react-native (crash reporting; shim falls back to no-op without DSN) ──
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(() => 'evt-test'),
  setUser: jest.fn(),
}), { virtual: true });

// ── posthog-react-native ──
jest.mock('posthog-react-native', () => ({
  PostHogProvider: ({ children }: any) => children,
  usePostHog: () => ({
    capture: jest.fn(),
    identify: jest.fn(),
    reset: jest.fn(),
  }),
}));

// ── react-native-safe-area-context ──
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: (props: any) => <View {...props} />,
    SafeAreaProvider: (props: any) => <View {...props} />,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

// ── react-native-worklets (must be mocked BEFORE reanimated) ──
jest.mock('react-native-worklets', () => ({
  WorkletsModule: {},
  createWorkletRuntime: jest.fn(),
}));

// ── react-native-reanimated ──
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: {
      createAnimatedComponent: (component: any) => component,
      call: jest.fn(),
      Value: jest.fn(),
      event: jest.fn(),
      add: jest.fn(),
      eq: jest.fn(),
      set: jest.fn(),
      cond: jest.fn(),
      interpolate: jest.fn(),
      View,
      ScrollView: View,
      FlatList: View,
      Extrapolation: { CLAMP: 'clamp' },
      useAnimatedStyle: () => ({}),
      useSharedValue: (v: any) => ({ value: v }),
      withTiming: (v: any) => v,
      withSpring: (v: any) => v,
      withDelay: (_: any, v: any) => v,
      FadeIn: { duration: () => ({ delay: () => ({}) }) },
      FadeOut: { duration: () => ({}) },
      SlideInDown: { duration: () => ({}) },
      SlideOutDown: { duration: () => ({}) },
      Layout: {},
    },
    useAnimatedStyle: () => ({}),
    useSharedValue: (v: any) => ({ value: v }),
    withTiming: (v: any) => v,
    withSpring: (v: any) => v,
    withDelay: (_: any, v: any) => v,
    Easing: { bezier: jest.fn() },
    FadeIn: { duration: () => ({ delay: () => ({}) }) },
    FadeOut: { duration: () => ({}) },
    SlideInDown: { duration: () => ({}) },
    SlideOutDown: { duration: () => ({}) },
    Layout: {},
    createAnimatedComponent: (component: any) => component,
  };
});

// ── react-native-gesture-handler ──
jest.mock('react-native-gesture-handler', () => {
  const { View, TouchableOpacity } = require('react-native');
  return {
    GestureHandlerRootView: View,
    PanGestureHandler: View,
    TapGestureHandler: View,
    TouchableOpacity,
    State: {},
    Directions: {},
  };
});

// ── react-native-screens ──
jest.mock('react-native-screens', () => ({
  enableScreens: jest.fn(),
  Screen: 'Screen',
  ScreenContainer: 'ScreenContainer',
}));

// ── @react-native-community/datetimepicker ──
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');

// ── react-native-mmkv ──
// Package was dropped from package.json; use { virtual: true } so Jest doesn't try
// to resolve it on disk. Any code that still imports from the module gets this shim.
jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => ({
    getString: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    contains: jest.fn().mockReturnValue(false),
  })),
}), { virtual: true });

// ── Suppress noisy warnings ──
const originalWarn = console.warn;
console.warn = (...args: any[]) => {
  const msg = typeof args[0] === 'string' ? args[0] : '';
  if (
    msg.includes('NativeWind') ||
    msg.includes('Animated') ||
    msg.includes('useNativeDriver')
  ) return;
  originalWarn(...args);
};
