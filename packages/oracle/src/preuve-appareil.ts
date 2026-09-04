// CANAL DE PREUVE APPAREIL — V3 de `D-135` (2026-09-04).
//
// `D-135` a établi que la grille A++ exige, pour **A**, une « géométrie
// MESURÉE SUR APPAREIL RÉEL » et, pour **G**, une « MESURE SUR APPAREIL »,
// et que l'instrument ne lisait que du source. V2 en a tiré la conséquence :
// A et G ne concluent plus à la conformité. V3 ouvre le seul chemin qui
// puisse les déterminer — la consommation d'une OBSERVATION PHYSIQUE.
//
// RÈGLE FONDATRICE : **ce module ne FABRIQUE jamais une preuve.** Il lit un
// artefact produit par une session physique, ou constate son absence. Aucun
// chemin de ce fichier ne peut rendre `conforme` sans mesure : l'absence,
// l'incomplétude et le rattachement douteux mènent tous à `non_determinee`,
// et une mesure en échec mène à `non_conforme`.
//
// CE QUI EST VÉRIFIABLE ICI, ET CE QUI NE L'EST PAS — dit sans détour :
// `airHash` est RECALCULÉ depuis le document évalué et confronté à celui que
// la preuve déclare : une preuve captée sur une AUTRE application est donc
// rejetée mécaniquement. En revanche `easBuildId` et `artefactSha256` sont
// EXIGÉS et CONSERVÉS pour la traçabilité, mais ne peuvent pas être vérifiés
// dans un processus pur — aucun binaire n'est accessible ici. Cette limite
// est nommée, pas contournée.
import { hashCanonical, type ProjectAir } from "@deribfy/air-schema";

/** Version du contrat d'artefact. Une preuve d'une autre version est refusée. */
export const PREUVE_APPAREIL_SCHEMA = "deribfy.preuve-appareil/1";

/**
 * Cible tactile minimale, en points/dp : `max(44 pt iOS, 48 dp Material)`.
 * Reprend la constante de la grille — le critère n'est PAS redéfini ici.
 */
export const CIBLE_TACTILE_MIN_DP = 48;

/**
 * En deçà de ce nombre de lignes SERVIES, une capture ne dit rien : ni qu'une
 * fenêtre existe, ni qu'elle manque.
 */
export const LIGNES_MIN_POUR_VIRTUALISATION = 6;

/**
 * Fenêtre de rendu par défaut de `VirtualizedList`, EN HAUTEURS D'ÉCRAN.
 *
 * Ce n'est pas un réglage choisi ici : c'est le défaut de la dépendance
 * réellement installée — `@react-native/virtualized-lists@0.86.3`,
 * `VirtualizedListProps.js:333` : `return windowSize ?? 21;` — et la
 * `FlatList` émise par le compilateur **ne le surcharge pas** (aucune prop
 * `windowSize`, `initialNumToRender`, `getItemLayout` ni
 * `removeClippedSubviews` n'est émise). La documentation de la prop l'énonce :
 * « `windowSize={21}` (the default) will render the visible screen area plus
 * up to 10 screens above and 10 below the viewport ».
 *
 * ⚠️ Si l'émetteur venait à poser `windowSize`, cette borne devrait être
 * révisée : elle n'est valable que tant que le défaut s'applique.
 */
export const FENETRE_RENDU_EN_ECRANS = 21;

/** Nœud de hiérarchie UI, au format produit par Maestro (`--debug-output`). */
export interface NoeudHierarchie {
  readonly attributes?: Readonly<Record<string, string>>;
  readonly children?: readonly NoeudHierarchie[];
}

export interface CaptureAppareil {
  /** `A12` alimente la dimension A ; `A13` alimente la dimension G. */
  readonly etape: "A12" | "A13";
  readonly ecranId: string;
  /** Hiérarchie BRUTE. Une capture d'écran seule ne vaut pas preuve (D-135). */
  readonly hierarchie: NoeudHierarchie;
  /**
   * `A13` uniquement — bloc de liste observé et nombre de lignes RÉELLEMENT
   * servies par la source au moment de la capture. Sans lui, la virtualisation
   * n'est pas décidable : « peu de lignes montées » ne veut rien dire si l'on
   * ignore combien il y en avait.
   */
  readonly liste?: { readonly blocId: string; readonly lignesServies: number };
}

