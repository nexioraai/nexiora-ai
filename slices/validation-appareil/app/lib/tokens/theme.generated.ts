// GÉNÉRÉ par scripts/generate.mjs depuis tokens.json — NE PAS ÉDITER.
// Thème React Native (D-021 : StyleSheet + tokens maison) — données pures,
// aucune dépendance de bibliothèque de styling (ARCHITECTURE §22, D-021 :
// le choix de styling ne fuite jamais dans les contrats ni dans ce module).
export const theme = {
  "color": {
    "light": {
      "bg": "#F6F7F9",
      "surface": "#FFFFFF",
      "text": "#16181D",
      "muted": "#5A616E",
      "primary": "#FA1E49",
      "onPrimary": "#16181D",
      "border": "#D9DDE3",
      "error": "#C42B1C",
      "success": "#1F7A3D",
      "warn": "#866A00",
      "badgeBg": "#EEF1F5",
      "primaryText": "#DC1A40"
    },
    "dark": {
      "bg": "#0A050E",
      "surface": "#17121C",
      "text": "#F2F0F4",
      "muted": "#A49FAC",
      "primary": "#FA1E49",
      "onPrimary": "#16181D",
      "border": "#2E2836",
      "error": "#FF6B5E",
      "success": "#4CC17A",
      "warn": "#E3C25A",
      "badgeBg": "#241E2B",
      "primaryText": "#FA1E49"
    }
  },
  "space": {
    "xxs": 2,
    "xs": 4,
    "sm": 8,
    "md": 12,
    "lg": 16,
    "xl": 24
  },
  "radius": {
    "sm": 6,
    "md": 10,
    "lg": 16
  },
  "font": {
    "label": 12,
    "body": 14,
    "title": 17,
    "heading": 22
  },
  "fontWeight": {
    "semibold": "600",
    "bold": "700"
  },
  "opacity": {
    "disabled": 0.5
  },
  "size": {
    "tapTarget": 48
  }
} as const;
export type SchemeName = keyof typeof theme.color;
export type Palette = (typeof theme.color)[SchemeName];
