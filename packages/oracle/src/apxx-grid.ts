// GRILLE A++ — INSTRUMENT DÉTERMINISTE (D-039, amendement Phase 9).
//
// La ROADMAP exige qu'après une réparation « la grille soit REJOUÉE et le
// résultat consigné », et qu'« une réparation qui restaure la fonction en
// dégradant la grille soit REFUSÉE ». Une grille tenue à la main ne peut
// pas remplir ce rôle : il faut un instrument qui LIT L'ARTEFACT COMPILÉ et
// rend un verdict machinable, rejouable avant/après.
//
// Ce module est cet instrument. Il évalue le PROJET ÉMIS (pas les sources
// du moteur) : c'est bien ce qu'une réparation pourrait dégrader.
//
// Trois états SEULEMENT (protocole de preuve D-018) : conforme / non
// conforme / non déterminée. Une dimension non mesurable n'est JAMAIS
// conforme par défaut, et aucun seuil n'est assoupli pour obtenir du vert.
import type { ProjectAir } from "@deribfy/air-schema";
// L'enveloppe est la seule source du dépôt qui dise ce qu'un bloc ATTEINT
// réellement — et elle est cliquetée contre le code du runtime
// (`envelope-truth.test.ts`). C'est ce qu'exige la dimension C, et non le
// texte du composant émis.
import { EXECUTION_ENVELOPE_V1 } from "@deribfy/execution-contract";
import { evaluateAntiTemplate, type DomainSample } from "./anti-template.ts";

export type DimensionKey = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";
export type DimensionState = "conforme" | "non_conforme" | "non_determinee";

export interface DimensionVerdict {
  readonly dimension: DimensionKey;
  readonly titre: string;
  readonly state: DimensionState;
  /** Constat MESURÉ, jamais une appréciation. */
  readonly detail: string;
}

export interface ApxxReport {
  /** Vrai si A..G sont toutes conformes (H relève de la Phase 10). */
  readonly passed: boolean;
  readonly dimensions: readonly DimensionVerdict[];
}

/** Seuil WCAG 2.2 AA pour du texte de taille normale — NON négociable. */
export const WCAG_AA_RATIO = 4.5;

/** Cible tactile minimale : max(44 pt iOS, 48 dp Material). */
export const MIN_TAP_TARGET = 48;

// Paires texte/fond RÉELLEMENT rendues par le design system. Chaque
// avant-plan est appliqué comme COULEUR DE TEXTE par au moins une primitive
// et chaque fond est celui du conteneur qui porte ce texte.
//
// RÉVISION v2 (P-007) : `primary` DISPARAÎT de la liste des avant-plans et
// `primaryText` y entre — non pour obtenir du vert, mais parce que l'accent
// a CESSÉ d'être une couleur de texte dans le design system (il ne sert
// plus qu'aux fonds et aux bordures, où le seuil texte ne s'applique pas).
// Cette liste n'est donc pas déclarative : un cliquet (`textForegrounds`)
// la confronte aux couleurs de texte réellement présentes dans la feuille
// de style émise, ce qui rend impossible de retirer une paire gênante sans
// retirer aussi l'usage correspondant.
// Ajout v2 des paires sur `badgeBg` pour les tons d'état : elles sont bien
// rendues (badgeSuccess/Warn/Error) et n'étaient pas mesurées — l'une
// d'elles a d'ailleurs révélé un défaut (warn 4,34:1, corrigé en 1.2.0).
const TEXT_PAIRS: readonly (readonly [string, string])[] = [
  ["text", "bg"],
  ["text", "surface"],
  ["text", "badgeBg"],
  ["muted", "bg"],
  ["muted", "surface"],
  ["muted", "badgeBg"],
  ["primaryText", "bg"],
  ["primaryText", "surface"],
  ["error", "bg"],
  ["error", "surface"],
  ["error", "badgeBg"],
  ["success", "bg"],
  ["success", "surface"],
  ["success", "badgeBg"],
  ["warn", "bg"],
  ["warn", "surface"],
  ["warn", "badgeBg"],
  ["onPrimary", "primary"],
];

/** Avant-plans couverts — confrontés au code émis par le cliquet ci-dessous. */
export const TEXT_FOREGROUNDS: readonly string[] = [...new Set(TEXT_PAIRS.map(([fg]) => fg))].sort();

/**
 * Couleurs de palette RÉELLEMENT utilisées comme couleur de texte dans la
 * feuille de style émise. Sert de contre-épreuve à `TEXT_FOREGROUNDS` :
 * si le design system se met à écrire du texte avec un token non couvert,
 * la grille cesse d'être exhaustive et le cliquet le dit.
 */