export interface PreuveAppareil {
  readonly schema: string;
  readonly capturedAt: string;
  readonly build: {
    readonly easBuildId: string;
    readonly artefactSha256: string;
    /** Hash canonique de l'AIR — SEUL champ de rattachement vérifiable ici. */
    readonly airHash: string;
  };
  readonly appareil: {
    readonly plateforme: "android" | "ios";
    readonly modele: string;
    readonly os: string;
  };
  /** Géométrie de l'écran. `densite` convertit les px des `bounds` en dp. */
  readonly ecran: { readonly largeurPx: number; readonly hauteurPx: number; readonly densite: number };
  /** Insets système RELEVÉS sur l'appareil, en pixels. */
  readonly insets: {
    readonly hautPx: number;
    readonly basPx: number;
    readonly gauchePx: number;
    readonly droitePx: number;
  };
  readonly captures: readonly CaptureAppareil[];
}

export type EtatDimension = "conforme" | "non_conforme" | "non_determinee";

export interface VerdictMesure {
  readonly state: EtatDimension;
  readonly detail: string;
}

export interface LecturePreuve {
  /** Faux ⇒ la preuve est REFUSÉE ; `motifs` dit pourquoi, sans euphémisme. */
  readonly recevable: boolean;
  readonly motifs: readonly string[];
  readonly a: VerdictMesure;
  readonly g: VerdictMesure;
}

interface Rect {
  readonly id: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/** `[x1,y1][x2,y2]` → rectangle. Toute autre forme est ignorée, jamais devinée. */
function lireBounds(id: string, bounds: string): Rect | null {
  const m = /^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/.exec(bounds.trim());
  if (m === null) return null;
  const [x1, y1, x2, y2] = [m[1], m[2], m[3], m[4]].map((v) => Number.parseInt(v ?? "", 10));
  if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) return null;
  return { id, x1, y1, x2, y2 };
}

/** Tous les nœuds porteurs d'un `resource-id` ET de `bounds` exploitables. */
function rectangles(noeud: NoeudHierarchie, acc: Rect[] = []): Rect[] {
  const id = noeud.attributes?.["resource-id"];
  const bounds = noeud.attributes?.bounds;
  if (id !== undefined && id !== "" && bounds !== undefined) {
    const r = lireBounds(id, bounds);
    if (r !== null) acc.push(r);
  }
  for (const enfant of noeud.children ?? []) rectangles(enfant, acc);
  return acc;
}

/**
 * Identités des CIBLES TACTILES, dérivées du DOCUMENT — jamais déclarées par
 * la preuve, qui s'auto-attesterait sinon.
 *
 * PÉRIMÈTRE ASSUMÉ ET NOMMÉ : seuls les blocs `button` et les LIGNES de liste
 * sont mesurés. Leur `testID` est posé par les primitives sur le `Pressable`
 * lui-même — celui qui porte `minHeight: theme.size.tapTarget`, donc le nœud
 * dont les `bounds` SONT la géométrie de la cible. Les champs de formulaire
 * sont EXCLUS : `TextField` pose son `testID` sur l'enveloppe (`fieldWrap`),
 * pas sur la saisie ; mesurer l'enveloppe ne prouverait rien de la cible et
 * produirait un vert non fondé. Cette exclusion est une limite du minimum V3,
 * pas une conformité par défaut.
 */
function ciblesAttendues(air: ProjectAir): { readonly ids: ReadonlySet<string>; readonly prefixesLigne: readonly string[] } {
  const ids = new Set<string>();
  const prefixesLigne: string[] = [];
  for (const ecran of air.screens) {
    for (const bloc of ecran.blocks) {
      if (bloc.blockType === "button") ids.add(bloc.id);
      if (bloc.blockType === "list") prefixesLigne.push(`${bloc.id}-row-`);
    }
  }
  return { ids, prefixesLigne };
}

