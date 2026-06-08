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
 * Native-only: takes effect on the next EAS/prebuild build, NOT via OTA.
 */
const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');

const META_NAME = 'com.google.mlkit.vision.DEPENDENCIES';
const META_VALUE = 'document_ui';

const withMlKitDocScanner = (config) =>
  withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(app, META_NAME, META_VALUE);
    return cfg;
  });

module.exports = withMlKitDocScanner;
