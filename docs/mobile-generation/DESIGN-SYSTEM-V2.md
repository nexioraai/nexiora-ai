# DESIGN SYSTEM v2 — LISTE MESURÉE DES MANQUES

| Champ | Valeur |
|---|---|
| Rôle EXCLUSIF de ce document | **Liste MESURÉE** des manques du design system v1, produite par la Phase 10 (ROADMAP : « les dettes bloquantes A++ ouvertes en Phase 8 sont réexaminées et alimentent une liste mesurée des manques du design system → design system v2 »). |
| Statut | **P-007 TRANCHÉE le 2026-08-29 → D-043 : design system v2 ADOPTÉ et LIVRÉ.** Les six manques ci-dessous sont traités ; l'état de chacun est indiqué en tête de section. |
| Date de mesure | 2026-08-29 (Phase 10) |
| Instruments | `packages/oracle/src/apxx-grid.ts` (grille A++), `packages/oracle/src/anti-template.ts` (dimension H), mesures AST TypeScript sur les sources du design system |
| Version mesurée | tokens **1.1.0**, registre de blocs **1.0.0**, primitives v1 |

## RÉEXAMEN DES DETTES A++ (état RE-MESURÉ, pas recopié)

| Dette | Constat de Phase 8 | Mesure du 2026-08-29 | État |
|---|---|---|---|
| **DET-014** contraste du libellé de bouton | `onPrimary` blanc sur accent = 3,16:1 | `onPrimary` `#16181D` sur `primary` `#FA5D1E` = **5,62:1** en clair ET en sombre | 🟢 **CONFIRMÉE RÉSOLUE** |
| **DET-015** cible tactile | aucun minimum imposé | `size.tapTarget` = **48**, appliqué à **3 surfaces** (bouton, champ, ligne de liste) | 🟢 **CONFIRMÉE RÉSOLUE** |
| **DET-006** virtualisation | liste dans un ScrollView de même axe | **0 écran à liste encapsulé** sur les 12 domaines, parent borné par `Section fill` | 🟢 **structurellement résolue** — observation d'exécution sur appareil toujours 🟠 non faite |
| **DET-019** accent en couleur de texte | ouverte | clair : `primary/bg` **2,95:1**, `primary/surface` **3,16:1** (seuil 4,5:1) · sombre : 6,39:1 et 5,83:1 → **conformes** | 🔴 **OUVERTE — défaut du thème CLAIR uniquement** |
| **DET-020** sémantique a11y du `ScreenShell` | ouverte | inchangée : label inerte sur iOS (`accessible{false}`), `contentDescription` non mesurée sur Android | 🔴 **OUVERTE** |

## MANQUES MESURÉS — ce qu'un design system v2 doit traiter

### DS-01 — 🟢 RÉSOLU — variété visuelle par app (dimension H **conforme**)

- **Mesuré** : les 12 domaines déclarent **12 thèmes distincts** dans
  `air.design.theme` (`warm_bistro`, `concert_nuit`, `immo_clair`…) et
  produisent **UNE SEULE identité visuelle** : `theme.generated.ts`,
  `styles.ts`, `primitives.tsx` et `components.tsx` sont **byte-identiques**
  sur les 12 apps.
- **Cause établie par deux méthodes indépendantes** : (1) empirique — la
  chaîne du thème n'apparaît dans **aucun** fichier émis ; (2) statique —
  aucun chemin de code du compilateur ne lit `air.design.theme` ; la seule
  lecture de `air.design` porte sur `tokensVersion`.
- **Conséquence** : §22 « une app générée ne doit pas ressembler à un
  gabarit IA générique » n'est **pas** satisfait sur l'axe visuel. La
  structure, elle, varie (12 silhouettes distinctes, 0 collision).
- **Ce que v2 doit apporter** : un mécanisme de thème par app — palettes
  dérivées, densité, rayons, typographie — SANS rompre le déterminisme
  (mêmes entrées ⇒ mêmes sorties) ni la source unique de tokens.
- **Preuve** : `packages/oracle/tests/anti-template.test.ts` (12 contrôles).
- **Dette** : DET-021.

### DS-02 — 🟢 RÉSOLU — l'accent n'est plus une couleur de texte (encre dérivée)

- **Mesuré** : `#FA5D1E` sur `bg` = 2,95:1, sur `surface` = 3,16:1 (seuil
  WCAG 2.2 AA : 4,5:1). Usages réels : prix de fin de ligne (`rowTrailing`),
  ton `primary` de `AppText`, libellé de bouton fantôme — donc **toutes** les
  listes générées.
- **Ce que v2 doit apporter** : une couleur de TEXTE dérivée de l'accent
  (accent foncé) distincte de la couleur de SURFACE, l'accent de marque
  restant inchangé. 28 des 30 paires sont déjà conformes.