const estCible = (
  id: string,
  attendues: { readonly ids: ReadonlySet<string>; readonly prefixesLigne: readonly string[] },
): boolean => attendues.ids.has(id) || attendues.prefixesLigne.some((p) => id.startsWith(p));

/** Nature de preuve exigée et clauses non couvertes — jamais tues. */
const EXIGENCE_A =
  "la grille exige une géométrie mesurée sur appareil réel ; NON MESURÉ : zones sûres, cibles sous une barre système, géométrie rendue";
const EXIGENCE_G =
  "la grille exige une mesure sur appareil ; NON MESURÉ : jank au défilement, retour visuel";

/**
 * Borne de RÉFUTATION, DÉRIVÉE de la preuve — jamais postulée.
 *
 * Une implémentation fenêtrée monte au plus `FENETRE_RENDU_EN_ECRANS` hauteurs
 * d'écran de contenu. En lignes, cela vaut :
 *
 *     capacité = 21 × hauteurÉcran / hauteurLigne
 *
 * Les deux grandeurs sont MESURÉES : la hauteur d'écran vient de la preuve,
 * la hauteur de ligne des `bounds` réellement capturés en `A13`.
 *
 * SENS DE L'APPROXIMATION, choisi pour ne JAMAIS produire de faux négatif :
 * on SURESTIME délibérément la capacité, donc on réfute le moins souvent
 * possible. D'où (a) la hauteur d'écran ENTIÈRE, insets non déduits — le
 * viewport réel de la liste est plus petit, donc la vraie capacité est plus
 * FAIBLE ; (b) la PLUS PETITE hauteur de ligne observée, qui maximise le
 * nombre de lignes tenant dans la fenêtre ; (c) le facteur 21 pris pour
 * atteint alors que la documentation dit « up to ». Chacun de ces trois choix
 * élargit la capacité estimée : une réfutation prononcée l'est donc a fortiori.
 *
 * Rend `null` si la géométrie ne permet pas le calcul — auquel cas aucune
 * réfutation n'est possible et le verdict retombe à `non_determinee`.
 */
function capaciteFenetre(hauteurEcranPx: number, lignes: readonly Rect[]): number | null {
  const hauteurs = lignes.map((r) => r.y2 - r.y1).filter((h) => h > 0);
  if (hauteurs.length === 0) return null;
  const minLignePx = Math.min(...hauteurs);
  if (!(hauteurEcranPx > 0)) return null;
  return (FENETRE_RENDU_EN_ECRANS * hauteurEcranPx) / minLignePx;
}

const NON_DETERMINEE = (raison: string): VerdictMesure => ({
  state: "non_determinee",
  detail: `NON DÉTERMINÉE (D-135) — ${raison}`,
});

/** Contrôles de RECEVABILITÉ. Une preuve qui en échoue n'est pas lue du tout. */
function motifsDeRejet(preuve: PreuveAppareil, air: ProjectAir): readonly string[] {
  const motifs: string[] = [];
  if (preuve.schema !== PREUVE_APPAREIL_SCHEMA) {
    motifs.push(`schéma inconnu « ${preuve.schema} » (attendu « ${PREUVE_APPAREIL_SCHEMA} »)`);
  }
  if (preuve.capturedAt.trim() === "") motifs.push("horodatage absent");
  if (preuve.build.easBuildId.trim() === "") motifs.push("identifiant de build EAS absent");
  if (preuve.build.artefactSha256.trim() === "") motifs.push("empreinte de l'artefact installé absente");
  const attendu = hashCanonical(air);
  if (preuve.build.airHash !== attendu) {
    motifs.push(
      `rattachement au build FAUX : la preuve déclare l'AIR ${preuve.build.airHash.slice(0, 12)}…, le document évalué est ${attendu.slice(0, 12)}…`,
    );
  }
  if (!(preuve.ecran.densite > 0)) motifs.push("densité d'écran absente ou nulle — les px ne sont pas convertibles en dp");
  if (!(preuve.ecran.hauteurPx > 0) || !(preuve.ecran.largeurPx > 0)) motifs.push("dimensions d'écran absentes");
  const i = preuve.insets;
  const insetsValides = [i.hautPx, i.basPx, i.gauchePx, i.droitePx].every(
    (v) => typeof v === "number" && Number.isFinite(v) && v >= 0,
  );
  if (!insetsValides) motifs.push("insets système absents ou invalides");
  if (preuve.captures.length === 0) motifs.push("aucune capture");
  for (const c of preuve.captures) {
    if (rectangles(c.hierarchie).length === 0) {
      motifs.push(`capture ${c.etape} sans hiérarchie brute exploitable (aucun nœud avec resource-id + bounds)`);
    }
  }
  return motifs;
}

