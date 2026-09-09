/**
 * Dynamic Expo config wrapper.
 *
 * Almost everything still lives in app.json as the source of truth — this
 * file just lets us read env vars at config-evaluation time, which a static
 * JSON file can't do.
 *
 * Today we use that for one thing: Android's `googleServicesFile`. The
 * google-services.json sitting in the repo root is gitignored (it has
 * package-scoped API keys we don't want in source control), so it's NOT
 * present on the EAS builder when it clones the repo. Instead we upload
 * the file once as an EAS file environment variable named
 * `GOOGLE_SERVICES_JSON`; EAS materializes it on disk during the build and
 * exposes the path via `process.env.GOOGLE_SERVICES_JSON`. We point Expo at
 * that path so the Google Services Gradle plugin can find the file.
 *
 * Local dev keeps working because we fall back to the relative path
 * `./google-services.json`, which Expo's prebuild can read directly.
 */
const appJson = require('./app.json');

module.exports = ({ config: _runtimeConfig }) => {
  const expo = { ...appJson.expo };

  expo.android = {
    ...expo.android,
    // EAS file env var injects an absolute path; locally fall back to repo file.
    googleServicesFile:
      process.env.GOOGLE_SERVICES_JSON ||
      expo.android?.googleServicesFile ||
      './google-services.json',
  };

  return expo;
};
