# SESSION DE VALIDATION APPAREIL — 2026-09-05

| Champ | Valeur |
|---|---|
| Appareil | Galaxy A17 **SM-A175F** · Android 16 · série `RFGL60EYL3T` |
| Écran | 1080 × 2340 px · densité 2,8125 px/dp · insets haut 100 / bas 135 |
| Build EAS | `c96c4359-71b6-40a3-9724-8af2a3459917` (APK, exp. 17/09) |
| APK installé | SHA-256 `fe2985d5a97330667b97c016ac6947f987ab610ba4f01ba6eee082231495ba8a` |
| Commit source | `44e550e7e76fead1f5e3dfb181f2dbc8a972f695` |
| Réseau | `https://www.deribfy.com` — 200, certificat **Let's Encrypt**, corps byte-identique à la fixture (SHA-256 `3eea2c2e75a1…`) |
| Outillage | `adb 1.0.41` · Maestro 2.10.0 (JBR d'Android Studio) |

> **Chaque verdict s'appuie sur une hiérarchie UI capturée**, conservée dans
> `hierarchies/`. Aucune étape n'est cochée sur intention. Les étapes non
> exécutées sont déclarées telles quelles, jamais réputées passées.

## Verdicts

| # | Étape | Verdict | Observation mesurée |
|---|---|---|---|
| A1 | Ouvrir l'app | 🟢 **PASS** | `scr_accueil` rendu, 4 destinations de navigation présentes |
| A2 | Chargement réel E3.3/E3.1 | 🟢 **PASS** | « Chargement des départs… » observé, puis les **5 lignes serveur** `ent_depart_row_1/2/3/12/16` |
| A3 | Contre-preuve seed ≠ distant | 🟢 **PASS** | destinations serveur affichées ; **aucune ligne « destination N »** de la démo |
| A4 | Filtre statut = `retarde` | 🟢 **PASS** | **San-Pédro seul** (`ent_depart_row_3`) |
| A5 | Recherche « Bou » | 🟢 **PASS** | **Bouaké seul** (`ent_depart_row_1`) ; vider la recherche restaure la liste |
| A6 | Portée E2 — détail Bouaké | 🟢 **PASS** | **1 billet** (`ent_billet_row_5`), conforme à la table E2 |
| A7 | Portée E2 — détail Korhogo | 🟢 **PASS** | **aucun billet** — bloc présent et VIDE, jamais `rows[0]` |
| A8 | Erreur vraie (mode avion) | 🟢 **PASS** | `airplane_mode_on=1` confirmé ; « **Départs indisponibles** · La liste des départs n'a pas pu être chargée. » · **0 ligne** — l'état DIT l'échec |
| A9 | Réseau rétabli | 🟢 **PASS** | les **5 départs reviennent seuls**, sans interaction, erreur disparue |
| A10 | Modification serveur | ⏸ **NON EXÉCUTÉE** | exige de servir `rows.apres-modification` — **décision propriétaire en attente**. Ni simulée, ni contournée |
| A11 | Hors-allowlist | ⏸ **NON EXÉCUTÉE** | constat d'architecture, preuve `n/a` au protocole — aucune capture ne l'établit |
| A12 | Géométrie — dimension **A** | 🟢 **A = conforme** | cibles à **90,0 / 82,8 / 48,0 dp** ; toutes entre y=541 et y=2205, barre système à 2205 ; zones sûres tenues |
| A13 | Virtualisation — dimension **G** | ⏸ **NON EXÉCUTABLE** | `pageSize` plafonne le rendu à 20 lignes, contrat gelé à 200, sous une capacité de fenêtre de 237-310. **`G` reste `non_determinee`** |

## Un faux positif écarté, consigné

La recherche « bou » a d'abord semblé vider la liste. **Deux tests discriminants**
ont établi que le clavier masquait les lignes au moment de la lecture, et que le
filtre `retarde` était bien désactivé. Rejoué proprement : « Bou » → Bouaké seul.
**Aucun défaut n'a été consigné sur cette observation.**

## Ce que la session NE ferme PAS

`A1→A11` n'est **pas** close : `A10` et `A11` ne sont pas exécutées, et la
session **iOS n'a pas eu lieu**. Le critère 7 de la Phase 10 exige `A1→A10`
PASS sur les **deux** appareils.
**`A++` reste NON ÉTABLI** : `G` est non déterminée, et la Phase 8 exige A **et** G.
