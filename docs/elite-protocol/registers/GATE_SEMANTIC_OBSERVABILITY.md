# MESURE STRUCTURELLE DES 25 GATES — sémantique & observabilité

| | |
|---|---|
| **Date** | 2026-08-30 |
| **Objet** | mesurer, gate par gate, (A) si sa sémantique a été **mise en correspondance avec le runtime réel**, et (B) si elle énonce une propriété **observable sur un artefact produit** |
| **Périmètre** | les 25 gates `G0`–`G24` du `GATE_REGISTER` |
| **Méthode** | inspection du dépôt réel — présence/absence d'implémentation, d'instrument, de test lisant le runtime. **Aucune gate classée sur la foi de sa description.** |
| **Interdits respectés** | aucune gate modifiée · aucune extrapolation d'une gate examinée vers une autre · aucune gate déclarée PASS parce que bien documentée |

**Niveaux de preuve** : `FACT` (mesuré / lu dans le code) · `INFÉR.` · `HYPO.` · `CONCL.`

---

## FAITS D'INVENTAIRE — établis avant toute classification

`FACT` — recherche sur tout le dépôt, `node_modules` exclu :

| Instrument | Présence |
|---|---|
| `adb` | **0 occurrence** |
| `gfxinfo` | **0 occurrence** |
| `uiautomator` | **0 occurrence** |
| diff de pixels (`pixelmatch`, `Pillow`) | **0 occurrence** |
| lecture `sqlite` d'un artefact exécuté | **0 occurrence** (le mot n'apparaît qu'au registre de capabilities) |
| `maestro` | 🟢 `packages/oracle/src/e2e-flows.ts` (génération) · `benchmarks/e2e/maestro/` · runners de slices |
| `simctl` | 🟢 `benchmarks/` |
| réseau coupé / mode avion | **0 occurrence** dans `benchmarks/e2e/rtl-and-failure.sh` |

`FACT` — **trois** tests seulement lisent le source du **runtime réel** :
`packages/execution-contract/tests/envelope-truth.test.ts` ·
`packages/compiler/tests/visible-when.test.ts` ·
`packages/slots/tests/policy.test.ts`.

`FACT` — observation sur appareil physique : **1 slice sur 2** (restaurant,
Galaxy A17, 2 flows Maestro PASS), lue dans un journal versionné, non
recalculable hors ligne. Slice conteneurs : **non validé sur appareil**.

`FACT` — `benchmarks/anti-template/results/anti-template-latest.json` :
12 domaines, `verdict: "non_conforme"` — 12 silhouettes structurelles
distinctes, **1 seule identité visuelle pour 12 thèmes déclarés**.

---

## 🟢 MISE À JOUR DU 2026-08-30 — PREMIER INSTRUMENT D'OBSERVATION

Un instrument d'exécution a été construit : `evidence/observation/`. Il rend l'écran
**émis** avec le runtime **émis**, presse chaque identité, enregistre le delta, et
exécute un **contrôle négatif**. Trois gates changent d'état.

| Gate | Avant | Après | Mesure |
|---|---|---|---|
| **G2** adressabilité | `NON IMPLÉMENTÉE` | 🟠 **INSTRUMENTÉE (niveau JS)** | **86,7 %** — 13 blocs adressables sur 15 · **2 non adressables** : `blk_conteneurs_vide`, `blk_alertes_vide` |
| **G5** tout contrôle agit | `PROXY ≠ PROPRIÉTÉ` | 🟠 **INSTRUMENTÉE (niveau JS)** — tap + delta + **contrôle négatif**, ce que la gate spécifie | **1 contrôle agit sur 28 pressables** · contrôle négatif : 0 transition sans appui |
| **E-19** correspondance runtime ↔ validateur | **0 / 25** | **1 / 25 mesurée** | **21,4 %** de correspondance sur la propriété « ce contrôle agit » |

### Matrice E-19 — 28 contrôles pressables, slice conteneurs

| prédit \ observé | AGIT | INERTE |
|---|---:|---:|
| **AGIT** | **1** 🟢 | 0 |
| **FANTÔME** | 0 | **5** 🟢 |
| **NON RECENSÉ** | 0 | **22** 🔴 |