export function textForegrounds(styles: string): readonly string[] {
  return [...new Set([...styles.matchAll(/color:\s*c\.(\w+)/g)].map((m) => m[1] ?? ""))].sort();
}

const SCHEMES = ["light", "dark"] as const;

const channel = (v: number): number => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

/** Luminance relative WCAG 2.2 d'une couleur `#rrggbb`. */
export function relativeLuminance(hex: string): number {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Rapport de contraste WCAG 2.2 entre deux couleurs `#rrggbb`. */
export function contrastRatio(fg: string, bg: string): number {
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

const codeFiles = (files: ReadonlyMap<string, string>): readonly (readonly [string, string])[] =>
  [...files.entries()].filter(([p]) => p.endsWith(".ts") || p.endsWith(".tsx"));

const matching = (
  files: ReadonlyMap<string, string>,
  re: RegExp,
  transform: (code: string) => string = (c) => c,
): readonly string[] =>
  codeFiles(files)
    .filter(([, code]) => re.test(transform(code)))
    .map(([path]) => path)
    .sort();

/** Palette d'un schéma, lue DANS L'ARTEFACT émis (pas dans les sources). */
function palette(theme: string, scheme: string): Readonly<Record<string, string>> {
  const block = new RegExp(`"${scheme}":\\s*\\{([^}]*)\\}`, "s").exec(theme);
  const out: Record<string, string> = {};
  for (const m of (block?.[1] ?? "").matchAll(/"(\w+)":\s*"(#[0-9A-Fa-f]{6})"/g)) {
    const key = m[1];
    const value = m[2];
    if (key !== undefined && value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * Échecs de contraste sur le thème ÉMIS. Exporté parce que l'Oracle en fait
 * un contrôle de CONFORMITÉ à part entière (§22 : « accessibilité =
 * conformité (gate + Oracle), pas seulement qualité ») : depuis la v2, une
 * app peut choisir ses couleurs, donc le seuil doit être vérifié sur
 * l'artefact de CHAQUE app, pas une fois pour toutes sur la source.
 */
export function wcagFailures(themeSource: string): { pairs: number; failures: readonly string[] } {
  const failures: string[] = [];
  let pairs = 0;
  for (const scheme of SCHEMES) {
    const p = palette(themeSource, scheme);
    for (const [fg, bg] of TEXT_PAIRS) {
      pairs += 1;
      const fgHex = p[fg];
      const bgHex = p[bg];
      if (fgHex === undefined || bgHex === undefined) {
        failures.push(`${scheme}:${fg}/${bg}=absente`);
        continue;
      }
      const r = contrastRatio(fgHex, bgHex);
      if (r < WCAG_AA_RATIO) failures.push(`${scheme}:${fg}/${bg}=${r.toFixed(2)}`);
    }
  }
  return { pairs, failures };
}

/**
 * Évalue la grille A++ sur un projet COMPILÉ. Fonction PURE.
 * `air` sert aux dimensions dont la conformité dépend de la structure
 * demandée (G : écrans réellement porteurs d'une liste).
 */
export function evaluateApxxGrid(
  files: ReadonlyMap<string, string>,
  air: ProjectAir,
  /**
   * Échantillon CROSS-DOMAIN pour la dimension H (Phase 10). Absent ⇒ H
   * reste NON DÉTERMINÉE : une dimension non mesurée n'est jamais conforme
   * par défaut (D-039-R1).
   */
  crossDomain: readonly DomainSample[] = [],
): ApxxReport {
  const dimensions: DimensionVerdict[] = [];
  const theme = files.get("lib/tokens/theme.generated.ts") ?? "";
  const styles = files.get("lib/primitives/styles.ts") ?? "";
  const blocks = files.get("lib/blocks/components.tsx") ?? "";

  // --- A : ergonomie physique (cibles tactiles).
  const tap = /"tapTarget":\s*(\d+)/.exec(theme);
  const tapValue = tap === null ? 0 : Number.parseInt(tap[1] ?? "0", 10);
  const surfaces = [...styles.matchAll(/minHeight:\s*theme\.size\.tapTarget/g)].length;
  dimensions.push({
    dimension: "A",
    titre: "ergonomie physique",
    state: tapValue >= MIN_TAP_TARGET && surfaces >= 3 ? "conforme" : "non_conforme",
    detail: `tapTarget=${String(tapValue)} (min ${String(MIN_TAP_TARGET)}), ${String(surfaces)} surface(s) contrainte(s)`,
  });

  // --- B : contraste WCAG 2.2 AA, thèmes clair ET sombre.
  const { pairs, failures } = wcagFailures(theme);
  dimensions.push({
    dimension: "B",
    titre: "contraste WCAG 2.2 AA",
    state: pairs > 0 && failures.length === 0 ? "conforme" : "non_conforme",
    detail:
      failures.length === 0
        ? `${String(pairs)} paires / 0 échec`
        : `${String(pairs)} paires / ${String(failures.length)} échec(s) : ${failures.join(", ")}`,
  });

  // --- C : complétude des états sur les blocs consommant des données.
  //     INSTRUMENT CORRIGÉ — D-052 / volet A1 (2026-08-30), NON REPORTABLE.
  //     La version précédente cherchait les chaînes `state.kind === "loading"` …
  //     dans le SOURCE du composant émis. Elle mesurait donc « le composant SAIT
  //     rendre l'état », jamais « l'état EST ATTEINT » — deux propositions
  //     distinctes, et c'est la seconde que le critère nomme (« tout bloc
  //     consommant des données EXPOSE loading/empty/error »).
  //     MESURÉ : le bloc `list` ne rend jamais que `empty`/`ready`, et
  //     l'enveloppe le concédait déjà. Deux organes du dépôt se contredisaient
  //     sur le même objet sans avoir jamais été croisés (APP-D003 / DET-028).
  //     La mesure porte désormais sur l'ATTEIGNABILITÉ. Les blocs concernés sont
  //     ceux que CE document lie à une entité — jamais une liste écrite à la main.
  const REQUIS_C = ["loading", "empty", "error"] as const;
  const consommateurs = [
    ...new Set(
      air.screens.flatMap((s) =>
        s.blocks.filter((b) => b.entityId !== undefined).map((b) => b.blockType),
      ),
    ),
  ].sort();
  const nonAtteignables = consommateurs.flatMap((t) => {
    const atteignables = EXECUTION_ENVELOPE_V1.reachableBlockStates[t] ?? [];
    return REQUIS_C.filter((k) => !atteignables.includes(k)).map((k) => `${t}:${k}`);
  });
  dimensions.push({
    dimension: "C",
    titre: "complétude des états",
    // Aucun bloc consommant des données ⇒ la dimension n'est pas mesurable sur ce
    // document : NON DÉTERMINÉE, jamais conforme par défaut (D-039-R1).
    state:
      consommateurs.length === 0
        ? "non_determinee"
        : nonAtteignables.length === 0
          ? "conforme"
          : "non_conforme",
    detail:
      consommateurs.length === 0
        ? "aucun bloc consommant des données dans ce document"
        : `états requis NON ATTEIGNABLES : ${nonAtteignables.join(", ")} — blocs mesurés : ${consommateurs.join("/")}`,
  });

  // --- D : cohérence — « ZÉRO valeur de style en dur : espacements, rayons,
  //     couleurs, typographie exclusivement issus des tokens » (grille D-039).
  //     INSTRUMENT RENFORCÉ EN PHASE 10 : la version initiale ne cherchait
  //     que les couleurs hexadécimales et déclarait donc D conforme alors
  //     que trois des quatre familles nommées par le critère n'étaient pas
  //     regardées. Les quatre familles sont désormais mesurées ; les
  //     propriétés de MISE EN PAGE (flex, alignItems, textAlign…) restent
  //     hors périmètre : ce ne sont pas des valeurs de design, et les
  //     tokeniser n'aurait aucun sens.
  const hardcoded: string[] = [];
  for (const [path, code] of codeFiles(files)) {
    if (path === "lib/tokens/theme.generated.ts") continue;
    // couleurs
    for (const m of code.matchAll(/#[0-9A-Fa-f]{6}/g)) hardcoded.push(`${path}:couleur ${m[0]}`);
    // espacements — literal numérique là où un token d'espacement est attendu
    for (const m of code.matchAll(/\b(padding|margin|gap|rowGap|columnGap)[A-Za-z]*:\s*(-?\d+(?:\.\d+)?)/g)) {
      hardcoded.push(`${path}:espacement ${m[1] ?? ""}=${m[2] ?? ""}`);
    }
    // rayons
    for (const m of code.matchAll(/\bborderRadius:\s*(-?\d+(?:\.\d+)?)/g)) {
      hardcoded.push(`${path}:rayon ${m[1] ?? ""}`);
    }
    // typographie
    for (const m of code.matchAll(/\b(fontSize|fontWeight|letterSpacing|lineHeight):\s*"?(-?[\d.]+)"?/g)) {
      hardcoded.push(`${path}:typographie ${m[1] ?? ""}=${m[2] ?? ""}`);
    }
  }
  dimensions.push({
    dimension: "D",
    titre: "cohérence (zéro style en dur)",
    state: hardcoded.length === 0 ? "conforme" : "non_conforme",
    detail:
      hardcoded.length === 0
        ? "0 valeur en dur (couleurs, espacements, rayons, typographie)"
        : `${String(hardcoded.length)} valeur(s) en dur : ${[...new Set(hardcoded)].slice(0, 6).join(", ")}`,
  });

  // --- E : typographie — rien n'empêche l'agrandissement système.
  const eOffenders = [
    ...matching(files, /allowFontScaling\s*=\s*\{?\s*false/),
    ...matching(files, /numberOfLines/),
    ...matching(files, /lineHeight\s*:\s*\d/),
    ...matching(files, /(?<![a-zA-Z])height\s*:\s*\d/, (c) => c.replace(/minHeight\s*:\s*[^,\n]+/g, "")),
  ];
  const fontScale = /"font":\s*\{([^}]*)\}/s.exec(theme);
  const sizes = [...(fontScale?.[1] ?? "").matchAll(/"(\w+)":\s*(\d+)/g)].map((m) =>
    Number.parseInt(m[2] ?? "0", 10),
  );
  const strictlyIncreasing = sizes.length >= 4 && sizes.every((v, i) => i === 0 || v > (sizes[i - 1] ?? 0));
  dimensions.push({
    dimension: "E",
    titre: "typographie",
    state: eOffenders.length === 0 && strictlyIncreasing ? "conforme" : "non_conforme",
    detail:
      eOffenders.length === 0
        ? `échelle strictement croissante (${sizes.join(" < ")}), 0 verrou d'agrandissement`
        : [...new Set(eOffenders)].join(", "),
  });

  // --- F : internationalisation — propriétés LOGIQUES exclusivement.
  const physical = matching(files, /margin(Left|Right)|padding(Left|Right)|textAlign:\s*"(left|right)"/);
  dimensions.push({
    dimension: "F",
    titre: "internationalisation / RTL",
    state: physical.length === 0 ? "conforme" : "non_conforme",
    detail: physical.length === 0 ? "0 propriété physique" : physical.join(", "),
  });

  // --- G : virtualisation — aucune liste dans un défileur de même axe.
  const listScreens = air.screens.filter((s) => s.blocks.some((b) => b.blockType === "list"));
  const wrapped = listScreens
    .filter((s) => (files.get(`screens/${s.id}.tsx`) ?? "").includes("ScrollView"))
    .map((s) => s.id);
  const bounded = blocks.includes("fill");
  dimensions.push({
    dimension: "G",
    titre: "fluidité perçue / virtualisation",
    state: wrapped.length === 0 && bounded ? "conforme" : "non_conforme",
    detail:
      wrapped.length === 0
        ? `${String(listScreens.length)} écran(s) à liste, 0 encapsulé dans un ScrollView, parent borné=${String(bounded)}`
        : `écrans à liste encapsulés : ${wrapped.join(", ")}`,
  });

  // --- H : variété anti-template (§22) — mesurable dès 2 domaines.
  const anti = evaluateAntiTemplate(crossDomain);
  dimensions.push({
    dimension: "H",
    titre: "variété anti-template",
    state: anti.state,
    detail:
      crossDomain.length === 0
        ? "aucun échantillon cross-domain fourni — jamais conforme par défaut"
        : anti.detail,
  });

  const gating = dimensions.filter((d) => d.dimension !== "H");
  return { passed: gating.every((d) => d.state === "conforme"), dimensions };
}

/**
 * Comparateur de NON-RÉGRESSION (amendement A++ de la Phase 9) : renvoie
 * les dimensions dégradées entre deux évaluations. Une réparation qui en
 * dégrade une seule est refusée — indépendamment de l'état initial, qui
 * peut légitimement porter des dettes ouvertes.
 */
export function apxxRegressions(before: ApxxReport, after: ApxxReport): readonly DimensionKey[] {
  const rank: Readonly<Record<DimensionState, number>> = {
    non_conforme: 0,
    non_determinee: 1,
    conforme: 2,
  };
  const byKey = new Map(before.dimensions.map((d) => [d.dimension, d]));
  return after.dimensions
    .filter((d) => {
      const previous = byKey.get(d.dimension);
      return previous !== undefined && rank[d.state] < rank[previous.state];
    })
    .map((d) => d.dimension);
}
