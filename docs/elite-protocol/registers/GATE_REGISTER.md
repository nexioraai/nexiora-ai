# GATE REGISTER

> ### 🔴 RÈGLE FONDAMENTALE
> **Une gate n'est PAS validée parce qu'elle existe.** Tant qu'aucun
> cas-tueur (`GATE_KILLER_TESTS.md`) n'a été exécuté contre elle, sa validité
> est **UNKNOWN**, jamais PASS.
>
> **Mise à jour du 2026-08-30** — **17 cas-tueurs ont été exécutés** (campagne 1 : 10 ·
> campagne 2 : 7), pour **9 échecs**. Le seuil quantitatif de 13 est franchi.
> **La colonne VALIDITÉ vaut néanmoins UNKNOWN pour la totalité des 25 gates**,
> et le statut `GATES: 🔴 VALIDITY NOT ESTABLISHED` est **maintenu** — pour trois
> raisons mesurées, chacune suffisante :
>
> 1. `FACT` — **0 / 25** gates possèdent une correspondance sémantique établie
>    avec le runtime (`GATE_SEMANTIC_OBSERVABILITY.md`) ;
> 2. `FACT` — les cas-tueurs étiquetés « G4 » / « G5 » ont attaqué un **proxy**,
>    la propriété énoncée de ces gates n'ayant aucune implémentation ;
> 3. `FACT` — un verdict de la campagne 1 (`KT-G05-B03`) est **invalidé** par
>    `PROTOCOL-D010` : le cas-tueur partageait l'erreur de l'instrument testé.
>
> **Franchir un seuil de comptage n'établit pas une validité** (P-C :
> `PARTIAL → PASS` ❌).

## MESURES RATTACHÉES — à lire avec ce registre

