const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Ensure font files from node_modules (e.g. @expo/vector-icons) are treated as assets
const { assetExts, sourceExts } = config.resolver;
const baseAssetExts = [...assetExts, 'ttf', 'otf', 'woff', 'woff2'];

config.transformer = {
	...config.transformer,
	babelTransformerPath: require.resolve('react-native-svg-transformer/expo'),
};
config.resolver.assetExts = baseAssetExts.filter((ext) => ext !== 'svg');
config.resolver.sourceExts = [...new Set([...sourceExts, 'svg'])];

module.exports = config;
