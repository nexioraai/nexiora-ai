# RN-01 — RÈGLE DE GRANULARITÉ `R-GRAN-2`

| | |
|---|---|
| **Statut de la règle** | 🟢 **ADOPTÉE le 2026-08-30** (décision propriétaire) — `D-1` → `D-15` en vigueur. 🔴 **L'IMPLÉMENTATION DE RÉFÉRENCE EST NON CONFORME** : voir `DEF-1` |
| **Date de consignation** | 2026-08-30 |
| **Origine** | arbitrages propriétaires successifs après trois audits de faisabilité (exécution · déclaratif · contrainte de valeur) |
| **Portée** | ce document consigne des **décisions de cadrage**. Il ne modifie pas le protocole canonique et n'autorise aucune analyse causale |

> 🔴 **RN-01 reste NON ADOPTÉE. RN-04 reste bloqué. EXP-2 reste interdit.**
> La liste gelée des hypothèses et le recalcul d'EXP-1 ne viennent qu'**APRÈS**
> adoption formelle, jamais avant.

---

## D-1 · Trois espaces

`R-GRAN-2` est une règle à **trois espaces**, jamais un espace unique :

| Espace | Unité | Porteur |
|---|---|---|
| **EXECUTION** | nœud de branchement | liste close de 9 genres AST |
| **DECLARATIVE** | membre nommé d'un contrat déclaré | `PropertySignature` · `PropertyAssignment` · membre du type résolu |
| **VALUE-CONSTRAINT** | `(racine, chemin, contrainte)` | objet de schéma **à l'exécution** |

## D-2 · Périmètre des modules — **fichiers source uniquement**

**Exclus** : fichiers générés, copies, sorties de codegen.

🔴 **Limite explicite de cette exclusion** :

| Fait | Conséquence |
|---|---|
| `packages/compiler/src/embedded-assets.generated.ts` porte **le runtime entier encodé en chaîne de caractères** | son contenu échappe à tout ancrage AST |
| **4 copies** de `air-runtime.tsx` existent (compiler · 2 slices · fixture de banc) | seule la copie source est au périmètre ; **une dérive entre copies serait invisible à la règle** |
| les écrans émis (`slices/*/app/screens/*.tsx`) portent des branchements | **hors périmètre**, donc non ancrés |

## D-3 · Périmètre d'observation — **séparé** du périmètre des modules

Les artefacts produits servant à l'**annotation** (jamais à la génération d'unités) :

| Artefact | Rôle | Gardé par un schéma ? |
|---|---|---|
| `packages/design-tokens/tokens.json` | source validée | 🟠 **oui** — `designTokensSchema.parse()` |
| `slices/*/app/lib/tokens/theme.generated.ts` | dérivé de codegen | 🟢 **non** — jamais re-validé |
| `slices/*/app/demo.data.ts` | fixtures compilées | 🟢 non |
| `slices/*/app/screens/*.data.ts` | données canoniques d'écran | 🟢 non |
| `packages/golden-corpus/corpus-v2/*.air.json` · `slices/*/air/*.air.json` | documents d'entrée | 🟠 oui |
| `slices/*/results/metrics.json` | journaux de campagne | 🟢 non |

**Un périmètre de modules ne vaut jamais périmètre d'observation, et réciproquement.**

## D-4 · Observabilité — **retirée de la règle**

L'observabilité **ne fait plus partie** de la règle de granularité. Elle devient une
**annotation appliquée après le gel** de la liste. Elle **ne filtre aucune
hypothèse** : une unité non observable reste une unité.

## D-5 · U-VAL — énoncé adopté comme énoncé de travail

> **« Dans tout artefact du périmètre d'observation déclaré, toute valeur occupant ce chemin satisfait cette contrainte. »**

Chaque couple (unité × artefact) porte une **qualification d'épreuve** obligatoire :

