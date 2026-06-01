// @ts-nocheck
// Workaround for Windows ESM URL scheme bug in Metro
// Node's ESM loader rejects C:\ paths; this file uses CommonJS require() only
//
// Sentry: getSentryExpoConfig wraps Expo's getDefaultConfig and adds the
// source-map serializer so JS stack traces uploaded during EAS builds can be
// symbolicated. It's a drop-in replacement for getDefaultConfig.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const { withNativeWind } = require('nativewind/metro');

const config = getSentryExpoConfig(__dirname);

// @supabase/supabase-js uses ws (WebSocket) which references Node built-ins.
// On web, the native WebSocket API is used; on native, we shim these out.
config.resolver.unstable_enablePackageExports = false;

module.exports = withNativeWind(config, { input: './global.css' });