`CONCL.` — Le validateur est **sain** (0 faux positif, 0 faux fantôme) et **aveugle à
78,6 %** de la surface pressable. Son défaut n'est pas de se tromper : c'est de **ne pas
regarder**. Cause unique : `controls()` ne recense un bloc que s'il porte une action,
alors que `AirList` câble `onItemPress` sur **chaque ligne** sans condition (`APP-D002`).

`FACT` — **2 contrôles recensés par le validateur ne sont jamais rendus**
(`blk_conteneurs_vide`, `blk_alertes_vide`) : leur `visibleWhen: entity_empty` porte sur
une entité peuplée. `PROTOCOL-D005` / `D008` **confirmés par exécution**, et par G2
indépendamment.

### Limites de cette mise à jour

**N7 au niveau JS** — hôtes React Native stubés : rien sur la géométrie, la fluidité, la
persistance, le réseau, le rendu natif · **1 slice sur 2** (`slices/restaurant/app/node_modules`
est vide) · **1 propriété** sur 25 · aucune extrapolation aux autres gates (`E-05`).

---

## A — MESURE SÉMANTIQUE : la gate est-elle reliée au runtime ?

**Catégories, définies APRÈS inspection :**

| Statut | Définition |
|---|---|
| `RUNTIME-LIÉ` | une correspondance explicite modèle ↔ runtime existe **et** est vérifiée par un test qui lit le runtime |
| `AIR-DÉRIVÉ` | sémantique déduite du document / du contrat seul ; aucune correspondance runtime |
| `SOURCE-TEXTE` | sémantique déduite du **texte source émis** (regex / AST), jamais du comportement |
| `PROXY ≠ PROPRIÉTÉ` | la propriété énoncée n'est pas implémentée ; ce qui existe mesure **autre chose** |
| `PROCÉDURAL` | la gate porte sur le processus, pas sur un artefact — aucune sémantique runtime à relier |
| `NON IMPLÉMENTÉE` | aucune sémantique n'existe dans le dépôt |

| Gate | Propriété vérifiée | Source sémantique | Runtime correspondant | Corresp. établie ? | Niveau | Statut |
|---|---|---|---|---|---|---|
| **G0** | ∀ élément ⇒ ≥1 obligation | schéma AIR | — | ❌ non | `FACT` 36/80 champs visités | `AIR-DÉRIVÉ` |
| **G1** | 0 écart silencieux | AIR ∩ enveloppe | `useDispatch`, `DataProvider` | 🟠 **proxy syntaxique** (`envelope-truth.test.ts`) — **réfuté sur l'axe déclencheurs** (D010, non versé) | `FACT` | `AIR-DÉRIVÉ` |
| **G2** | ∀ contrôle adressable | — | arbre a11y | ❌ aucun croisement ; `uiautomator` absent | `FACT` absence | `NON IMPLÉMENTÉE` |
| **G3** | même artefact, 2 OS | hachages d'artefact | build EAS | 🟢 hachages recalculés | `FACT` 1 slice | `PROCÉDURAL` |
| **G4** | 100 % écrans + contrôles **observés** | — | — | ❌ | `FACT` | `PROXY ≠ PROPRIÉTÉ` — ce qui existe est une **atteignabilité calculée sur l'AIR**, propriété distincte de « observé » |
| **G5** | tout contrôle agit (delta + contrôle négatif) | — | — | ❌ aucun delta, aucun contrôle négatif | `FACT` | `PROXY ≠ PROPRIÉTÉ` — ce qui existe est `controls()`, un test statique de types |
| **G6** | survit à la mort du processus | — | — | ❌ | `FACT` absence | `NON IMPLÉMENTÉE` |
| **G7** | cibles ≥ 48 dp | **texte du thème émis** (`/"tapTarget":\s*(\d+)/`) | rendu | ❌ | `FACT` | `SOURCE-TEXTE` |
| **G8** | frames sous seuil | — | — | ❌ `gfxinfo` absent | `FACT` absence | `NON IMPLÉMENTÉE` |
| **G9** | réseau coupé ⇒ état rendu | — | — | ❌ 0 occurrence réseau | `FACT` absence | `NON IMPLÉMENTÉE` |
| **G10** | pas de dégradation vs référence | deux `ApxxReport` | — | ❌ substrat = texte émis | `FACT` test unitaire | `SOURCE-TEXTE` |
| **G11** | rang face à l'état de l'art | — | — | ❌ banc inexistant | `FACT` absence | `NON IMPLÉMENTÉE` |
| **G12** | réfutation tentée et échouée | processus | — | s.o. | `FACT` 2 campagnes | `PROCÉDURAL` |
| **G13** | seuils au 1ᵉʳ passage | — | — | ❌ 0 échantillon | `FACT` absence | `NON IMPLÉMENTÉE` |
| **G14** | distance de nouveauté | AIR (structure) + **fichiers émis** (visuel) | artefact émis | 🟠 sur le visuel uniquement | `FACT` bench exécuté | `SOURCE-TEXTE` |
| **G15** | le générateur signale ses écarts | AIR ∩ enveloppe | — | ❌ | `FACT` | `AIR-DÉRIVÉ` |
| **G16** | toute gate a été vue échouer | registre | — | s.o. | `FACT` 17 cas-tueurs | `PROCÉDURAL` |
| **G17** | aucune chaîne de dépendance unique | registre | — | s.o. | `FACT` manuel | `PROCÉDURAL` |
| **G18** | 100 % des défauts historiques rattrapés | registre | — | s.o. | `FACT` 2/4 | `PROCÉDURAL` |
| **G19** | taux de découverte externe publié | registre | — | s.o. | `FACT` 100 % | `PROCÉDURAL` |
| **G20** | protocole appliqué hors périmètre | — | — | s.o. | `FACT` jamais | `PROCÉDURAL` |
| **G21** | limites publiées | document | — | s.o. | `FACT` L1–L4 | `PROCÉDURAL` |
| **G22** | richesse suffisante au besoin | métriques en ratio sur l'AIR | — | ❌ | `FACT` | `AIR-DÉRIVÉ` |
| **G23** | l'analyse ne remplace pas la construction | comptage de sessions | — | s.o. | `FACT` non instrumenté | `PROCÉDURAL` |
| **G24** | 100 % des champs du schéma | schéma AIR | — | ❌ | `FACT` 45 % | `AIR-DÉRIVÉ` |