| Qualification | Condition |
|---|---|
| `ÉPREUVE RÉELLE` | l'artefact n'a pas pour unique garde le schéma dont la contrainte est issue |
| `VRAI ANALYTIQUEMENT` | l'artefact ne franchit que ce schéma — **sans valeur probante**, à qualifier comme tel |
| `NON OBSERVABLE` | le chemin n'existe pas dans cet artefact |

**L'unité ne doit jamais être une tautologie du schéma sur lui-même.**

## D-6 · ZV2 — comptage positionnel

Une occurrence de schéma est comptée par **`(racine, chemin)`**, **sans déduplication
par identité d'objet partagé**.

**Raison mesurée** : sous factorisation, `(racine, chemin)` donne **3 = 3** ; la
déduplication par identité donne **1 vs 3** — le décompte dépendrait du style d'écriture.

🔴 **`L-B1` consignée** — l'index de branche d'union **suit l'ordre de déclaration**.
`z.union([string.min(3), number.int()])` produit `v|0::min_length`, `v|1::number_format` ;
l'ordre inverse **échange les contenus**. Le décompte reste stable, **l'identité d'une
unité donnée ne survit pas à un réordonnancement des branches d'union**.

## D-7 · D2 / D3 — granularité des collections et registres

| Cas | Décision | Sous-couverture induite |
|---|---|---|
| **entrée de registre** (`{ id: "button", … }` dans `BLOCKS`) | **une unité** | — |
| **membre à valeur de collection** (`states: ["ready"]`, `fieldRefProps: []`) | **une unité**, même s'il porte plusieurs assertions | 🔴 **documentée** : N assertions d'appartenance sont portées par 1 unité ; une violation portant sur un seul élément n'est pas distinguable au niveau de l'unité |

## D-8 · ZV1 / ZV5 — limites déclarées, jamais converties en unités

| Limite | Contenu |
|---|---|
| **ZV1** | le **corps** d'un prédicat `refine`/`superRefine` n'est pas introspectable. Son **existence** est ancrée (`CHECK:custom`), **son contenu ne l'est pas**. 1 occurrence au dépôt |
| **ZV5** | la méthode dépend des internes de **zod 4.4.3** ; une montée de version peut déplacer `def` |

Ces limites restent **déclarées**. Elles ne sont pas transformées artificiellement en unités.

## D-9 · R-RATT — règle de rattachement inter-espaces

