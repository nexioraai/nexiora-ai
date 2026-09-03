const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");
let config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, "..", "fixture-core")];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];
config = withNativeWind(config, { input: "./global.css" });
module.exports = config;