---

## B — MESURE D'OBSERVABILITÉ : la propriété est-elle observable sur un artefact ?

**Catégories, définies APRÈS inspection :**

| Statut | Définition |
|---|---|
| `OBSERVABLE-EXÉCUTÉ` | l'observation existe **et a été faite** sur un artefact produit |
| `OBSERVABLE-TEXTE` | falsifiable sur le **source émis** (N2), jamais sur un rendu |
| `NON OBSERVABLE — CONTREFACTUEL` | la propriété porte sur une machine qui n'existe pas |
| `NON OBSERVABLE — INSTRUMENT ABSENT` | la propriété est observable en principe, l'instrument n'existe pas |
| `PROCÉDURAL` | observable sur le **registre**, jamais sur l'artefact |

| Gate | Propriété prétendue | Artefact observable | Méthode d'observation | Falsifiable ? | Dépendance non observable ? | Niveau | Statut |
|---|---|---|---|---|---|---|---|
| **G0** | ∀ élément ⇒ obligation | schéma + code de dérivation | comptage | 🟢 oui | non | `FACT` N2 | `OBSERVABLE-TEXTE` |
| **G1** | 0 écart silencieux | rapport de faisabilité | recalcul déterministe | 🟢 oui | 🔴 **oui — l'enveloppe est une déclaration** | `FACT` N2 | `OBSERVABLE-TEXTE` |
| **G2** | ∀ contrôle adressable | app installée | `tapOn: id` (Maestro) | 🟢 oui | non | `FACT` N10 **partiel** — 1 slice, écran d'entrée | `OBSERVABLE-EXÉCUTÉ` |
| **G3** | même artefact, 2 OS | 2 builds | comparaison de hachages | 🟢 oui | non | `FACT` **1 slice sur 2** | `OBSERVABLE-EXÉCUTÉ` |
| **G4** | 100 % écrans **atteints** | app installée | capture + tap par écran | 🟠 en principe | 🔴 **oui — la variante DÉCLARÉE porte sur un moteur qui n'existe pas** (D020) | `FACT` | `NON OBSERVABLE — CONTREFACTUEL` |
| **G5** | tout contrôle agit | app installée | tap + delta + **contrôle négatif** | 🟢 en principe | non | `FACT` instrument absent | `NON OBSERVABLE — INSTRUMENT ABSENT` |
| **G6** | la donnée survit | base après relance | dump + mort du processus | 🟢 en principe | non | `FACT` absence | `NON OBSERVABLE — INSTRUMENT ABSENT` |
| **G7** | cible ≥ 48 dp | **rendu** | arbre a11y | 🟠 sur le **texte** seulement | 🔴 oui — le token n'est pas le rendu | `FACT` N2 | `OBSERVABLE-TEXTE` |
| **G8** | c'est fluide | app en exécution | histogramme de frames | 🟢 en principe | non | `FACT` absence | `NON OBSERVABLE — INSTRUMENT ABSENT` |
| **G9** | dégrade proprement | app + réseau coupé | exécution dégradée | 🟢 en principe | non | `FACT` absence | `NON OBSERVABLE — INSTRUMENT ABSENT` |
| **G10** | pas de dégradation | 2 rapports A++ | `apxxRegressions` | 🟢 oui | 🔴 oui — substrat textuel | `FACT` test unitaire | `OBSERVABLE-TEXTE` |
| **G11** | rang face à l'état de l'art | population de référence | comparaison | ❌ | 🔴 oui — banc inexistant | `FACT` absence | `NON OBSERVABLE — INSTRUMENT ABSENT` |
| **G12** | réfutation échouée | registre de cas-tueurs | relecture | 🟢 oui | non | `FACT` | `PROCÉDURAL` |
| **G13** | seuils au 1ᵉʳ passage | corpus scellé | rejeu | ❌ | 🔴 oui — 0 échantillon | `FACT` absence | `NON OBSERVABLE — INSTRUMENT ABSENT` |
| **G14** | variété réelle | 12 artefacts émis | signatures structurelle + visuelle | 🟢 **oui — et la gate A REFUSÉ** | non | `FACT` bench exécuté, `non_conforme` | `OBSERVABLE-EXÉCUTÉ` |
| **G15** | auto-diagnostic | rapport émis | relecture | 🟢 oui | 🔴 oui — le moteur se déclare lui-même | `FACT` N2 | `OBSERVABLE-TEXTE` |
| **G16** | toute gate vue échouer | registre | comptage | 🟢 oui | non | `FACT` 17 exécutés | `PROCÉDURAL` |
| **G17** | indépendance des preuves | registre | intersection des dépendances | 🟠 manuel | 🔴 oui — jugement | `FACT` manuel | `PROCÉDURAL` |
| **G18** | défauts historiques rattrapés | corpus de régression | rejeu | 🟢 oui | non | `FACT` 2/4 | `PROCÉDURAL` |
| **G19** | taux de découverte externe | registre | comptage | 🟠 dépend de la qualification des sondes | 🔴 oui | `FACT` 100 % | `PROCÉDURAL` |
| **G20** | généralisation du protocole | artefact étranger | application du protocole | 🟢 en principe | non | `FACT` jamais tenté | `PROCÉDURAL` |
| **G21** | limites publiées | certificat | relecture | 🟢 oui | non | `FACT` 🟢 | `PROCÉDURAL` |
| **G22** | richesse suffisante | **pool de tâches scellé** | taux de réussite | ❌ | 🔴 **oui — pool inexistant ; un agent LLM produirait un faux PASS (R-21)** | `FACT` absence | `NON OBSERVABLE — INSTRUMENT ABSENT` |
| **G23** | construction ≥ analyse | historique de sessions | comptage | 🟠 non instrumenté | 🔴 oui | `FACT` 9 vs 1 | `PROCÉDURAL` |
| **G24** | 100 % des champs | schéma + dérivation | comptage | 🟢 oui | non | `FACT` 45 % | `OBSERVABLE-TEXTE` |