> Deux unités de deux espaces se rattachent **ssi** la contrainte U-VAL est
> **(i) représentable** dans le type résolu — ensemble **clos** : `ENUM`, `LITERAL`,
> `MODALITY:optional`, `MODALITY:nullable` — **et (ii) effectivement représentée**
> (comparaison d'ensembles). Hors de cet ensemble clos : **AUTONOME**, sans exception.

La règle **sous-rattache** : elle ne fusionne jamais deux assertions distinctes ; elle
peut laisser séparées deux assertions identiques. Direction d'erreur **sûre**.

## D-10 · 🔴 LIMITATION PRÉ-ENREGISTRÉE — à lire AVANT tout recalcul d'EXP-1

> **Sous `R-GRAN-2`, une intersection VIDE de `N(D004)` et `N(D005)` ne pourra PAS,
> à elle seule, démontrer H2.**
>
> - une intersection **non vide** pourra être établie ;
> - une intersection **vide** restera **compatible avec un sous-rattachement** de
>   `R-RATT`, laquelle sous-rattache par construction (D-9).

**Cette limitation est inscrite AVANT tout recalcul.** Aucune session ne peut
l'ignorer ni la découvrir après coup.

## D-11 · Non-contamination

**Aucune** nouvelle hypothèse de granularité ne peut être créée à partir de D004 ou
D005. Leur résultat attendu ne peut **jamais** justifier une règle. Toute règle dont la
justification exige de les mentionner est déclarée **CONTAMINÉE / NON RECEVABLE**.

---

## Supports de preuve

`docs/elite-protocol/evidence/` — `rn01-gran-branches.mjs` · `rn01-decl-units.mjs` ·
`zd3-vocab.mjs` · `zd3-syntaxsites.mjs` · `zd3-extract.mjs` · `zd3-coverage.mjs` ·
`rn01-A-uval.mjs` · `rn01-BC.mjs` · `rn01-ratt-elargi.mjs`.

## D-12 · A-2 — statut des modalités *(décidé le 2026-08-30)*

**Question** : `optional` / `nullable` / `default` sont-elles des unités, et de quel espace ?

### Critère mécanique retenu — le PORTEUR STABLE

> Une modalité appartient à l'espace de son **porteur stable** : celui dont
> l'observabilité **ne dépend d'aucune option de compilation**.
> - porteur = **drapeau `Optional` du symbole** ⇒ espace **DECLARATIVE** ;
> - porteur = **ensemble des valeurs admises du type** ⇒ espace **VALUE-CONSTRAINT** ;
> - **deux porteurs stables distincts** ⇒ **deux unités**, une par espace.

### `FACT` — mesure des porteurs

| forme | drapeau `Optional` (sortie) | type de sortie | entrée optionnelle |
|---|---|---|---|
| `.optional()` | **true** | `string \| undefined` | true |
| `.nullable()` | false | `string \| null` | false |
| `.default("x")` | false | `string` | **true** |
| *(requis)* | false | `string` | false |

**Trois porteurs différents ⇒ les trois formes ne sont pas fusionnées** (exigence 5).

### `FACT` — épreuve de stabilité du porteur

| | `exactOptionalPropertyTypes=false` | `=true` |
|---|---|---|
| `opt` | drapeau **true** · type `string \| undefined` | drapeau **true** · type `string` |
| `nul` | drapeau false · type `string \| null` | drapeau false · type `string \| null` |

`INFÉRENCE` — le `\| undefined` d'un membre optionnel **disparaît** sous une option de
compilation : ce n'est **pas** un porteur stable. Le drapeau du symbole est invariant.
Le `\| null` d'un membre nullable est invariant : c'est un porteur stable **du type**.

### DÉCISION

| Forme | Espace | Unités | Justification |
|---|---|---|---|
| **`optional`** | **DECLARATIVE** | **1** | seul porteur stable = drapeau du symbole ⇒ assertion sur la **présence du membre**, pas sur la valeur. **N'est PAS une unité VALUE-CONSTRAINT** |
| **`nullable`** | **VALUE-CONSTRAINT** | **1** | seul porteur = ensemble des valeurs admises, stable. Élargit cet ensemble avec `null` |
| **`default`** | **DECLARATIVE + VALUE-CONSTRAINT** | **2** | deux porteurs stables distincts : optionalité **d'entrée** (drapeau) **et** valeur substituée (`defaultValue`). Aucun recouvrement entre les deux |

### `FACT` — occurrences dans le périmètre source

`.optional()` = **36** · `.nullable()` = **0** · `.default()` = **0**.
`INFÉRENCE` — la décision n'a d'effet numérique immédiat que sur `optional` ; les règles
`nullable` et `default` sont **fixées à l'avance**, sans cas pour les motiver.

### Conséquence numérique — 3 racines neutres

| | avant D-12 | après D-12 |
|---|---:|---:|
| unités VALUE-CONSTRAINT | 129 | **121** |
| dont `MODALITY:optional` | 8 | **0** *(déplacées vers DECLARATIVE)* |
| `R-RATT` — RATTACHÉE | 14 (10,9 %) | **6 (5,0 %)** |

🔴 **A-2 est résolue : les deux instruments convergent sur 121.**

`INFÉRENCE` — cette décision **dégrade** le taux de rattachement de R-RATT (10,9 % → 5,0 %).
Elle n'a donc pas été retenue pour son résultat.

### Limites de D-12

| # | Limite |
|---|---|
| **L-D12-1** | `z.union([z.string(), z.undefined()])` produit un nœud `union`, **pas** `optional` : deux écritures de « membre possiblement absent » donnent des unités différentes. **0 occurrence** au périmètre, mais la frontière n'est pas invariante par réécriture |
| **L-D12-2** | Les règles pour `nullable` et `default` sont **fixées sans aucun cas d'usage** : elles ne sont pas éprouvées |
| **L-D12-3** | Le critère « porteur stable » a été éprouvé sur **une seule** option (`exactOptionalPropertyTypes`). Une autre option pourrait déstabiliser un porteur réputé stable |

**Preuve** : `evidence/rn01-A2-modalites.mjs`

---

## D-13 · AMB-1 — les MÉTHODES sont des unités déclaratives *(décidé le 2026-08-30)*

**DÉCISION** : `MethodSignature` et `MethodDeclaration` **sont** des membres nommés d'un
contrat déclaré. Elles engendrent une unité, au même titre qu'une propriété.

**Fondement — le principe déjà établi par `D-6`** : *« la déduplication par identité
d'objet ferait dépendre le décompte d'un choix de factorisation du code source »*.
Le même principe s'applique ici.

`FACT` — Épreuve mécanique : les deux écritures d'un même contrat

```
interface C { lister(id: string): readonly string[] }        // méthode
interface C { lister: (id: string) => readonly string[] }    // propriété de type fonction
```

résolvent au **même ensemble de membres** — `lister: (id: string) => readonly string[]`.

`INFÉRENCE` — Exclure `MethodSignature` ferait dépendre le décompte du **style
d'écriture**, ce que `D-6` proscrit. Preuve : `evidence/rn01-AMB-fondement.mjs`.

## D-14 · AMB-2 — les LITTÉRAUX DE TYPE ANONYMES sont des contrats déclarés

**DÉCISION** : un littéral de type anonyme porte des membres nommés ; ses membres
engendrent des unités.

**Fondement — même principe que `D-13`.** `FACT` — un littéral anonyme et l'interface
qu'on en extrairait résolvent au **même ensemble de membres**. `INFÉRENCE` — les exclure
ferait dépendre le décompte de l'**extraction ou non d'une interface nommée** : un
refactoring sans changement de sens modifierait le nombre d'unités.

**Conséquence mesurée** : `data-provider.tsx` passe de 5 (lecture A) / 6 (lecture B) à
**7** — l'union exacte. Les deux exécutants avaient chacun raison à moitié.

## D-15 · AMB-3 — IDENTITÉ CANONIQUE D'UNE UNITÉ

**DÉCISION** — trois formes, une par espace :

```
EXEC::<module>::<portée nommée>::<genre>#<ordinal>
DECL::<module>::<adresse du contrat>::<nom du membre>
VAL ::<racine>::<chemin>::<genre>::<détail canonisé>
```

- **portée nommée** : chaîne des déclarations nommées englobantes (fonction, classe,
  interface, alias, variable, méthode), de la plus externe à la plus interne ; `«module»`
  si aucune ;
- **adresse du contrat** : nom de l'interface / de l'alias / de la variable portant le
  littéral ; pour un littéral **anonyme**, `<portée nommée>/{}#<ordinal>` ;
- 🔴 **l'ordinal est calculé en PARCOURS PRÉFIXE**, imposé. Sans cette clause, un
  exécutant en largeur et un exécutant en profondeur produiraient des ordinaux
  différents — donc des frontières différentes.

`FACT` — **Épreuve d'invariance au reformatage** (indentation doublée, lignes vides
insérées) : `registry.ts` **22 → 22 identités identiques** · `data-provider.tsx`
**7 → 7 identiques**.
`FACT` — **Contre-épreuve** : une identité `fichier@ligne:colonne` **ne survit pas** au
reformatage. C'est le schéma qu'avaient dû improviser les exécutants de l'étape 5 : il
était inadéquat.

