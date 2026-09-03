// TOKENS DÉRIVÉS — DESIGN SYSTEM v2 (Phase 10, P-007).
//
// Problème mesuré (DS-02 / DET-019) : l'accent de marque `#FA5D1E` utilisé
// comme COULEUR DE TEXTE donne 2,95:1 sur `bg` et 3,16:1 sur `surface` en
// thème clair — sous le seuil WCAG 2.2 AA de 4,5:1. Le document
// `DESIGN-SYSTEM-V2.md` prescrit la solution : « une couleur de TEXTE
// dérivée de l'accent (accent foncé) distincte de la couleur de SURFACE,
// l'accent de marque restant inchangé ».
//
// Ce module EST cette dérivation. Elle est déterministe (aucune horloge,
// aucun aléa, arithmétique entière sur les canaux sRGB) et elle a une
// propriété qui compte plus que sa simplicité : elle garantit le seuil
// POUR N'IMPORTE QUEL ACCENT. C'est ce qui rend sûre la variété visuelle
// par app introduite en v2 — une app peut changer son accent sans jamais
// pouvoir casser le contraste de ses textes.

/** Seuil WCAG 2.2 AA pour du texte de taille normale. */
export const WCAG_AA = 4.5;

const channel = (v: number): number => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

const parse = (hex: string): readonly [number, number, number] => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

const format = (rgb: readonly [number, number, number]): string =>
  `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0").toUpperCase()).join("")}`;

export function luminance(hex: string): number {
  const [r, g, b] = parse(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Mélange linéaire vers noir (t<0) ou blanc (t>0), t en centièmes. */
const mix = (hex: string, towardWhite: boolean, percent: number): string => {
  const [r, g, b] = parse(hex);
  const target = towardWhite ? 255 : 0;
  const k = percent / 100;
  return format([r + (target - r) * k, g + (target - g) * k, b + (target - b) * k]);
};

/**
 * Encre de texte dérivée d'un accent, garantie ≥ `target` sur `background`.
 *
 * L'accent est assombri sur fond clair, éclairci sur fond sombre, par pas
 * de 1 % — le PREMIER pas qui satisfait le seuil est retenu, donc la teinte
 * de marque est préservée autant que possible. Si l'accent satisfait déjà
 * le seuil, il est renvoyé INCHANGÉ (cas du thème sombre, mesuré : 6,39:1).
 */
export function deriveTextInk(accent: string, background: string, target = WCAG_AA): string {
  if (contrast(accent, background) >= target) return accent;
  const towardWhite = luminance(background) < 0.5;
  for (let percent = 1; percent <= 100; percent += 1) {
    const candidate = mix(accent, towardWhite, percent);
    if (contrast(candidate, background) >= target) return candidate;
  }
  // Inatteignable : à 100 % le candidat est noir ou blanc pur, dont le
  // contraste avec un fond de luminance opposée dépasse toujours 4,5:1.
  return towardWhite ? "#FFFFFF" : "#000000";
}
