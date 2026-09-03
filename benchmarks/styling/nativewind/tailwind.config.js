// Thème Tailwind généré depuis la SOURCE DE TOKENS UNIQUE (tokens.json).
const tokens = require("../fixture-core/tokens.json");
const px = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, `${v}px`]));
module.exports = {
  content: ["./App.tsx", "./candidate.tsx"],
  darkMode: "class",
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: { light: tokens.color.light, dark: tokens.color.dark },
      spacing: px(tokens.space),
      borderRadius: px(tokens.radius),
      fontSize: px(tokens.font),
    },
  },
};