**Limite `L-D15-1`** — l'ordinal `EXEC` reste **positionnel** : un branchement n'a pas de
nom. L'insertion d'un branchement de même genre dans la même portée **renumérote** ses
suivants. Aucune identité stable n'existe pour un objet sans nom ; la limite est
déclarée, non résolue.

**Preuve** : `evidence/rn01-AMB3-identite.mjs`

---

## Résultats de l'étape 4 — mesure élargie de R-RATT (2026-08-30)

Trois racines **neutres** · preuve : `evidence/rn01-ratt-elargi.mjs`

| Racine | Unités | RATTACHÉE | AUTONOME | NON RÉSOLU | dont STRICTNESS |
|---|---:|---:|---:|---:|---:|
| `designTokensSchema` | 78 | 1 | 77 | 0 | 14 |
| `projectLockSchema` | 23 | 1 | 22 | 0 | 7 |
| `deploymentStateSchema` | 28 | 12 | 16 | 0 | 5 |
| **TOTAL** | **129** | **14 (10,9 %)** | **115** | **0** | **26 (20,2 %)** |

- **Stabilité de la frontière** : 🟢 deux passes — frontières **et** verdicts identiques.
- **Rattachements par genre** : `MODALITY:optional` = **8** · `ENUM` = **3** · `LITERAL` = **3** = 14.
  🔴 *Rectification du 2026-08-30 : la version initiale de cette ligne indiquait 10 · 4 · 3, dont la somme (17)
  contredisait le total mesuré (14). Erreur de transcription, corrigée ; le total 14 n'a jamais varié.*
