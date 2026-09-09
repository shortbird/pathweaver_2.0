/**
 * Pin the Android Gradle wrapper version.
 *
 * `expo prebuild` (and EAS, which prebuilds on its servers) can regenerate the
 * wrapper at a Gradle version that's incompatible with the React Native 0.83
 * gradle plugin — Gradle 9.0 removed `JvmVendorSpec.IBM_SEMERU`, which RNGP
 * references, so the build fails at configuration with:
 *   "Class JvmVendorSpec does not have member field IBM_SEMERU".
 * 8.14.2 is the last known-good version for this project, so pin it here so the
 * pin survives every prebuild (local + EAS).
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const GRADLE_VERSION = '8.14.2';

const withGradleVersion = (config) =>
  withDangerousMod(config, [
    'android',
    (cfg) => {
      const propsPath = path.join(
        cfg.modRequest.platformProjectRoot,
        'gradle',
        'wrapper',
        'gradle-wrapper.properties',
      );
      if (fs.existsSync(propsPath)) {
        const contents = fs.readFileSync(propsPath, 'utf8');
        const pinned = contents.replace(
          /gradle-[\d.]+-(bin|all)\.zip/,
          `gradle-${GRADLE_VERSION}-$1.zip`,
        );
        fs.writeFileSync(propsPath, pinned);
      }
      return cfg;
    },
  ]);

module.exports = withGradleVersion;
