// @ts-nocheck
// Workaround for Windows ESM URL scheme bug in Metro
// Node's ESM loader rejects C:\ paths; this file uses CommonJS require() only
//
// Sentry: getSentryExpoConfig wraps Expo's getDefaultConfig and adds the
// source-map serializer so JS stack traces uploaded during EAS builds can be
// symbolicated. It's a drop-in replacement for getDefaultConfig.
const path = require('path');
const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const { withNativeWind } = require('nativewind/metro');

const config = getSentryExpoConfig(__dirname);

// Shared legal content (Terms/Privacy single source of truth) lives in
// ../shared, outside this project root. Metro must watch that folder so it can
// serve those files, and resolve the @legal alias to it so both frontends
// render identical text.
//
// We can't use resolver.extraNodeModules here: Metro parses "@legal/..." as a
// scoped package name (@scope/pkg), so it looks up the key "@legal/privacyPolicy"
// instead of "@legal" and the alias never matches. A resolveRequest hook maps
// the prefix explicitly and is not subject to that scope-parsing quirk.
const sharedRoot = path.resolve(__dirname, '..', 'shared');
config.watchFolders = [...(config.watchFolders || []), sharedRoot];

// @supabase/supabase-js uses ws (WebSocket) which references Node built-ins.
// On web, the native WebSocket API is used; on native, we shim these out.
config.resolver.unstable_enablePackageExports = false;

const nativeWindConfig = withNativeWind(config, { input: './global.css' });

// Map the @legal alias to ../shared/legal. Applied AFTER withNativeWind so it
// composes with (and is not clobbered by) any resolver NativeWind installs;
// we delegate to the previous resolveRequest for everything else.
//
// We can't use resolver.extraNodeModules here: Metro parses "@legal/..." as a
// scoped package name (@scope/pkg), so it looks up the key "@legal/privacyPolicy"
// instead of "@legal" and the alias never matches. A resolveRequest hook maps
// the prefix explicitly and is not subject to that scope-parsing quirk.
const ALIAS_PREFIX = '@legal/';
const upstreamResolveRequest = nativeWindConfig.resolver.resolveRequest;
nativeWindConfig.resolver.resolveRequest = (context, moduleName, platform) => {
  const delegate = upstreamResolveRequest || context.resolveRequest;
  if (moduleName === '@legal' || moduleName.startsWith(ALIAS_PREFIX)) {
    const sub = moduleName === '@legal' ? 'index' : moduleName.slice(ALIAS_PREFIX.length);
    const target = path.join(sharedRoot, 'legal', sub);
    return delegate(context, target, platform);
  }
  return delegate(context, moduleName, platform);
};

module.exports = nativeWindConfig;