- 🔴 **Recouvrement résiduel** : les **26** unités `STRICTNESS` (20,2 %) ne sont
  **jamais** rattachables — la stricticité n'est pas un membre du type résolu (`L-C2`).
- 🔴 **`L-C4` confirmée par la mesure** : l'échantillon initial de 3 unités donnait
  **67 %** de rattachement ; la mesure élargie donne **10,9 %**. L'échantillon était
  **non représentatif d'un facteur 6**.

### Anomalie d'instrument corrigée (pas la règle)

`FACT` — Première exécution : **16 unités NON RÉSOLU**. Cause identifiée : la descente
de type échouait au premier membre **optionnel** (`T | undefined` n'expose aucune
propriété). `getNonNullableType` appliqué avant descente. Après correctif :
**NON RÉSOLU 16 → 0**, **RATTACHÉE 6 → 14**. **`R-RATT` est inchangée** ; seul l'outil
l'était. Les deux mesures sont conservées ci-dessus (état final) et au rapport de session.

### 🔴 Divergence entre instruments — à arbitrer AVANT le gel

`FACT` — `zd3-coverage.mjs` compte **20** unités pour `deploymentStateSchema` ;
`rn01-ratt-elargi.mjs` en compte **28**. Écart = **8 unités `MODALITY:*`**, émises par
le second et non par le premier. **Les deux instruments n'énumèrent pas le même
ensemble d'unités.** Sous `D-6`, l'ensemble doit être canonique : la question
« une modalité (`optional`/`nullable`/`default`) est-elle une unité ? » **n'est pas
tranchée** et doit l'être avant toute liste gelée.

---

## Résultats de l'étape 5 — test à deux exécutants (2026-08-30)

**Dispositif** : deux implémentations écrites **séparément depuis le texte D-1 → D-12**,
structures et ordres délibérément différents (A : récursif, ordre de déclaration ·
B : itératif par file/pile, clés triées, racines en ordre inverse). Corpus **neutre**,
ni chemin D004 ni chemin D005. Preuves : `evidence/rn01-E5-executant-A.mjs`,
`rn01-E5-executant-B.mjs`.