---

## SYNTHÈSE CHIFFRÉE

### Mesure A — 25 gates

| Statut | Nombre | Gates |
|---|---:|---|
| `RUNTIME-LIÉ` (correspondance établie et non réfutée) | **0** | — |
| `AIR-DÉRIVÉ` | **5** | G0, G1, G15, G22, G24 |
| `SOURCE-TEXTE` | **3** | G7, G10, G14 |
| `PROXY ≠ PROPRIÉTÉ ÉNONCÉE` | **2** | G4, G5 |
| `PROCÉDURAL` | **9** | G3, G12, G16, G17, G18, G19, G20, G21, G23 |
| `NON IMPLÉMENTÉE` | **6** | G2, G6, G8, G9, G11, G13 |
| **Total** | **25** | |

> **`FACT`** — **une seule** correspondance modèle ↔ runtime existe dans le
> dépôt (`envelope-truth.test.ts`, au service de G1). **`FACT`** — elle procède
> par comparaison de **chaînes de caractères** et atteste une proposition dont
> la fausseté est démontrée sur l'axe des déclencheurs.
> **`CONCL.`** — **0 gate sur 25** possède une correspondance runtime établie à
> un niveau de preuve ayant survécu à l'examen.

### Mesure B — 25 gates

| Statut | Nombre | Gates |
|---|---:|---|
| `OBSERVABLE-EXÉCUTÉ` | **3** | G2 *(partiel)*, G3 *(partiel)*, G14 |
| `OBSERVABLE-TEXTE` | **6** | G0, G1, G7, G10, G15, G24 |
| `NON OBSERVABLE — CONTREFACTUEL` | **1** | G4 |
| `NON OBSERVABLE — INSTRUMENT ABSENT` | **7** | G5, G6, G8, G9, G11, G13, G22 |
| `PROCÉDURAL` | **8** | G12, G16, G17, G18, G19, G20, G21, G23 |
| **Total** | **25** | |

