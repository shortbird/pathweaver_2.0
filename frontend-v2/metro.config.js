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

// Shared cross-app code -- the Terms/Privacy single source of truth, the pillar
// palette -- lives in ../shared, outside this project root. Metro must watch
// that folder so it can serve those files, and resolve the @shared alias to it
// so both frontends read the same definitions.
const sharedRoot = path.resolve(__dirname, '..', 'shared');
config.watchFolders = [...(config.watchFolders || []), sharedRoot];

// @supabase/supabase-js uses ws (WebSocket) which references Node built-ins.
// On web, the native WebSocket API is used; on native, we shim these out.
config.resolver.unstable_enablePackageExports = false;

const nativeWindConfig = withNativeWind(config, { input: './global.css' });

// Map the @shared alias to ../shared. Applied AFTER withNativeWind so it
// composes with (and is not clobbered by) any resolver NativeWind installs;
// we delegate to the previous resolveRequest for everything else.
//
// This pointed at shared/legal only, under the name @legal, until 2026-09-03.
// Widening it to the whole folder is what lets anything OTHER than the legal
// copy be shared between the two apps (QF-01) -- the narrow alias was the
// reason nothing else could be.
//
// We can't use resolver.extraNodeModules here: Metro parses "@shared/..." as a
// scoped package name (@scope/pkg), so it looks up the key "@shared/pillars"
// instead of "@shared" and the alias never matches. A resolveRequest hook maps
// the prefix explicitly and is not subject to that scope-parsing quirk.
//
// FOUR CONFIGS DEFINE THIS ALIAS -- here, tsconfig.json, jest.config.js and
// v1's vite.config.js -- and none of them can see the other three.
// src/__tests__/sharedAlias.test.ts fails if they stop agreeing.
const ALIAS_PREFIX = '@shared/';
const upstreamResolveRequest = nativeWindConfig.resolver.resolveRequest;
nativeWindConfig.resolver.resolveRequest = (context, moduleName, platform) => {
  const delegate = upstreamResolveRequest || context.resolveRequest;
  if (moduleName === '@shared' || moduleName.startsWith(ALIAS_PREFIX)) {
    const sub = moduleName === '@shared' ? 'index' : moduleName.slice(ALIAS_PREFIX.length);
    const target = path.join(sharedRoot, sub);
    return delegate(context, target, platform);
  }
  return delegate(context, moduleName, platform);
};

module.exports = nativeWindConfig;