| Espace | A | B | ∩ | Divergence de frontière |
|---|---:|---:|---:|---|
| `EXECUTION` — `blocks/src/registry.ts` | 22 | 22 | 22 | 🟢 **aucune** |
| `DECLARATIVE` — `compiler/runtime/data-provider.tsx` | 5 | 6 | 4 | 🔴 **3 unités** |
| `VALUE-CONSTRAINT` — 3 racines de schéma | 121 | 121 | 121 | 🟢 **aucune** |

# 🔴 VERDICT : ÉCHEC — une divergence de frontière est observée.

### Les deux ambiguïtés de `D-1` mises au jour

| # | Question non tranchée par la règle | A | B |
|---|---|---|---|
| **AMB-1** | une **méthode** est-elle un membre nommé d'un contrat déclaré ? `D-1` cite `PropertySignature` / `PropertyAssignment`, **jamais `MethodSignature`** | **non** | **oui** |
| **AMB-2** | un **littéral de type anonyme** (ici `PropsWithChildren<{ provider: DataProvider }>`) est-il un « contrat déclaré » ? | **oui** | **non** |

`FACT` — Sous la lecture de A, `interface DataProvider` — le contrat de données de
l'application générée — engendre **ZÉRO unité** : ses deux seuls membres sont des
méthodes. `INFÉRENCE` — le choix de lecture ne déplace pas une frontière marginale :
il fait disparaître **un contrat entier** de l'espace déclaratif.

### `AMB-3` — l'identité d'une unité n'est définie nulle part

