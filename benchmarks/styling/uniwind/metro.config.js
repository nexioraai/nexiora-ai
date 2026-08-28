const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");
const path = require("path");
const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, "..", "fixture-core")];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];
module.exports = withUniwindConfig(config, { cssEntryFile: "./global.css" });
