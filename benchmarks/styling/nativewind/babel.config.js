const path = require("path");
const preset = require.resolve("babel-preset-expo", { paths: [path.dirname(require.resolve("expo/package.json"))] });
module.exports = function (api) {
  api.cache(true);
  return { presets: [[preset, { jsxImportSource: "nativewind" }], "nativewind/babel"] };
};