`FACT` — `D-1` → `D-12` ne spécifient **aucun format d'identité** d'unité. Les deux
exécutants ont dû en inventer un (`fichier@ligne:colonne` pour les espaces syntaxiques,
`racine|chemin|genre|détail` pour l'espace valeur). Deux exécutants choisissant des
schémas d'identité différents rendraient **toute comparaison impossible**.

### Anomalie d'implémentation — trouvée, corrigée, tracée

`FACT` — Première exécution de B : **0 unité** dans l'espace `EXECUTION`. Cause :
`ts.forEachChild` **interrompt son parcours** dès que le callback retourne une valeur
vraie ; `Array.prototype.push` retourne la nouvelle longueur. B ne visitait que la
première branche de chaque nœud. Correctif : callback à retour vide. Après correctif :
**0 → 22**, convergence exacte avec A. **La règle n'était pas en cause.**

### Portée du résultat

`CONCL.` — Les convergences observées sur `EXECUTION` et `VALUE-CONSTRAINT`
**ne prouvent pas** l'absence d'ambiguïté : elles constatent seulement qu'aucune
divergence n'est apparue entre **ces deux implémentations** sur **ce corpus**.

`FACT` — Les deux exécutants procèdent du **même modèle**. Le test détecte une
ambiguïté de **spécification** ; il n'établit **aucune indépendance**.

---

## Résultats de l'étape 5 REJOUÉE — après D-13 / D-14 / D-15 (2026-08-30)

Deux exécutants réécrits depuis la spécification résolue, implémentations à nouveau
distinctes : A récursif, portée obtenue **en remontant les parents**, ordre de
déclaration · B itératif par pile, portée **propagée vers le bas**, `DECL` en deux
passes avec membres triés, `VAL` en largeur à clés triées, racines en ordre inverse.
Preuves : `evidence/rn01-E5b-executant-A.mjs`, `rn01-E5b-executant-B.mjs`.

| Espace | A | B | ∩ | Divergence de frontière | Ordre |
|---|---:|---:|---:|---|---|
| `EXECUTION` | 22 | 22 | **22** | 🟢 aucune | identique |
| `DECLARATIVE` | **7** | **7** | **7** | 🟢 aucune | différent — toléré |
| `VALUE-CONSTRAINT` | 121 | 121 | **121** | 🟢 aucune | différent — toléré |

# 🟢 VERDICT : CONVERGENCE — aucune divergence de frontière observée.

**Comparaison avec l'étape 5 initiale** : l'espace `DECLARATIVE` passe de **5 vs 6
(∩ = 4)** à **7 vs 7 (∩ = 7)**. Les trois unités litigieuses sont désormais **toutes
comptées** : les deux méthodes de `interface DataProvider` (`D-13`) **et** le membre du
littéral anonyme (`D-14`).

### 🔴 Ce que cette convergence NE prouve PAS

| # | Réserve |
|---|---|
| **R-1** | `CONCL.` — une convergence **ne prouve pas** l'absence d'ambiguïté. Elle constate qu'aucune divergence n'est apparue entre **ces deux implémentations** sur **ce corpus** |
| **R-2** | 🔴 `FACT` — **une part de la convergence est obtenue par construction** : `D-15` **impose** le parcours préfixe pour l'ordinal. Cette clause **retire** un degré de liberté qui aurait produit une divergence entre un exécutant en profondeur et un exécutant en largeur. La convergence sur `EXECUTION` mesure donc autant la **contrainte ajoutée** que l'absence d'ambiguïté résiduelle |
| **R-3** | `FACT` — les deux exécutants procèdent du **même modèle**, avec la même bibliothèque et le même environnement. **Aucune indépendance n'est établie** |
| **R-4** | `FACT` — corpus : **un** module par espace syntaxique, **trois** racines de schéma. Le contrat AIR est exclu (il porte les chemins D004/D005) |
| **R-5** | `L-D12-2` toujours active : `nullable` et `default` ont **0 occurrence** — le test **ne les a pas éprouvés** |
| **R-6** | `L-B1` non éprouvée : aucune union n'a été réordonnée |
| **R-7** | `L-D15-1` : l'ordinal `EXEC` reste positionnel — l'insertion d'un branchement de même genre dans la même portée renumérote ses suivants |

---

## 🟠 AMENDEMENT DU 2026-08-30 — RN-01 SUSPENDU

**Arbitrage propriétaire.** RN-01 est **suspendu en l'état**, non abandonné.

| | |
|---|---|
| **Motif** | `R-22` « le protocole comme refuge » et l'alarme `G23` (analyse ≫ construction). 12 sessions consacrées à définir *comment compter des hypothèses* ; aucun effet sur le produit |
| **Ce que RN-01 bloquait réellement** | uniquement EXP-2 → classification causale de D004/D005 → correction de G4/G5. **Ces corrections sont de toute façon interdites et hors du chemin de sortie de Phase 10** |
| **Coût opérationnel de la suspension** | **nul** — aucun critère de sortie de Phase 10 ne dépend de RN-01 |
| **Conservation** | 🟢 **intégrale** — `D-1` → `D-15`, `DEF-1`, les deux passages de l'étape 5, la liste non gelée et **30 artefacts de preuve** sont conservés. Rien n'est supprimé ni réécrit |
| **Condition de RÉOUVERTURE** | RN-01 ne rouvre **que si** une correction causale de G4/G5 devient nécessaire au produit. Ce n'est **pas** une borne temporelle |
| **Dette laissée ouverte** | `DEF-1` non corrigé · étape 5 invalidée · liste non gelée · le point de gouvernance : *que vaut un test à deux exécutants issus du même modèle ?* |

**Saut d'étages assumé et consigné (`D-017`)** — le plan de remise à niveau ordonne
étages 0 → 6. Revenir à la Phase 10 saute les étages 2 à 4. Ce saut est **explicite,
motivé et daté** ; il n'est pas silencieux.

**Bascule** : de `CONSTRAINT` (raffiner la règle de preuve) vers `CAPACITY`/`SIGNAL`
(construire un instrument d'observation). C'est la nature de travail que l'alarme `G23`
réclamait.

---

## 🔴 DEF-1 — L'IMPLÉMENTATION DE RÉFÉRENCE NE MET PAS EN ŒUVRE `D-1` (2026-08-30)

**Découvert par l'audit de l'étape 7, AVANT tout gel.**

### `FACT` — l'anomalie
L'audit signale **5 modules du périmètre à ZÉRO unité déclarative**, dont
`packages/air-schema/src/air.ts`. Vérification : ce module porte **127 `PropertyAssignment`**,
dont **127 en argument d'appel** et **0 affecté à une variable**.

`INFÉRENCE` — L'implémentation de référence (exécutants A′ **et** B′) ne retient un
littéral d'objet **que s'il est affecté à une variable**. `D-1` nomme `PropertyAssignment`
comme porteur **sans cette restriction** : elle est une invention de l'implémentation.

### `FACT` — la restriction viole le fondement de `D-13`/`D-14`

| Écriture | règle « affecté à une variable » | règle `D-1` |
|---|---:|---:|
| `const s = z.strictObject({ a: x, b: y })` | **0** | 2 |
| `const forme = { a: x, b: y }` puis `z.strictObject(forme)` | **2** | 2 |

`CONCL.` — La restriction fait **dépendre le décompte du style d'écriture** — exactement
ce que `D-6`, `D-13` et `D-14` interdisent.

### `FACT` — ampleur mesurée

| | Unités DECLARATIVE |
|---|---:|
| conforme à `D-1` (membres à toute profondeur) | **600** |
| produites par l'implémentation de référence | **201** |
| **manquantes** | **399 — 66,5 % de sous-couverture** |

Écarts : `air.ts` 127 · `definitions.ts` 85 · `emit-project.ts` 71 · `feasibility.ts` 60 ·
`design-tokens/schema.ts` 51 · `graph.ts` 41.

### 🔴 CONSÉQUENCE — l'étape 5 rejouée est INVALIDÉE COMME PREUVE

`FACT` — A′ et B′ portaient **la même restriction**.
`CONCL.` — Leur convergence est un **mode commun**, non une validation. La réserve `R-3`
— *« les deux exécutants procèdent du même modèle »* — se matérialise : deux lectures
« indépendantes » ont produit **la même erreur de lecture**.

`INFÉRENCE` — Un test à deux exécutants ne détecte **qu'une divergence**. Une convergence
reste compatible avec une **faute commune**. Ce qui n'était qu'une réserve est désormais
**démontré sur un cas réel**.

### Décision de l'étape 7
🔴 **LA LISTE N'EST PAS GELÉE.** Geler une liste connue non conforme à `D-1` falsifierait
un artefact de preuve. Les 745 unités sont conservées comme **mesure**, jamais comme liste
gelée : `evidence/rn01-E7-liste-NON-GELEE.json`.

**Non touché par `DEF-1`** : `EXECUTION` (270) et `VALUE-CONSTRAINT` (274) — leurs
implémentations ne portent pas la restriction. `air.ts` porte réellement **0 branchement** :
son absence de l'espace `EXECUTION` est un fait, pas un défaut.

---

## Séquence d'adoption — état

| # | Étape | État |
|---|---|---|
| 1 | audits de faisabilité des 3 espaces | 🟢 faits — verdicts **B** |
| 2 | arbitrages A / ZV2 / R-RATT | 🟢 faits |
| 3 | consignation des décisions D-1 → D-11 | 🟢 **ce document** |
| 4 | **mesure élargie de R-RATT** sur 3 racines neutres | 🟢 faite — voir rapport de session |
| 5 | test à **deux exécutants** sur la règle complète | 🔴 **INVALIDÉ PAR `DEF-1`** — la convergence était un mode commun. Les deux passages restent conservés |
| 6 | adoption formelle de `R-GRAN-2` | 🟢 **ADOPTÉE 2026-08-30** — `D-1` → `D-15` en vigueur. Sa base probante (étape 5) est invalidée par `DEF-1` |
| 7 | liste gelée des hypothèses | 🔴 **EXÉCUTÉE — NON GELÉE** : 745 unités (270/201/274), identité 🟢, couverture 🔴 `DEF-1` |
| 8 | recalcul d'EXP-1 | 🔴 **interdit** — exige une liste gelée conforme |
