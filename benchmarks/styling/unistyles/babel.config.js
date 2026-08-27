const path = require("path");
// babel-preset-expo est imbriqué sous expo/node_modules (Expo 57) — résolution explicite [mesuré].
const preset = require.resolve("babel-preset-expo", { paths: [path.dirname(require.resolve("expo/package.json"))] });
module.exports = function (api) {
  api.cache(true);
  return { presets: [preset], plugins: [["react-native-unistyles/plugin", { root: "src" }]] };
};