### Croisements

| Question | Réponse | Niveau |
|---|---:|---|
| Gates dont la sémantique est effectivement reliée au runtime | **0 / 25** | `CONCL.` |
| Gates dérivées principalement de l'AIR ou du texte émis | **10 / 25** | `FACT` |
| Gates énonçant une propriété observable **sur un artefact produit** | **9 / 25** (3 exécutées + 6 sur texte émis) | `FACT` |
| Gates dont la propriété **n'est pas observable** en l'état | **8 / 25** | `FACT` |
| Gates purement procédurales (observables sur le registre, jamais sur l'artefact) | **8 / 25** | `FACT` |
| Gates ayant **réellement refusé** un artefact | **1 / 25** — G14 | `FACT` |
| Gates `UNKNOWN` | **0 / 25** | — |

---

## RÉSULTAT NON ANTICIPÉ — à ne pas confondre avec une conclusion générale

`FACT` — Pour **G4** et **G5**, la propriété énoncée au `GATE_REGISTER`
(*« 100 % écrans + contrôles observés »*, *« delta + contrôle négatif »*) **n'a
aucune implémentation**. Ce qui existe — l'atteignabilité calculée sur l'AIR et
le recensement statique `controls()` — mesure **une autre propriété**.

`INFÉR.` — Les cas-tueurs des campagnes 1 et 2 étiquetés « G4 » et « G5 » ont
donc attaqué **un proxy**, pas la gate énoncée. Leurs résultats restent valides
**pour ce proxy** ; leur imputation à G4/G5 est **imprécise**.

`HYPO.` — **non testé** : la même imprécision d'étiquetage pourrait affecter
d'autres gates. Aucune extrapolation n'est faite.

---

## LIMITES DE CETTE MESURE

1. `FACT` — Classification établie par **inspection statique du dépôt**. Aucune
   gate n'a été exécutée pour cette mesure ; les statuts `OBSERVABLE-EXÉCUTÉ`
   s'appuient sur des journaux versionnés, non recalculés ici.
2. `FACT` — L'absence d'un instrument est établie par recherche textuelle sur
   le dépôt. Un instrument présent sous un autre nom ne serait pas détecté.
3. `INFÉR.` — Les catégories ont été définies **après** inspection, comme exigé.
   Une autre grille pourrait redistribuer les effectifs sans changer les faits.
4. 🔴 **Aucune de ces mesures n'autorise une correction.** Elles décrivent un
   état ; elles ne prescrivent rien.