/** Dimension A — les trois clauses du critère, mesurées sur la géométrie réelle. */
function mesurerA(preuve: PreuveAppareil, air: ProjectAir): VerdictMesure {
  const capture = preuve.captures.find((c) => c.etape === "A12");
  if (capture === undefined) return NON_DETERMINEE("aucune capture A12 : la géométrie n'a pas été relevée");
  const attendues = ciblesAttendues(air);
  const cibles = rectangles(capture.hierarchie).filter((r) => estCible(r.id, attendues));
  if (cibles.length === 0) {
    return NON_DETERMINEE(
      "aucune cible tactile du document n'apparaît dans la hiérarchie A12 — la capture ne mesure rien",
    );
  }
  const { densite, hauteurPx } = preuve.ecran;
  const basUtile = hauteurPx - preuve.insets.basPx;
  const echecs: string[] = [];
  for (const c of cibles) {
    const hauteurDp = (c.y2 - c.y1) / densite;
    if (hauteurDp < CIBLE_TACTILE_MIN_DP) {
      echecs.push(`${c.id} : ${hauteurDp.toFixed(1)} dp < ${String(CIBLE_TACTILE_MIN_DP)} dp`);
    }
    if (c.y2 > basUtile) echecs.push(`${c.id} : déborde sous la barre système (y2=${String(c.y2)} > ${String(basUtile)})`);
    if (c.y1 < preuve.insets.hautPx) {
      echecs.push(`${c.id} : sous la barre haute (y1=${String(c.y1)} < ${String(preuve.insets.hautPx)})`);
    }
  }
  const mesure = `${String(cibles.length)} cible(s) mesurée(s) sur ${preuve.appareil.modele} (${preuve.appareil.os}), densité ${String(densite)}`;
  if (echecs.length > 0) {
    return { state: "non_conforme", detail: `MESURE APPAREIL EN ÉCHEC — ${mesure} · ${echecs.join(" · ")}` };
  }
  return {
    state: "conforme",
    detail: `MESURÉE SUR APPAREIL (A12) — ${mesure} : zones sûres tenues, aucune cible sous une barre système, toutes ≥ ${String(CIBLE_TACTILE_MIN_DP)} dp. Champs de formulaire HORS PÉRIMÈTRE de cette mesure.`,
  };
}

/**
 * Dimension G — virtualisation observée.
 *
 * ⚠️ G NE PEUT PAS DEVENIR `conforme` PAR CE MINIMUM V3, et ce n'est pas un
 * oubli : la clause « défilement sans jank » exige une mesure de trames que le
 * dépôt qualifie lui-même de COMPARATIVE et jamais absolue (banc `P-003`).
 * Une clause non mesurée n'est jamais conforme par défaut (`D-039`). La preuve
 * A13 peut donc RÉFUTER G — c'est exactement la signature de `DET-025` — mais
 * jamais l'établir.
 */
