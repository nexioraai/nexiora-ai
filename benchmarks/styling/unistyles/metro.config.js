// Fixture P-003 : le noyau partagé vit hors du dossier app.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");
const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, "..", "fixture-core")];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];
module.exports = config;
