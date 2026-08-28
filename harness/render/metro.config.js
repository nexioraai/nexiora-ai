// HARNAIS 3.4 — l'app consomme les VRAIES sources des paquets moteur GELÉS
// (patron watchFolders éprouvé au banc P-003). Le layout ../../packages est
// identique dans le dépôt et dans la copie de build (~/deribfy-bench).
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");
const config = getDefaultConfig(__dirname);
const REPO = path.resolve(__dirname, "..", "..");
config.watchFolders = [path.join(REPO, "packages")];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];
config.resolver.extraNodeModules = {
  "@deribfy/design-tokens": path.join(REPO, "packages", "design-tokens"),
  "@deribfy/primitives": path.join(REPO, "packages", "primitives"),
  "@deribfy/blocks": path.join(REPO, "packages", "blocks"),
};
module.exports = config;
