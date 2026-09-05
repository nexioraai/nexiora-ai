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

## Ce que cela ne ferme pas

`G` reste **non déterminée** — aucune capture `A13`, et le verrou `pageSize`
demeure. `A10` et la session **iOS** ne sont pas jouées. `A++` reste **NON
ÉTABLI** : la Phase 8 exige A **et** G.