function mesurerG(preuve: PreuveAppareil): VerdictMesure {
  const capture = preuve.captures.find((c) => c.etape === "A13");
  if (capture === undefined) return NON_DETERMINEE("aucune capture A13 : le défilement n'a pas été observé");
  const liste = capture.liste;
  if (liste === undefined) {
    return NON_DETERMINEE("capture A13 sans déclaration de liste : le nombre de lignes servies est inconnu");
  }
  if (liste.lignesServies < LIGNES_MIN_POUR_VIRTUALISATION) {
    return NON_DETERMINEE(
      `liste trop courte pour démontrer une virtualisation (${String(liste.lignesServies)} ligne(s) servie(s), minimum ${String(LIGNES_MIN_POUR_VIRTUALISATION)})`,
    );
  }
  const prefixe = `${liste.blocId}-row-`;
  const rectsLignes = rectangles(capture.hierarchie).filter((r) => r.id.startsWith(prefixe));
  const montees = rectsLignes.length;
  if (montees === 0) {
    return NON_DETERMINEE(`aucune ligne « ${prefixe}… » dans la hiérarchie A13 — la capture ne mesure rien`);
  }
  if (montees >= liste.lignesServies) {
    const capacite = capaciteFenetre(preuve.ecran.hauteurPx, rectsLignes);
    if (capacite === null) {
      return NON_DETERMINEE(
        "géométrie insuffisante pour borner la fenêtre de rendu (hauteur de ligne ou d'écran non mesurable) — aucune réfutation possible",
      );
    }
    if (liste.lignesServies <= capacite) {
      return NON_DETERMINEE(
        `${String(montees)} ligne(s) montée(s) pour ${String(liste.lignesServies)} servie(s) : tout monter est LÉGITIME — la fenêtre de rendu par défaut (${String(FENETRE_RENDU_EN_ECRANS)} écrans) en tient jusqu'à ${String(Math.floor(capacite))}, borne DÉRIVÉE de la géométrie mesurée. La capture ne distingue pas une absence de fenêtre d'un montage complet normal`,
      );
    }
    return {
      state: "non_conforme",
      detail: `MESURE APPAREIL EN ÉCHEC — ${String(montees)} ligne(s) montée(s) pour ${String(liste.lignesServies)} servie(s), alors que la fenêtre de rendu n'en tient que ${String(Math.floor(capacite))} (borne dérivée : ${String(FENETRE_RENDU_EN_ECRANS)} × ${String(preuve.ecran.hauteurPx)} px / ${String(Math.min(...rectsLignes.map((r) => r.y2 - r.y1)))} px). AUCUNE fenêtre de virtualisation. Signature de DET-025 (parent non borné).`,
    };
  }
  return NON_DETERMINEE(
    `virtualisation OBSERVÉE (${String(montees)} ligne(s) montée(s) sur ${String(liste.lignesServies)} servies) — mais la clause « défilement sans jank » N'EST PAS MESURÉE par le minimum V3 : une clause non mesurée n'est jamais conforme par défaut`,
  );
}

/**
 * Lit une preuve appareil et rend les verdicts de A et de G.
 *
 * Contrat, sans exception : preuve ABSENTE ou REFUSÉE ⇒ `non_determinee` ;
 * mesure EN ÉCHEC ⇒ `non_conforme` ; `conforme` exige une mesure recevable qui
 * couvre toutes les clauses du critère — ce qui, pour G, n'est pas atteignable
 * dans ce minimum.
 */
export function lirePreuveAppareil(
  preuve: PreuveAppareil | undefined,
  air: ProjectAir,
): LecturePreuve {
  if (preuve === undefined) {
    return {
      recevable: false,
      motifs: ["preuve absente"],
      a: NON_DETERMINEE(`aucune preuve appareil fournie — ${EXIGENCE_A}`),
      g: NON_DETERMINEE(`aucune preuve appareil fournie — ${EXIGENCE_G}`),
    };
  }
  const motifs = motifsDeRejet(preuve, air);
  if (motifs.length > 0) {
    const refus = `preuve appareil REFUSÉE — ${motifs.join(" · ")}`;
    return {
      recevable: false,
      motifs,
      a: NON_DETERMINEE(`${refus} · ${EXIGENCE_A}`),
      g: NON_DETERMINEE(`${refus} · ${EXIGENCE_G}`),
    };
  }
  return { recevable: true, motifs: [], a: mesurerA(preuve, air), g: mesurerG(preuve) };
}