| Registre | Ce qu'il établit |
|---|---|
| `GATE_SEMANTIC_OBSERVABILITY.md` | pour les 25 gates : sémantique ↔ runtime · observabilité. **0/25** reliées au runtime · **9/25** observables sur artefact · **8/25** non observables · **1/25** ayant réellement refusé (G14) |
| `GATE_KILLER_TESTS.md` | 17 cas-tueurs · 9 échecs · réserve d'imputation G4/G5 |
| `DISCOVERY_REGISTER.md` | `PROTOCOL-D006`→`D021` — dont `D015` (transfert d'imputation), `D020` (métrique déclarée sans référent observable), `D021` (le modèle de sévérité ne peut pas représenter la composition) |
| `evidence/` | scripts ré-exécutables de toutes les campagnes et d'EXP-1 |

**Travaux ouverts sur ce registre** : `RN-09` classer les 25 gates en
`PREUVE AUTOMATISÉE` / `JUGEMENT HUMAIN` / `DÉPENDANTE D'UN LLM` / `DOCUMENTAIRE`
(**non fait**) · `RN-14` publier la couverture de cas-tueurs par gate.

---

**Six critères d'évaluation** — une gate qui échoue sur un seul est marquée :
`COUVERTURE` (quelle propriété) · `VALIDITÉ` (un PASS implique-t-il la
propriété) · `COMPLÉTUDE` (tous les défauts de la catégorie) · `RÉSISTANCE`
(gaming) · `INDÉPENDANCE` (preuves décorrélées) · `OBSERVABILITÉ`
(l'observation existe-t-elle).

---

## GATES SUR L'APPLICATION

| Gate | Propriété protégée | Observation requise | Oracle | Validité | Résistance | Indép. | Observabilité |
|---|---|---|---|---|---|---|---|
| **G0** obligations dérivées | ∀ élément ⇒ ≥1 obligation | schéma + AIR | dérivation | ❓ UNKNOWN | 🟠 visite triviale | 🟢 | 🟢 |
| **G1** faisabilité tranchée | 0 écart silencieux | AIR ∩ enveloppe | réconciliation | ❓ | 🟠 | 🔴 dépend de l'AIR | 🟢 |
| **G2** artefact instrumenté | ∀ contrôle adressable | artefact + exécution | croisement plan ↔ a11y | ❓ | 🔴 `testID` décoratif | 🟢 | 🟢 |
| **G3** double plateforme | **même artefact**, 2 OS | 2 exécutions | comparaison | ❓ | 🟢 | 🟢 | 🟢 |
| **G4** couverture d'observation | 100 % écrans + contrôles | captures + taps | comptage vs plan | ❓ | 🟠 capture sans exploitation | 🟢 | 🟢 |
| **G5** zéro contrôle fantôme | tout contrôle agit | delta + **contrôle négatif** | causalité | ❓ | 🟢 **la plus solide** | 🟢 instrument | 🟢 |
| **G6** persistance | survit à la mort du processus | dump base après relance | relecture | ❓ | 🟢 | 🟢 | 🟢 |
| **G7** géométrie mesurée | cibles ≥ seuil, 0 débordement | arbre a11y | comparaison de bornes | ❓ | 🟢 | 🟢 | 🟢 |
| **G8** fluidité | frames sous seuil | `gfxinfo` | histogramme | ❓ | 🟢 | 🟢 | 🟠 émulateur ≠ matériel |
| **G9** robustesse | réseau coupé, backend absent, données vides ⇒ état rendu | exécution dégradée | états observés | ❓ | 🟠 | 🟢 | 🔴 **outil réseau absent** |
| **G10** non-régression | pas de dégradation vs référence | diff captures + métriques | comparaison | ❓ | 🔴 **empoisonnement** | 🟠 | 🟢 |
| **G11** référence externe | rang face à l'état de l'art | banc externe | comparaison | ❓ | 🟠 | 🟢 | 🔴 **banc inexistant** |
| **G12** revue adverse | réfutation tentée et échouée | rapport adverse | jugement | ❓ | 🟠 | 🔴 même modèle | 🟢 |
| **G22** anti-minimalisme | richesse suffisante au besoin | **pool de tâches scellé** | taux de réussite | ❓ | 🟠 borné | 🟢 si tiers | 🔴 **pool inexistant** |

## GATES SUR LE GÉNÉRATEUR

| Gate | Propriété | Validité | Observabilité |
|---|---|---|---|
| **G13** corpus scellé | seuils au **1ᵉʳ passage**, 0 intervention | ❓ | 🔴 0 échantillon |
| **G14** distance de nouveauté | mesurée et publiée sur 10 axes | ❓ | 🟢 calculable |
| **G15** auto-diagnostic | le générateur signale ses propres écarts | ❓ | 🟢 |

## GATES SUR LE PROTOCOLE

| Gate | Propriété | Validité | État |
|---|---|---|---|
| **G16** cas-tueurs | toute gate a été vue échouer | ❓ | 🟠 **17 exécutés · 9 échecs**, mais concentrés sur **4 proxys** (G0, G1/G22, G4, G5) — **21 gates n'ont jamais été attaquées** |
| **G17** indépendance | aucune proposition sur une seule chaîne de dépendance | ❓ | 🔴 intersection = {AIR, modèle, générateur} |
| **G18** corpus de régression | 100 % des défauts historiques rattrapés | ❓ | 🔴 **2/4** |
| **G19** taux de découverte externe | publié avec décorrélation des sondes | ❓ | 🟠 mesuré 100 %, sondes non qualifiées |
| **G20** généralisation du protocole | appliqué hors de son périmètre de conception | ❓ | 🔴 jamais |
| **G21** limites publiées | limites connues jointes au certificat | ❓ | 🟢 L1-L4 documentées |
| **G23** ratio de construction | l'analyse ne remplace pas la construction | ❓ | 🔴 **alarme : 9 vs 1** |
| **G24** totalité de la dérivation | 100 % des champs du schéma | ❓ | 🔴 **45 %** |

---

## RÈGLES DE COMPOSITION

1. **Conjonctives.** Aucune compensation entre gates.
2. **G24 seule est gamable** (visite triviale). **G16 seule est gamable**
   (cas-tueur artificiel). **Ensemble, elles ne le sont pas** — totalité et
   discrimination doivent être exigées conjointement.
3. Un cas-tueur doit provenir du **corpus de régression de défauts réels**,
   jamais être inventé pour l'occasion. *Résiduel assumé : les premiers
   seront forcément inventés, faute d'historique.*
4. Une gate ne doit **jamais** pouvoir être satisfaite par un artefact que
   personne n'a exploité.
