// @ts-nocheck
// Workaround for Windows ESM URL scheme bug in Metro
// Node's ESM loader rejects C:\ paths; this file uses CommonJS require() only
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// @supabase/supabase-js uses ws (WebSocket) which references Node built-ins.
// On web, the native WebSocket API is used; on native, we shim these out.
config.resolver.unstable_enablePackageExports = false;

module.exports = withNativeWind(config, { input: './global.css' });
