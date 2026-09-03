// Config Tamagui générée depuis la SOURCE DE TOKENS UNIQUE.
import { createFont, createTamagui, createTokens } from "tamagui";
import { tokens as src } from "../fixture-core/tokens.generated";

const font = createFont({
  family: "System",
  size: { label: src.font.label, body: src.font.body, title: src.font.title, heading: src.font.heading, true: src.font.body },
  weight: { normal: "400", semi: "600", bold: "700", true: "400" },
  lineHeight: { label: src.font.label + 6, body: src.font.body + 6, title: src.font.title + 6, heading: src.font.heading + 8, true: src.font.body + 6 },
});

const tkTokens = createTokens({
  size: { xs: src.space.xs, sm: src.space.sm, md: src.space.md, lg: src.space.lg, xl: src.space.xl, true: src.space.md },
  space: { xs: src.space.xs, sm: src.space.sm, md: src.space.md, lg: src.space.lg, xl: src.space.xl, true: src.space.md },
  radius: { sm: src.radius.sm, md: src.radius.md, lg: src.radius.lg, true: src.radius.md },
  zIndex: { base: 0, true: 0 },
  color: {},
});

export const config = createTamagui({
  tokens: tkTokens,
  fonts: { body: font, heading: font },
  themes: {
    light: { ...src.color.light, background: src.color.light.bg, color: src.color.light.text },
    dark: { ...src.color.dark, background: src.color.dark.bg, color: src.color.dark.text },
  },
});

type AppConfig = typeof config;
declare module "tamagui" {
  interface TamaguiCustomConfig extends AppConfig {}
}
export default config;
