/**
 * Raise every CocoaPods target to the app's iOS deployment floor.
 *
 * Xcode 27 refuses any target whose IPHONEOS_DEPLOYMENT_TARGET is below 15.0.
 * React Native's `react_native_post_install` already lifts each pod's *native*
 * target to the RN minimum, but it skips the resource-bundle targets that some
 * pods generate (SDWebImage-SDWebImage, Sentry-Sentry, RNSVG-RNSVGFilters,
 * ReachabilitySwift-ReachabilitySwift), which still declare 9.0 to 12.4 and
 * fail the build with:
 *   "The iOS Simulator deployment target 'IPHONEOS_DEPLOYMENT_TARGET' is set
 *    to 9.0, but the range of supported deployment target versions is 15.0
 *    to 27.0.x."
 * Walk every target in the Pods project and raise anything below the
 * `platform :ios` floor. Lower targets are only ever raised, never lowered,
 * so this is a no-op on older Xcodes.
 *
 * Native-only: takes effect on the next EAS/prebuild build, NOT via OTA.
 */
const { withPodfile } = require('@expo/config-plugins');

const MARKER = '# withPodDeploymentTarget';

const SNIPPET = `
    ${MARKER}
    floor = (podfile_properties['ios.deploymentTarget'] || '15.1').to_f
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        current = config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'].to_f
        if current < floor
          config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = floor.to_s
        end
      end
    end
`;

const withPodDeploymentTarget = (config) =>
  withPodfile(config, (cfg) => {
    const contents = cfg.modResults.contents;
    if (contents.includes(MARKER)) return cfg;

    const anchor = /^(\s*)post_install do \|installer\|\n/m;
    if (!anchor.test(contents)) {
      throw new Error(
        'withPodDeploymentTarget: could not find `post_install do |installer|` in the Podfile',
      );
    }
    cfg.modResults.contents = contents.replace(anchor, (line) => line + SNIPPET);
    return cfg;
  });

module.exports = withPodDeploymentTarget;
