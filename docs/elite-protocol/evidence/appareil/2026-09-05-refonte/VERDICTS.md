# MESURE APPAREIL APRÈS REFONTE — 2026-09-05

| Champ | Valeur |
|---|---|
| Appareil | Galaxy A17 **SM-A175F** · Android 16 · `RFGL60EYL3T` |
| Build EAS | `5cafaa30-0a26-4b76-868b-bf9f3c6c2888` |
| APK | SHA-256 `d98928bd06e83cd044c8423c284256055a1d151efa6f478ec7807189b273f844` |
| Document attesté | AIR **1.8.0**, `airHash 44760371b3ff…` (commit `27f6287`) |
| Écran | 1080 × 2340 px · densité 2,8125 px/dp · insets 100 / 135 |

## Verdict

**A = conforme** · **G = non_determinee**

Les trois clauses du critère A, mesurées et non déduites :

| Cible | Hauteur | Position |
|---|---|---|
| 3 lignes de l'aperçu | **90,0 dp** | y 640 → 1444 |
| 4 onglets de navigation | **48,0 dp** | y 2070 → 2205 |

Zone sûre y 100 → 2205 : aucune cible ne déborde. Seuil 48 dp = 135 px : aucune
cible sous le seuil.

## La refonte est visible DANS la mesure

- **Aperçu borné** : `pageSize: 3` — trois lignes seulement, là où l'écran
  Départs porte la liste entière. Les deux écrans ont cessé d'être le même.
- **Panneau de navigation** : les onglets ne partent plus de `x=0` mais de
  **`x=23`**, avec **11 px de gouttière** entre eux — les marges du panneau.
- **État actif exposé** : `primary-nav-nav_accueil` porte `selected=true`.
- **En-tête différencié** : « Bus Intercités » / « Vos prochains trajets, en un
  coup d'œil », distinct du titre de route.

## Portée exacte de cette preuve

Elle atteste le build `5cafaa30-…` et le document **1.8.0** dont il est issu.
Le document courant est **1.9.0** — il a gagné `app.distribution` (`DET-004`)
APRÈS ce build. Le champ est un élément de MANIFESTE : il ne change ni écran,
ni géométrie, ni comportement. **Mais la preuve ne le couvre pas**, et le
lecteur refusera mécaniquement de l'appliquer au document courant : le
rattachement au build est vérifié, pas supposé. Une preuve pour 1.9.0 exige un
nouveau build.

## CAMPAGNE FONCTIONNELLE A1→A9 SUR LA REFONTE — 2026-09-05 (après-midi)

Rejouée intégralement sur ce même build, chaque verdict adossé à une hiérarchie
capturée dans `hierarchies/`. Les étapes non exécutées le disent.

| # | Étape | Verdict | Observation mesurée |
|---|---|---|---|
| A1 | Lancement à froid | 🟢 **PASS** | `scr_accueil` : aperçu « À l'affiche » borné à **3 lignes serveur**, 4 destinations, `nav_accueil` `selected=true` |
| A2 | Chargement réel | 🟢 **PASS** | `scr_departs` : les **5 lignes serveur** `row_1/2` (viewport) + `row_12/16` (scroll) + `row_3` (établie par A4) |
| A3 | Contre-preuve seed | 🟢 **PASS** | aucune ligne « destination N » de la démo, sur aucune capture |
| A4 | Filtre statut = `retarde` | 🟢 **PASS** | **San-Pédro seul** (`row_3`) |
| A5 | Recherche « Bou » | 🟢 **PASS** | **Bouaké seul**, champ = `Bou` ; recherche vidée → placeholder et liste restaurés (A5b) |
| A6 | Portée E2 — détail Bouaké | 🟢 **PASS** | **`billet_5` seul** (« passager_nom 5 », `paye`) ; bouton « **Réserver ce billet** » présent (demande ③) |
| A7 | Portée E2 — détail Korhogo | 🟢 **PASS** | bloc présent, **vide, et il le dit** : « Aucun billet pour ce départ » — jamais `rows[0]`. Rejouée sur chemin propre (force-stop → nav → tap vérifié) |
| A8 | Erreur vraie (mode avion) | 🟢 **PASS** | `airplane_mode_on=1` confirmé ; « **Départs indisponibles** · La liste des départs n'a pas pu être chargée. » · **0 ligne** |
| A9 | Réseau rétabli | 🟢 **PASS** | les départs **reviennent seuls**, erreur disparue — zéro interaction entre le rétablissement et la capture |
| A10 | Modification serveur | ⏸ **NON EXÉCUTÉE** | décision propriétaire en attente (redéploiement endpoint) |
| A11 | Hors-allowlist | ⏸ **NON EXÉCUTÉE** | constat d'architecture, `n/a` au protocole |

Le filtre structurel de la refonte (`neq annule`) n'exclut **rien** ici : les 5
lignes serveur sont toutes non-annulées — 5/5 attendues, 5/5 observées.

## Observations consignées, non corrigées (hors périmètre campagne)

- **Chips de filtre sans état exposé** : `filter-0-retarde` actif ne porte pas
  `selected=true` dans l'arbre d'accessibilité, contrairement à la navigation.
- **« Autres départs » inclut le départ courant** : le détail Bouaké liste
  Bouaké lui-même en tête de « Autres départs vers la même période ».
- **Pilotage, pas produit** : deux taps joués sur une géométrie recomposée ont
  dérivé la session (jusqu'à `scr_billet_detail`, et une capture transitoire
  `scr_reservation` inexpliquée). Les étapes touchées (A5, A7) ont été
  **rejouées sur chemin vérifié** — règle appliquée : plus aucun tap sans
  capture fraîche immédiatement avant.

## Ce que cela ne ferme pas

`G` reste **non déterminée** — aucune capture `A13`, et le verrou `pageSize`
demeure. `A10` et la session **iOS** ne sont pas jouées. `A++` reste **NON
ÉTABLI** : la Phase 8 exige A **et** G.
