/**
 * Eagerly install the ML Kit document-scanner module at app-install time.
 *
 * The OS document scanner (react-native-document-scanner-plugin →
 * `play-services-mlkit-document-scanner`) ships its UI/model as an OPTIONAL
 * Google Play Services module that is NOT bundled in the APK. By default that
 * module is fetched on-demand the first time `getStartScanIntent()` runs, which
 * can fail ("Could not start document scanner…") on first use / flaky networks.
 *
 * Google's recommended fix is to declare the dependency in the manifest so Play
 * Services downloads it right after the app is installed:
 *   <meta-data android:name="com.google.mlkit.vision.DEPENDENCIES"
 *              android:value="document_ui" />
 * The bundled plugin's own Expo config plugin only sets the iOS camera-usage
 * string and never adds this, so we add it ourselves. (The runtime CAMERA
 * permission gate is handled separately in services/documentScanner.ts.)
 *
 * IMPORTANT — manifest-merger conflict: expo-camera also declares this exact
 * meta-data with `android:value="barcode_ui"`. Two manifests setting the same
 * meta-data to different values makes `:app:processReleaseMainManifest` fail
 * ("Manifest merger failed ... is also present at expo.modules.camera"). ML Kit
 * accepts a comma-separated list, so we request BOTH optional modules and add
 * `tools:replace="android:value"` so our combined value wins the merge without
 * dropping expo-camera's barcode_ui.
 *
 * Native-only: takes effect on the next EAS/prebuild build, NOT via OTA.
 */
const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');

const META_NAME = 'com.google.mlkit.vision.DEPENDENCIES';
// Bundle both: barcode_ui (declared by expo-camera) + document_ui (our scanner).
const META_VALUE = 'barcode_ui,document_ui';

const withMlKitDocScanner = (config) =>
  withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    // tools:replace needs the tools namespace declared on <manifest>.
    manifest.$ = manifest.$ || {};
    if (!manifest.$['xmlns:tools']) {
      manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app['meta-data'] = app['meta-data'] || [];

    let item = app['meta-data'].find(
      (e) => e.$ && e.$['android:name'] === META_NAME,
    );
    if (!item) {
      item = { $: { 'android:name': META_NAME } };
      app['meta-data'].push(item);
    }
    item.$['android:value'] = META_VALUE;
    // Override the value expo-camera contributes so the merge doesn't conflict.
    item.$['tools:replace'] = 'android:value';
    return cfg;
  });

module.exports = withMlKitDocScanner;
