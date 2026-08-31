# DISCOVERY REGISTER

> **Règle de tenue** : une découverte n'est JAMAIS supprimée, même après
> correction. Son statut évolue ; son enregistrement demeure. Toute
> découverte corrigée doit engendrer un test de non-régression permanent.

**Convention d'identifiants** : `APP-Dnnn` (application) · `PROTOCOL-Dnnn`
(protocole) · `GEN-Dnnn` (générateur).

Une découverte n'est comptée comme telle que si **elle n'était présente dans
aucune information fournie comme défaut connu**.

---

## APP-D001 — `field.unique` déclaré mais jamais traduit en contrainte SQL

| | |
|---|---|
| **Date** | 2026-08-29 |
| **Type** | 🟢 **BLIND DISCOVERY** — jamais mentionnée par le propriétaire ni par aucune fiche DET |
| **Contexte** | sonde aveugle lancée depuis les 44 champs de schéma non couverts par une obligation (voir PROTOCOL-D003) |
| **Observation brute** | `grep -n "unique" packages/provisioner/src/sql-gen.ts` → **0 occurrence**. Le générateur SQL produit PK, FK, CHECK d'énums et index ; il ignore `field.unique` |
| **Méthode de découverte** | hypothèse H1 formulée depuis la liste des champs non couverts, testée sur les 13 documents |
| **Portée mesurée** | **23 champs** déclarés `unique: true`, répartis sur **12 documents sur 13** |
| **Exemples** | `billetterie-concerts / ent_billet.fld_billet_code_scan` — deux billets peuvent porter le même code de scan · `ent_billet.fld_billet_reference` · `agence-immo / ent_bien.fld_bien_reference` |
| **Impact** | 🔴 **intégrité de données** — la classe la plus grave : corrompt le stock, pas l'affichage. Aucun validateur, aucun Oracle, aucune fiche DET ne le voit |
| **Reproductibilité** | 🟢 déterministe — `scratchpad/blind.mjs` |
| **Statut** | 🔴 **OUVERT** |
| **Correction** | aucune (interdiction de modifier le produit en vigueur) |
| **Preuve** | absence textuelle vérifiée dans le générateur + comptage sur les 13 documents |
| **Test de non-régression exigé** | pour tout AIR, ∀ champ `unique: true` ⇒ le SQL généré contient une contrainte `UNIQUE` sur la colonne |

---

## APP-D002 — Lignes de liste pressables et INERTES

| | |
|---|---|
| **Date** | 2026-08-30 |
| **Type** | 🟢 **BLIND DISCOVERY** — produite par la **première observation d'exécution** du chantier |
| **Instrument** | `evidence/observation/` — rendu de l'écran ÉMIS avec le runtime ÉMIS, appui par identité, **contrôle négatif** |
| **`FACT` — contrôle négatif** | sans appui : **0 transition**. L'instrument ne produit pas de delta par lui-même |
| **`FACT` — relevé** | écran `scr_conteneurs` : **11 identités adressables** · **8** portent un handler d'appui · **1 seule agit** (`blk_conteneurs_ajouter` → `scr_suivi_ajout`) · **7 pressées sans aucun effet** |
| **Les 7 inertes** | `blk_conteneurs_synchroniser` (effet `capability`, hors enveloppe — **prédit** par le protocole) et **6 lignes de liste** `blk_conteneurs_liste-row-*` |
| **Cause racine** | `AirList` câble **toujours** `onItemPress={onItemNavigate}` ; `useItemNavigate` lit `screen.uiActionsByBlock[blockId]`. Or `uiActionsByBlock` de cet écran vaut `{blk_conteneurs_ajouter, blk_conteneurs_synchroniser}` — **aucune entrée pour le bloc liste**. Chaque ligne est donc pressable et sans action |
| **🔴 Pourquoi le protocole ne le voit pas** | `controls()` ne recense un contrôle que si `actionsOfBlock` retourne une action. Le bloc liste n'en porte aucune ⇒ **aucun contrôle recensé, aucun écart émis**. L'utilisateur voit 6 lignes, les presse, rien ne se produit — **et le rapport de faisabilité est muet** |
| **Impact** | 🔴 affordance morte offerte à l'utilisateur, invisible à toute mesure statique existante |
| **Niveau de preuve** | **N7 au niveau JS** — appui réel, delta enregistré, contrôle négatif. **PAS** une observation appareil : les hôtes React Native sont stubés |
| **Reproductibilité** | 🟢 `npx vitest run --config docs/elite-protocol/evidence/observation/obs.config.ts --reporter=verbose` |
| **Statut** | 🔴 **OUVERT** — non corrigé (interdiction de modifier le produit) |
| **Fait notable** | 🟢 **première confirmation empirique d'une prédiction du protocole** : `blk_conteneurs_synchroniser` était annoncé `EXEC_GHOST_CONTROL` ; l'appui le confirme |

