const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Ensure font files from node_modules (e.g. @expo/vector-icons) are treated as assets
const { assetExts, sourceExts } = config.resolver;
config.resolver.assetExts = [...assetExts, 'ttf', 'otf', 'woff', 'woff2'];

module.exports = config;
