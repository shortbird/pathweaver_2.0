// @ts-nocheck
// Workaround for Windows ESM URL scheme bug in Metro
// Node's ESM loader rejects C:\ paths; this file uses CommonJS require() only
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: './global.css' });