---

## APP-D004 — L'intention du client n'est stockée nulle part, et les promesses déclarées ne sont jamais exécutées

| | |
|---|---|
| **Date** | 2026-08-31 |
| **Type** | 🟢 **BLIND DISCOVERY** — produite en cherchant la racine, après refus propriétaire de la correction du prompt comme cause |
| **`FACT` — hypothèse tuée** | Le moteur n'est **pas** le plafond : un AIR écrit à la main de **12 écrans / 8 entités** passe `assertValidAir` 🟢 et `compileProject` 🟢 **47 fichiers**, sans refus ni dégradation |
| **`FACT` — le symptôme** | `emit-v2.mjs:134` et `emit.mjs:142`, identiques : *« Sois complet mais sobre : 2 à 4 écrans, 1 à 3 entités »*. Plafond **saturé 12/12**. Réel, mais n'explique pas l'absence de détection |
| **`FACT` — racine ①** | L'AIR porte **19 champs de premier niveau** ; **aucun** ne contient la demande d'origine. L'intention entre dans un prompt et **disparaît** |
| **`FACT` — racine ②** | **227 `expectedTests`** déclarés au corpus. Consommateurs : `validate.ts` (unicité d'identifiant) et `render-text.ts` (affichage). **Aucun exécuteur — jamais** |
| **`INFÉRENCE`** | Toute la vérification compare l'**artefact au document**. **Personne ne compare le document à la demande.** Cause commune du plafond non vu sur 12 documents, de *« avec photos »* évaporé, de la grille A++ verte sur une app pauvre, et d'`APP-D002` invisible à 640 tests verts |
| **Portée mesurée** | Sur **227** promesses : **167 à CIBLE MORTE (73,6 %)** · 60 vivantes · 0 inexistante. Par nature — `deterministic` 40/**75** · `e2e` 18/**35** · `contract` 2/**57**. Causes : effet hors `EXECUTION_ENVELOPE_V1`, écran inatteignable, entité liée à aucun bloc rendu |
| **`FACT` — couche la plus profonde** | `expectedTests.targetId` doit désigner un **nœud existant** (`scr_`/`act_`/`ent_`). `INFÉRENCE` — un besoin **sans nœud** ne peut pas être exprimé comme promesse : le manque n'est pas non détecté, il est **inexprimable** |
| **Contre-épreuve** | `slices/resto-riche/` — même moteur, document écrit pour ce que le moteur tient : **10/10** promesses à cible vivante, **22/22** contrôles agissants, **0** écran mort. Contre `resto-quartier` : **4/18** et 4/14 |
| **Impact** | 🔴 le système produit et certifie des applications **sans jamais confronter le résultat à la demande** |
| **Niveau de preuve** | **N6** — analyse statique du graphe (`reachableScreens`, `controls`, `dataBindings`) croisée avec l'enveloppe d'exécution. **Condition NÉCESSAIRE seulement** : l'énoncé de chaque promesse n'est **pas** vérifié |
| **Reproductibilité** | 🟢 `node docs/elite-protocol/evidence/promesses-tenues.mjs` |
| **Statut** | 🔴 **OUVERT** — mesuré et démontré, **non corrigé**. Correction = montée de schéma AIR (arbitrage propriétaire, D-054) |

---

## APP-D003 — La dimension C de la grille A++ mesure le CODE, pas l'ÉTAT ATTEINT

| | |
|---|---|
| **Date** | 2026-08-30 |
| **Type** | 🟢 **BLIND DISCOVERY** — produite par la première observation des états de bloc |
| **`FACT` — l'instrument** | `apxx-grid.ts` §C : `["loading","empty","error"].filter(k => blocks.includes(\`state.kind === "${k}"\`))`, puis `states.length === 3 ? "conforme" : "non_conforme"`. C'est une **recherche de sous-chaîne** dans le source du composant émis |
| **`FACT` — le verdict enregistré** | `slices/conteneurs/results/metrics.json` : dimension **C = conforme**, détail *« états rendus par le bloc liste : loading/empty/error »* |
| **`FACT` — l'enveloppe** | `EXECUTION_ENVELOPE_V1.reachableBlockStates.list = ["ready","empty"]`. L'enveloppe **concède** que `loading` et `error` ne sont pas atteignables |
| **`FACT` — l'observation** | sous **deux** conditions de données (fixtures livrées, dataset vide), le bloc `list` ne rend jamais que **`empty`** et **`ready`**. `loading` et `error` : **jamais** |
| **`INFÉRENCE`** | La dimension C mesure *« le composant contient la branche »*, jamais *« l'état est atteint »*. Le critère A++ — *« tout bloc consommant des données expose loading/empty/error »* — porte sur ce que l'utilisateur voit, pas sur ce que le code sait écrire |
| **`CONCL.`** | **C est déclarée conforme alors que 2 des 3 états qu'elle nomme ne sont jamais atteints.** Deux organes du même système se contredisent sur le même objet — l'enveloppe (mesurée, cliquetée) et la grille A++ (lecture de source) — et **personne ne les avait croisés** |
| **Portée mesurée** | **11 états déclarés au registre · 7 concédés par l'enveloppe · 3 observés.** 8 états déclarés sur 11 ne sont **jamais rendus**. Quatre types de blocs (`button`, `header`, `detail_header`, `empty_state`) déclarent un état et **n'en portent aucun** à l'exécution |
| **Impact** | 🔴 une dimension de la grille de qualité produit est **verte sans fondement observationnel** |
| **Niveau de preuve** | **N7 au niveau JS** — rendu réel sous deux conditions de données. Hôtes RN stubés |
| **Reproductibilité** | 🟢 `npx vitest run --config docs/elite-protocol/evidence/observation/obs.config.ts --reporter=verbose etats` |
| **Statut** | 🔴 **OUVERT** — non corrigé |

---

## PROTOCOL-D001 — Les métriques en ratio sont aveugles à l'échelle

| | |
|---|---|
| **Date** | 2026-08-29 |
| **Type** | 🟢 **BLIND DISCOVERY (protocole)** |
| **Contexte** | analyse de l'attaque G22, après confirmation empirique |
| **Observation brute** | toutes les métriques du rapport de faisabilité sont des ratios : `effectsExecuted/effectsDeclared`, `screensReachable/screensDeclared`… |
| **Le fait** | un ratio est **invariant par changement d'échelle**. `1/1` et `4/4` sont indistinguables |
| **Impact** | 🔴 **G22 n'est pas un cas particulier du `n/a`** : c'est une propriété générale de toute métrique en ratio. Réduire le périmètre améliore mécaniquement tous les scores. Mesuré : app minimaliste = **1 écart** vs slice conteneurs = **52** |
| **Reproductibilité** | 🟢 `scratchpad/g22.mjs` |
| **Statut** | 🟠 **COMPRIS, NON RÉSOLU** — seul un pool de tâches scellé y résiste |
| **Test de non-régression exigé** | toute métrique publiée porte son **numérateur ET son dénominateur**, jamais le seul pourcentage |

---

## PROTOCOL-D002 — Les écarts n'ont aucune sévérité

| | |
|---|---|
| **Date** | 2026-08-29 |
| **Type** | 🟢 **BLIND DISCOVERY (protocole)** |
| **Observation brute** | `grep -n "severity\|gravite" feasibility.ts` → **0 occurrence**. La structure `FeasibilityGap` porte `{code, path, owner, detail}` |
| **Impact** | 🔴 **vecteur de gaming interne à l'instrument anti-gaming** : les 52 écarts du slice pèsent identiquement. **Retirer une capability `analytics` améliore le score autant que rendre 2 écrans atteignables** |
| **Reproductibilité** | 🟢 vérification textuelle |
| **Statut** | 🔴 **OUVERT** |
| **Test de non-régression exigé** | tout écart porte une sévérité dérivée de sa **nature**, jamais choisie ; le score agrège par sévérité |

---

## PROTOCOL-D003 — La dérivation des obligations n'est totale qu'à 45 %

| | |
|---|---|
| **Date** | 2026-08-30 |
| **Type** | 🟢 découverte du protocole, **par mesure** |
| **Contexte** | recherche de la cause réelle des 2 faux négatifs du test de discrimination |
| **Observation brute** | 80 champs repérés dans le schéma AIR · **36 visités** par une obligation · **44 jamais visités** |
| **Champs orphelins** | `visibleWhen · enumValues · operator · assertions · operation · required · unique · allowedImports · inputs · outputs · expectedTests · commerceClass · allowedDomains · routes · relations · providerClass · tokensVersion · …` |
| **Impact** | 🔴 **P-A avait été implémenté en réintroduisant la liste écrite à la main un étage plus bas.** C'est le défaut exact reproché à la grille A++, commis dans le module censé le corriger |
| **Conséquence positive** | la limite L1 **rétrécit** : elle ne signifie plus « des inconnues partout » mais exactement « un champ absent du schéma » |
| **Conséquence méthodologique** | 🟢 **la métrique de couverture est un GÉNÉRATEUR DE PISTES** — elle a produit APP-D001 |
| **Statut** | 🔴 **OUVERT** — condition n°1 |
| **Test de non-régression exigé** | G24 : ∀ champ du schéma ⇒ ≥1 obligation, **ou** déclaration explicite motivée « ne porte aucune obligation ». Couverture publiée à chaque certification |

---

## HYPOTHÈSES TESTÉES SANS RÉSULTAT — conservées par honnêteté

| Hypothèse | Résultat | Pourquoi conservée |
|---|---|---|
| **H2** · champ affiché structurellement vide (`asset`/`json`) | **0 occurrence** | négatif utile : les documents évitent naturellement ce cas |
| **H3** · même entité titrée par des champs différents selon l'écran | **0 occurrence** | négatif utile |
| **H4** · champ `required` produisant NULL | 25 occurrences **mais explicitement documenté** dans `sql-gen.ts` | 🔴 **écarté — ce n'est PAS une découverte**, la décision est consignée |

---

## PROTOCOL-D004 — Un déclencheur `data` fantôme efface les écrans morts

| | |
|---|---|
| **Date** | 2026-08-30 |
| **Type** | 🟢 **BLIND DISCOVERY (protocole)** — produite par le cas-tueur `KT-G04-B01`, verdict attendu déclaré avant exécution |
| **Contexte** | campagne 1 de cas-tueurs, attaque inédite contre G4 |
| **Observation brute** | ajout de 4 actions `data`→`navigate` **inertes** sur le slice conteneurs : `EXEC_SCREEN_UNREACHABLE_DECLARED` passe de **2 à 0**, `screensReachableDeclared` de **2/4 à 4/4**, **produit inchangé** |
| **Cause racine** | dans `reachableScreens()`, un déclencheur `data` (ou `lifecycle` sans `screenId`) a une **origine indéterminée**, donc réputée atteignable. Le chemin est compté sans vérifier qu'il puisse être emprunté |
| **Impact** | 🔴 **vecteur de gaming exploitable et bon marché** : 4 lignes d'AIR effacent 100 % d'un défaut critique |
| **🔴 Composition** | l'attaque ajoute 4 écarts triviaux pour en supprimer 2 critiques. **PROTOCOL-D002 (absence de sévérité) empêche le protocole de dire que le troc est défavorable.** Deux faiblesses bornées composent une attaque exploitable |
| **Atténuation observée** | la métrique **effective** résiste (2/4 inchangé) car elle borne les déclencheurs à l'enveloppe — la défense en profondeur a partiellement joué |
| **Reproductibilité** | 🟢 `scratchpad/exploit.mjs` |
| **Statut** | 🔴 **OUVERT** — non corrigé (interdiction de corriger opportunément) |
| **Test de non-régression exigé** | `KT-G04-B01` doit devenir permanent : un déclencheur hors enveloppe ne doit **jamais** rendre un écran atteignable |

---

## 🔴 CORRECTION DE PROTOCOL-D004 — mécanisme réfuté par EXP-1

> **Cette correction est obligatoire à la lecture.** La description originale
> de D004 ci-dessus dit que l'attaque **supprime** un défaut critique et que
> le protocole subit un **troc** défavorable. **L'expérience réfute les deux.**

| | |
|---|---|
| **Constat historique CONSERVÉ** | `EXEC_SCREEN_UNREACHABLE_DECLARED` passe bien de **2 à 0**, et `screensReachableDeclared` de **2/4 à 4/4**, produit inchangé. Ce fait n'est pas remis en cause. |
| **Réfutation expérimentale** | `FACT` — à construction contrôlée (A : 2 écrans morts · B : 2 déclencheurs `data` inertes · A∪B : les mêmes 2 redirigés) le comptage est **STRICTEMENT ADDITIF** : 2 + 2 = 4. **Aucun écart n'est supprimé.** Les 2 `EXEC_SCREEN_UNREACHABLE_DECLARED` (owner `document`) sont remplacés par 2 `EXEC_SCREEN_UNREACHABLE_ENGINE` (owner `moteur`). |
| **Ce qui change réellement** | `INFÉR.` — **l'imputation**, pas la quantité. `owner:document` passe de **2 à 0**. Le producteur du document déplace son défaut vers la dette moteur, déjà déclarée et acceptée par l'enveloppe. |
| **Conséquence sur la correction prévue** | `CONCL.` — une échelle de sévérité **ne verrait pas D004** : les deux configurations portent **2 écarts critiques** dans les deux cas. Seul le champ `owner` change, et le score ne l'agrège pas. La correction de PROTOCOL-D002 traite le troc de `KT-C2-06`, **pas** D004. |
| **Preuve** | `docs/elite-protocol/evidence/exp1b.mjs` |
| **Nouveau statut** | 🔴 **OUVERT** — mécanisme requalifié en `PROTOCOL-D015`. Description originale conservée ci-dessus **à titre historique**, invalidée quant au mécanisme. |

---

## PROTOCOL-D005 — Le bloc structurellement invisible n'est pas détecté

| | |
|---|---|
| **Date** | 2026-08-30 |
| **Type** | 🟢 **BLIND DISCOVERY (protocole)** — cas-tueur `KT-G05-B02` |
| **Observation brute** | un bloc portant `visibleWhen: {kind:"entity_empty", entityId:"ent_x"}` sur une entité dont le dataset vaut 9 lignes n'est **jamais** rendu. Le protocole ne produit **aucun écart** |
| **Cause racine** | aucune obligation ne porte sur la **satisfiabilité** d'une condition de visibilité. `visibleWhen` fait partie des 44 champs non couverts (PROTOCOL-D003) |
| **Impact** | 🟠 interface morte non détectée ; un générateur peut « conditionner » un contrôle pour le soustraire à l'observation |
| **Note d'honnêteté** | c'est l'**inverse exact** du défaut DET-017 corrigé par D-044. En rendant les blocs conditionnables, le contrat a créé une seconde classe de défaut — bloc **toujours visible à tort** *ou* **jamais visible à tort** — dont une seule est traitée |
| **Reproductibilité** | 🟢 `scratchpad/kt.mjs` |
| **Statut** | 🔴 **OUVERT** |
| **Test de non-régression exigé** | toute condition de visibilité doit être **satisfiable** au regard des datasets déclarés, dans les deux sens |

---

# DÉCOUVERTES EXP-1 — versées le 2026-08-30

> **Convention de niveau de preuve, appliquée à chaque ligne** :
> `FACT` (mesuré ou lu dans le code) · `INFÉR.` (déduit de faits) ·
> `HYPO.` (non testé) · `CONCL.`
> Aucune de ces entrées n'a été corrigée. Aucune n'autorise une correction.

## PROTOCOL-D015 — D004 est un TRANSFERT D'IMPUTATION, pas une suppression

| | |
|---|---|
| **Date** | 2026-08-30 · EXP-1 |
| **Type** | 🔴 **BLIND** — requalifie le mécanisme d'une découverte enregistrée |
| **`FACT`** | À construction contrôlée : A (2 écrans morts) = 2 écarts `owner:document` · B (2 déclencheurs `data` inertes) = 2 écarts `owner:moteur` · **A∪B = 4 écarts, dont `owner:document` = 0** |
| **`FACT`** | Comptage **strictement additif** (2+2=4). `EXEC_SCREEN_UNREACHABLE_DECLARED` → `EXEC_SCREEN_UNREACHABLE_ENGINE`, un pour un |
| **`INFÉR.`** | Le champ `owner` — décrit dans `feasibility.ts` comme « la propriété la plus importante de ce rapport » — est **contrôlé par le producteur du document** : 2 lignes d'AIR suffisent à disculper le document |
| **`CONCL.`** | Une échelle de sévérité **ne détecte pas** ce mécanisme : les deux configurations portent 2 écarts critiques. La correction prévue de D002 est **orthogonale** à D004 |
| **Preuve** | `docs/elite-protocol/evidence/exp1b.mjs` |
| **Statut** | 🔴 **OUVERT** — non corrigé |
| **Test de non-régression exigé** | l'imputation d'un écart ne doit pas pouvoir changer sans que la propriété sous-jacente change |

## PROTOCOL-D016 — Un écran sans route est compté atteignable

| | |
|---|---|
| **Date** | 2026-08-30 · EXP-1, sonde de l'hypothèse gelée **H-02** |
| **Type** | 🔴 **BLIND** |
| **`FACT`** | `reachableScreens()` teste `screenIds.has(target)`. L'émetteur ne crée un `Stack.Screen` que pour les entrées de `air.navigation.routes` (`emit-project.ts:332-334`). Le validateur sémantique vérifie routes → écrans, **jamais** écrans → routes |
| **`FACT`** | Document construit avec `scr_z` sans route : **0 écart**, atteignabilité effective **2/2** |
| **`INFÉR.`** | `navigate("scr_z")` cible une route non enregistrée. **`HYPO.`** — le comportement runtime attendu est un no-op ; **non observé**, faute d'exécution |
| **Niveau de preuve** | `FACT` N2 côté instrument · `HYPO.` côté runtime |
| **Statut** | 🔴 **OUVERT** |

## PROTOCOL-D017 — Une liste vide est comptée comme chemin de navigation

| | |
|---|---|
| **Date** | 2026-08-30 · EXP-1, sonde de **H-09** |
| **Type** | 🔴 **BLIND** |
| **`FACT`** | `AirList` ne porte `onItemPress` que sur un **item** ; 0 ligne ⇒ rien à presser. `reachableScreens()` n'a aucun test de cardinalité |
| **`FACT`** | Document où l'unique chemin est une liste à `rowCount: 0` : l'écran cible est compté atteignable (2/2). `EXEC_DATA_SOURCE_EMPTY` est bien émis — **et la métrique d'atteignabilité l'ignore** |
| **`INFÉR.`** | Deux étages du même instrument se contredisent sur le même document, sans qu'aucun ne le signale |
| **Statut** | 🔴 **OUVERT** |

## PROTOCOL-D018 — Désaccord `props.actionId` / `trigger.blockId` : deux erreurs opposées

| | |
|---|---|
| **Date** | 2026-08-30 · EXP-1, sondes de **H-07** et **H-12** |
| **Type** | 🔴 **BLIND** |
| **`FACT`** | `AirButton`/`AirEmptyState` dispatchent `props.actionId` **sans lire `trigger.kind`** ; `graph.ts` lit `trigger.blockId` et ignore `props.actionId` pour l'atteignabilité |
| **`FACT`** | Document où les deux désignent des actions différentes : l'écran cible de l'action au déclencheur `ui` est compté atteignable (**faux chemin**) **et** un `EXEC_GHOST_CONTROL` est émis sur un bouton qui agit réellement (**faux fantôme**) |
| **`INFÉR.`** | Un unique construit produit simultanément une erreur en Δ′ et une erreur en Δ |
| **Prévalence corpus** | `FACT` — **1 occurrence** (`plombier-urgence`), sans effet sur l'atteignabilité (un autre chemin existe) |
| **Statut** | 🔴 **OUVERT** |

## PROTOCOL-D019 — Les arêtes de retour de la pile native ne sont modélisées nulle part

| | |
|---|---|
| **Date** | 2026-08-30 · EXP-1, hypothèse gelée **H-03** |
| **Type** | 🟠 **BLIND** |
| **`FACT`** | L'artefact émis utilise `createNativeStackNavigator` ; toute transition franchie ouvre une arête retour (bouton d'en-tête, retour matériel Android). L'AIR n'exprime aucune arête retour ; `reachableScreens()` n'en modélise aucune |
| **`INFÉR.`** | Sans effet sur l'**ensemble** atteignable (on ne revient qu'où l'on est passé). Invalide en revanche tout raisonnement sur les cycles, l'état de formulaire inter-écrans et les parcours |
| **Niveau de preuve** | 🟠 **inspection seule** — aucun cas détecté, aucune exécution |
| **Statut** | 🟠 **OUVERT — fragile** |

## PROTOCOL-D020 — La métrique d'atteignabilité DÉCLARÉE n'a aucun référent observable

| | |
|---|---|
| **Date** | 2026-08-30 · EXP-1 |
| **Type** | 🔴 **BLIND — structurel** |
| **`FACT`** | `screensReachableDeclared` est calculée avec `ALL_TRIGGERS`, c'est-à-dire **sous un moteur qui exécuterait tous les déclencheurs**. Un tel moteur n'existe pas : l'enveloppe v1 porte `triggers: ["ui"]` |
| **`INFÉR.`** | Aucune observation d'aucun artefact produit ne peut établir la valeur de vérité de cette métrique. Elle énonce une propriété d'une machine contrefactuelle |
| **`CONCL.`** | Explique la survie de D004 : non par faiblesse du cas-tueur, mais parce qu'**aucun test observationnel n'était possible** sur la métrique attaquée |
| **🔴 Portée** | **ÉTABLI POUR CETTE MÉTRIQUE UNIQUEMENT.** La généralisation aux 25 gates est **INTERDITE sans mesure** — voir `GATE_SEMANTIC_OBSERVABILITY.md` |
| **Statut** | 🔴 **OUVERT** |

---

# DÉCOUVERTES CAMPAGNE 2 — versées le 2026-08-30 (RN-02 / P2)

> **Versement autorisé par le propriétaire le 2026-08-30.** Aucune de ces
> découvertes n'est corrigée. Chaque entrée conserve son niveau de preuve.
> Preuves exécutables : `docs/elite-protocol/evidence/`.
>
> **Réserve permanente** : les cas-tueurs `KT-C2-*` sont **inventés pour
> l'occasion**, ce que la règle de composition n°3 du `GATE_REGISTER` proscrit.
> Le résiduel assumé s'applique. Les découvertes **mesurées sur le corpus réel**
> (`D008`, `D012`, `D013`) ne sont pas concernées par cette réserve.

## PROTOCOL-D006 — Chemin fantôme par déclencheur `ui` sur un bloc inerte

| | |
|---|---|
| **Type** | 🔴 **BLIND** · `KT-C2-01` |
| **`FACT`** | Une action `{trigger: ui(blk_header), effect: navigate}` traverse les 3 validateurs. Le rapport produit **0 écart** · déclaré **2/2** · effectif **2/2** · effets exécutés **1/1** |
| **`FACT`** | `AirHeader` et `AirDetailHeader` ne portent **aucun** handler de pression ; `HeaderBlock({title, subtitle, testID})` n'accepte pas `onPress` |
| **`INFÉR.`** | L'écran cible est inatteignable au runtime tout en étant compté atteignable par les **deux** métriques. **Coût attaquant : 0 écart** — strictement plus fort que D004, qui en coûtait 4 |
| **Preuve** | `evidence/kt2.mjs` · **Prévalence corpus : 0** |
| **Statut** | 🔴 **OUVERT** |

## PROTOCOL-D007 — L'« atténuation par défense en profondeur » de D004 n'existe pas

| | |
|---|---|
| **Type** | 🔴 **BLIND** — falsification d'une conclusion enregistrée · `KT-C2-02` |
| **`FACT`** | Les métriques *déclarée* et *effective* appellent **la même fonction** `reachableScreens()`, avec un ensemble de déclencheurs différent. Elles partagent donc intégralement le défaut |
| **`FACT`** | Sous une enveloppe élargie à `data`, l'atteignabilité effective passe de **1/2 à 2/2** : elle tombe à son tour |
| **`CONCL.`** | Ce n'est pas une défense en profondeur : c'est une **coïncidence de l'enveloppe v1** (`triggers: ["ui"]`), qui **expirera** le jour où le moteur câblera les déclencheurs `data` |
| **Preuve** | `evidence/kt2.mjs` |
| **Statut** | 🔴 **OUVERT** — l'atténuation notée à la fiche D004 est **retirée** |

## PROTOCOL-D008 — Satisfiabilité de `visibleWhen` : bidirectionnelle et relative à l'enveloppe

| | |
|---|---|
| **Type** | 🔴 **BLIND** · `KT-C2-03` + mesure corpus |
| **`FACT`** | `entity_not_empty` sur une entité sans dataset : bloc jamais rendu, **0 écart** émis. C'est le miroir exact de D005 |
| **`FACT` (corpus réel)** | **2 des 4 blocs conditionnels** du corpus sont morts — et le restent **même sous un moteur complet** (aucune action `mutation delete` sur ces entités) |
| **`INFÉR.`** | Les 2 blocs morts sont ceux **introduits par D-044** pour corriger DET-017 : la correction a créé la classe inverse |
| **`INFÉR.`** | La satisfiabilité est **relative à l'enveloppe** : le couple `déclaré/effectif`, appliqué à l'atteignabilité, ne l'est à aucune autre propriété |
| **Preuve** | `evidence/kt2.mjs`, `evidence/deadness.mjs` |
| **Statut** | 🔴 **OUVERT** |

## PROTOCOL-D009 — Source d'`itemId` acceptée depuis un écran inatteignable

| | |
|---|---|
| **Type** | 🔴 **BLIND** · `KT-C2-04` |
| **`FACT`** | `detailScreens()` calcule `hasItemIdSource` sans aucun test d'atteignabilité. Un bloc `list` situé sur un écran mort satisfait la condition : **aucun** `EXEC_DETAIL_WITHOUT_ITEM_SOURCE` |
| **Preuve** | `evidence/kt2.mjs` |
| **Statut** | 🔴 **OUVERT** |

## PROTOCOL-D010 — Le cliquet de véracité de l'enveloppe atteste une proposition fausse

| | |
|---|---|
| **Type** | 🔴 **BLIND — le plus grave de la campagne** · `KT-C2-05` |
| **Proposition attestée** | `envelope-truth.test.ts` — décrit dans son propre en-tête comme « **le test le plus important du paquet** » — affirme : *« seul le déclencheur `ui` atteint un composant »* |
| **`FACT`** | `emit-project.ts` insère dans `screen.actions` **toute** action référencée par `props.actionId`, **sans lire `trigger.kind`** ; `AirButton`/`AirEmptyState` la dispatchent |
| **`INFÉR.`** | La proposition est **fausse**. Le cliquet teste la **présence d'une chaîne de caractères** dans l'émetteur, pas la propriété sémantique |
| **`CONCL.`** | Conséquences : (a) `EXEC_TRIGGER_INERT` peut viser une action vivante ; (b) `EXEC_GHOST_CONTROL` peut être un **faux positif** ; (c) **le verdict 🟢 de `KT-G05-B03` en campagne 1 est invalidé** ; (d) la mention « **Aucun faux FAIL détecté** » du `GATE_KILLER_TESTS` est **réfutée** |
| **Preuve** | `evidence/kt2.mjs`, `evidence/ratchet.mjs` · **Prévalence corpus : 0** — unsoundness **latente**, non exploitée |
| **Statut** | 🔴 **OUVERT** |

## PROTOCOL-D011 — Quatre « métriques » sont des constantes d'enveloppe

| | |
|---|---|
| **Type** | 🔴 **BLIND** · `KT-C2-07` |
| **`FACT`** | `capabilitiesWired`, `slotsInvoked`, `rulesEnforced`, `blockStatesReachable` valent `0` ou `N` selon un **booléen d'enveloppe**. Sous une enveloppe déclarant `capabilitiesEmitCode: true` : **0 écart**, `capabilitiesWired = 1/1` |
| **`INFÉR.`** | Elles ne peuvent prendre **aucune valeur intermédiaire** ni détecter **aucun défaut unitaire** : elles restituent la déclaration du moteur sur lui-même, jamais une observation de l'artefact |
| **Preuve** | `evidence/kt2.mjs` |
| **Statut** | 🔴 **OUVERT** |

## PROTOCOL-D012 — Dénominateur contaminé de la census de contrôles

| | |
|---|---|
| **Type** | 🟠 **BLIND** — mesure corpus |
| **`FACT`** | `controls()` parcourt **tous** les écrans, atteignables ou non. Mesuré : **53 sites de dispatch morts sur 108 (49 %)** |
| **`INFÉR.`** | Le ratio `ghostControls / controlsVisible` est calculé sur une population dont **la moitié n'est jamais rendue** |
| **Preuve** | `evidence/deadness.mjs` |
| **Statut** | 🔴 **OUVERT** |

## PROTOCOL-D013 — Événements `data` non productibles : défaut latent du corpus réel

| | |
|---|---|
| **Type** | 🔴 **BLIND** — mesure corpus |
| **`FACT`** | **15 déclencheurs `data` sur 36**, répartis sur **10 documents sur 13**, référencent un événement qu'**aucune** action `mutation` ne peut produire — **même sous un moteur complet** |
| **`INFÉR.`** | D004 n'est donc pas seulement une surface d'attaque synthétique : le défaut est **présent dans les documents réels**. La propriété est entièrement dérivable de l'AIR et n'est dérivée nulle part |
| **Preuve** | `evidence/deadness.mjs` |
| **Statut** | 🔴 **OUVERT** |

## PROTOCOL-D014 — Volatilité des preuves — 🟢 RÉSOLUE

| | |
|---|---|
| **Type** | 🟠 **BLIND (méthodologique)** |
| **`FACT`** | Le registre citait `scratchpad/exploit.mjs` et `scratchpad/kt.mjs` : ces chemins **n'existaient pas dans le dépôt**. Les fichiers vivaient dans `/private/tmp/claude-501/<session>/scratchpad/`, stockage temporaire propre à une session |
| **`INFÉR.`** | Violation directe de **P-G** : l'observation brute doit être conservée, adressée, et re-vérifiable sans refaire tourner l'agent |
| **Correction** | 🟢 **RÉSOLUE le 2026-08-30** — versement dans `docs/elite-protocol/evidence/` (10 scripts + README + empreintes SHA-256). `exp1b.mjs` ré-exécuté depuis le dépôt : résultat identique |
| **Reste ouvert** | `RN-04` — le dossier `docs/elite-protocol/` n'est lui-même **pas encore suivi par Git** |
| **Statut** | 🟢 **RÉSOLUE** — enregistrement conservé (règle de tenue) |

---

## PROTOCOL-D021 — Le modèle de sévérité ne peut pas représenter la composition (RN-03 / P4)

| | |
|---|---|
| **Date** | 2026-08-30 · EXP-1 étape 8 · versé par **RN-03** |
| **Type** | 🔴 **résultat expérimental structurel** |
| **Question posée** | le modèle peut-il représenter `severity(A + B) > max(severity(A), severity(B))` ? |
| **`FACT` (structure)** | `FeasibilityGap = {code, path, owner, detail}` — aucun identifiant, **aucun champ référençant un autre écart**. `analyzeFeasibility` n'examine jamais deux écarts conjointement. L'agrégat publié est `gaps.length` ; le verdict est `gaps.length === 0 ? … : …` |
| **`FACT` (mesure)** | A = 2 écarts · B = 2 écarts · A∪B = **4** — **strictement additif** |
| **`INFÉR.`** | Toute agrégation `Σ w(g)` ou `max w(g)` sur des items **indépendants** est une fonction du multi-ensemble des sévérités individuelles. La superadditivité exige un terme dépendant d'une **paire** ; **aucun porteur d'arité 2 n'existe** dans le modèle |
| **`CONCL.` 1** | **Non représentable aujourd'hui** — l'agrégat est un comptage de poids 1 |
| **`CONCL.` 2** | **Non représentable après la correction prévue de PROTOCOL-D002** (« sévérité dérivée de la nature ; le score agrège par sévérité ») : une sévérité **scalaire** change les poids, jamais l'arité. **Problème de porteur, pas de réglage** |
| **`CONCL.` 3** | **Le phénomène de `PROTOCOL-D015` n'est pas un phénomène de sévérité** : dans les deux configurations mesurées il y a **2 écarts critiques** ; seul le champ `owner` change, et le score ne l'agrège pas |
| **Preuve** | `docs/elite-protocol/evidence/exp1b.mjs` |
| **Statut** | 🔴 **OUVERT — non corrigé.** `E-11` interdit la correction prématurée ; `E-18` exige qu'un modèle retenu déclare explicitement la classe de comportements qu'il ne peut pas voir |