- **Dette** : DET-019.

### DS-03 — 🟢 RÉSOLU — 0 valeur de style en dur (dimension D **conforme**)

- **Mesuré par AST** puis confirmé par l'instrument de grille : **8
  `fontWeight`** littéraux (`"600"`, `"700"`) et **1 `paddingVertical: 2`**
  (badge) dans `packages/primitives/src/styles.ts`.
- **Cause** : les tokens n'ont **ni groupe `fontWeight`, ni pas d'espacement
  inférieur à `xs`**. Les valeurs manquantes ont donc été écrites à la main.
- **Note d'instrument** : la dimension D était déclarée conforme en Phase 8
  parce que l'instrument ne cherchait que les couleurs hexadécimales. Il
  mesure désormais les **quatre** familles nommées par le critère
  (espacements, rayons, couleurs, typographie). Le code n'a pas régressé :
  c'est la mesure qui a cessé d'être partielle.
- **Dette** : DET-022.

### DS-04 — 🟢 TRANCHÉ — `opacity` ajouté ; `elevation`/`motion`/`breakpoint` délibérément non ajoutés

- **Mesuré** sur `tokens.json` 1.1.0 — groupes présents : `color`, `space`,
  `radius`, `font`, `size` (+ `brand`, `web`). **Absents** : `elevation`,
  `animation`/`motion`, `opacity`, `breakpoint`/`density`.
- **Conséquence** : le §22 annonce une couverture « elevation, animations,
  responsive/adaptive » qui n'existe pas dans la source unique. Les ombres et
  transitions ne peuvent donc pas être cohérentes par construction.
- **Dette** : DET-023.

### DS-05 — 🟢 TRANCHÉ — uniformité assumée entre plateformes

- **Mesuré** : **zéro** usage de `Platform` dans les primitives, les blocs et
  tout le code émis — propriété d'ailleurs **verrouillée par un test**
  (`keyboard-a11y-locks`, contrôle 4).
- **Nuance importante** : cette absence est un CHOIX qui a servi la
  portabilité (une seule sortie pour les deux plateformes, DET-016). Le §22
  demande néanmoins des « idiomes iOS/Android ». v2 doit **trancher
  explicitement** : soit assumer l'uniformité, soit introduire des idiomes —
  et dans ce cas lever consciemment le verrou existant.
- **Dette** : DET-023 (même famille).

### DS-06 — 🟢 RÉSOLU — le label inerte est retiré, la sémantique vit dans l'en-tête natif

- Reprise de **DET-020** : le titre reporté sur `accessibilityLabel` du
  conteneur racine est **inerte pour VoiceOver** (prop `accessible` à `false`
  par défaut, RN 0.86.3) et pose une `contentDescription` non mesurée sur
  Android. v2 doit définir où vit la sémantique de titre d'écran.

## CE QUI EST DÉJÀ CONFORME (à ne pas casser en v2)

| Dimension | Mesure du 2026-08-29 |
|---|---|
| **A** ergonomie | `tapTarget` 48 ≥ 44 pt / 48 dp, 3 surfaces contraintes |
| **C** états | `loading` / `empty` / `error` rendus par le bloc liste |
| **E** typographie | échelle strictement croissante 12 < 14 < 17 < 22, 0 verrou d'agrandissement |
| **F** i18n/RTL | 0 propriété physique dans tout le projet émis |
| **G** virtualisation | 3 écrans à liste, 0 encapsulé dans un `ScrollView`, parent borné |
| **B** (partiel) | 28 paires conformes sur 30 |

## RÈGLE DE TENUE

Toute entrée de ce document est **mesurée** et porte sa preuve exécutable.
Aucune entrée n'y est ajoutée sur la base d'une impression visuelle. Une
entrée disparaît uniquement quand une mesure démontre qu'elle est résolue.

## ÉTAT APRÈS ADOPTION (mesuré le 2026-08-29, D-043)

| Dimension | Slice 1 (restaurant) | Slice 2 (conteneurs) |
|---|---|---|
| A → H | **toutes conformes** | **toutes conformes** |
| Contraste | 36 paires / 0 échec | 36 paires / 0 échec |
| Valeurs en dur | 0 | 0 |
| Identité visuelle | accent `#FA5D1E` | accent `#0B6E9B`, rayons propres |

**Garantie structurelle acquise** : quelles que soient les couleurs choisies
par une app, les deux encres liées à l'accent sont RE-DÉRIVÉES et le seuil
WCAG 2.2 AA tient par construction — vérifié sur 7 accents très différents,
et re-vérifié app par app par l'Oracle (`contraste_wcag`).
