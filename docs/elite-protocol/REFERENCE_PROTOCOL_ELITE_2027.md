# PROTOCOLE DE RÉFÉRENCE ELITE 2027 A+ — DOCUMENT CANONIQUE

| | |
|---|---|
| Version | **0.3** — NON CERTIFIÉ |
| Date | 2026-08-30 |
| Statut | 🔴 la validité du protocole n'est **pas établie** (aucun cas-tueur exécuté) |
| Portée | s'applique **récursivement** : au protocole, à l'architecture, au générateur, à l'application |
| Lire d'abord | `README.md` — notamment les deux collisions de vocabulaire |

---

## A. OBJECTIF

Le protocole existe parce qu'un fait a été établi par la mesure : le moteur
de génération produisait des applications dont **1 contrôle sur 3
fonctionnait**, dont **aucun formulaire n'enregistrait**, et **tous les
instruments existants rendaient un verdict vert** (Oracle L1 7/7, grille A++
A→H conformes, 0 réparation, 0 contournement).

Le défaut n'était pas une affirmation fausse. Aucun instrument n'avait
menti. Le défaut était que la proposition *« ce bouton fait-il quelque
chose ? »* **n'existait dans aucun registre du système**.

Le protocole ne sert donc pas à mieux tester. Il sert à garantir que
**l'ensemble des propositions à prouver n'est pas écrit à la main**.

---

## B. STANDARD — DÉFINITION FORMELLE

> Un système est **ELITE 2027 A+** si, pour toute spécification valide — y
> compris d'un domaine jamais vu — il produit un artefact tel que **chaque
> propriété que la spécification revendique** est soit **démontrée au niveau
> de preuve exigé par sa nature**, soit **explicitement déclarée non
> démontrée**, sans qu'aucun troisième état ne soit atteignable.

Trois conséquences :
- « Elite » n'est pas une note de qualité : c'est une propriété du **système
  de preuve**.
- Une application peut être Elite avec peu de fonctions, si tout ce qu'elle
  promet est démontré.
- Une application riche dont une promesse n'est pas démontrée **n'est pas
  Elite**.

### La scission qui structure tout

| Propriété du protocole | Prouvable ? | Pourquoi |
|---|---|---|
| **VALIDITÉ** (aucun PASS faux sur ce qu'il vérifie) | 🟢 oui, par construction | testable par mutation : on casse la propriété, la gate doit tomber |
| **COMPLÉTUDE** (il vérifie tout ce qui compte) | 🔴 **jamais** | il faudrait connaître l'ensemble de ce qui compte |

**Le protocole maximise la validité par construction et traite la complétude
comme une grandeur ouverte, estimée — jamais comme un acquis.**

### La complétude est mesurable indirectement

**TAUX DE DÉCOUVERTE EXTERNE** : nombre de propriétés essentielles
découvertes par une source extérieure au protocole, par sonde indépendante.

| Observation | Lecture |
|---|---|
| chaque sonde externe trouve une propriété nouvelle | complétude faible |
| le taux décroît sur N sondes **décorrélées** | confiance croissante, jamais preuve |
| taux nul mais sondes corrélées | **aucune information** — le cas le plus dangereux |

*Mesure du 2026-08-29 : 4 sondes externes, 4 propriétés essentielles
trouvées. Taux = 100 %. La complétude est proche de zéro, et c'est mesuré.*

### Terminaison de la chaîne de certification

L'analogie correcte est **métrologique, pas logique** (invoquer Gödel serait
une erreur de catégorie : ses résultats portent sur des systèmes formels
arithmétiques).

> **Aucun instrument ne peut mesurer sa propre erreur systématique.** Un
> instrument se calibre contre un étalon extérieur. La chaîne remonte à un
> **étalon primaire, convenu et non démontré**.

La chaîne `Protocole → Générateur → Application` ne se termine donc pas par
une preuve mais par une **convention traçable** : la décision humaine signée.

---

## C. PRINCIPES NON NÉGOCIABLES

### P-A · EXHAUSTIVITÉ DÉRIVÉE
Les obligations de preuve sont **dérivées mécaniquement de la
spécification**, jamais écrites à la main. Chaque élément déclaré engendre
son obligation : chaque écran → « atteignable ? » ; chaque action →
« produit son effet ? » ; chaque capability → « câblée ? ».

> 🔴 **Limite mesurée** : P-A n'a de sens que si la dérivation est **totale
> sur la grammaire du schéma**. Une dérivation partielle réintroduit la
> liste écrite à la main un étage plus bas. *Couverture actuelle : 45 %
> (36 champs visités sur 80).*

### P-B · NIVEAU DE PREUVE PAR NATURE
Le niveau exigé dépend de la **nature** de la proposition, jamais de la
commodité de la mesure.

### P-C · LE SILENCE EST UN ÉCHEC
Quatre états, aucune conversion vers le haut :

```
PROUVÉ · FORTEMENT ÉTABLI · CONFIANCE AUGMENTÉE · INCONNU
```

Interdits absolus :
```
UNKNOWN             → PASS     ❌
PARTIAL             → PASS     ❌
HUMAN-REQUIRED      → PASS     ❌
EXTERNAL-DEPENDENCY → PASS     ❌
non réfuté          → prouvé   ❌
forte probabilité   → prouvé   ❌
plusieurs outils    → preuves indépendantes ❌
nouveau corpus      → généralisation démontrée ❌
conforme            → excellent ❌
```

### P-D · INDÉPENDANCE DU PRODUCTEUR **ET DU SPÉCIFICATEUR**
Ni celui qui produit une propriété, ni celui qui a défini comment la
mesurer, ne peuvent être seuls juges.

> *La grille A++ viole ce principe : ses 8 dimensions ont été définies par
> les auteurs du moteur qu'elles évaluent.*

### P-E · DISCRIMINATION PROUVÉE
Toute gate possède un **cas-tueur démontré**. Toute assertion causale
possède un **contrôle négatif**. Une gate qui n'a jamais rien refusé est une
décoration.

### P-F · COMPLÉTUDE OUVERTE
La complétude n'est jamais déclarée. Elle est estimée par le taux de
découverte externe, **publié avec chaque certification**.

### P-G · OBSERVATION AVANT INTERPRÉTATION
```
RAW OBSERVATION → INTERPRETATION → ASSERTION → VERDICT
```
Un verdict n'est recevable que si l'observation brute qui le fonde est
conservée, adressée par son hachage, et **re-vérifiable sans refaire tourner
l'agent qui l'a produite**.

> **Une affirmation d'agent n'est JAMAIS une preuve.** Un enregistrement
> disant « j'ai passé G5 » sans sortie d'instrument rattachable est
> irrecevable.

---

## D. ARCHITECTURE — RÔLES RETENUS

Dérivés des modes d'échec : un rôle n'existe que si aucun autre ne couvre le
sien. **3 rôles, 1 infrastructure, 1 seul agent LLM.**

### ⚙️ MOTEUR DE CONFORMITÉ *(ex-« Guardian » — renommé, voir README)*

| | |
|---|---|
| **Nature** | **moteur DÉTERMINISTE, zéro LLM** |
| **Mission** | vérifier des propositions sur le **PROCESSUS**, jamais sur le produit |
| **Entrées** | protocole canonique · **registre de preuves BRUT** · historique. Jamais les rapports de synthèse |
| **Sorties** | verdict de conformité + motif mécanique |
| **Pouvoirs** | observer 🟢 · bloquer 🟢 · exiger une preuve 🟢 |
| **Interdictions** | exiger une correction ❌ · appliquer une correction ❌ · **modifier le protocole ❌** |
| **Preuves** | n'en crée aucune — il les vérifie |
| **Dépendances** | aucune sur les axes cognitifs (d'où sa valeur) |

**Pourquoi déterministe** — trois raisons, chacune suffisante :
1. sur un problème décidable, un LLM n'ajoute que bruit et non-reproductibilité ;
2. **un moteur déterministe ne peut pas être persuadé** ; un agent, si ;
3. son espace d'entrée est fini et structuré, donc **testable exhaustivement**
   — c'est ce qui **termine la récursion** « qui garde le gardien ? ».

**Démonstration de l'interdiction de modifier le protocole** : soit `C` la
proposition « le système respecte le protocole `P` ». Si le moteur peut
modifier `P`, alors pour tout système `S` il existe `P'` tel que `C(S,P')`
soit vraie — il suffit d'affaiblir `P`. `C` devient trivialement
satisfiable, donc sans information.

### 🤖 ADVERSAIRE

| | |
|---|---|
| **Mission** | obtenir PASS sans mériter ; chercher ce qui manque |
| **Entrées** | **MODE 3 : artefacts bruts, AUCUNE conclusion antérieure** |
| **Deux passes** | ① **aveugle** (ne voit pas le protocole) : « qu'est-ce qui ne va pas ? » ② **informée** : « comment passer sans mériter ? » |
| **Pouvoirs** | créer des contre-exemples · prononcer RÉFUTÉ |
| **Interdictions** | certifier ❌ |
| **🔴 Faiblesse connue** | partage le modèle du générateur ⇒ **dépendance D3, non résolue** |

*Le rôle « découverte d'angles morts » est fusionné ici : les deux défauts
manqués n'étaient pas des angles morts de découverte mais des trous de
dérivation. Créer un agent dédié pendant que la dérivation est à 45 %
traiterait le symptôme rare avant la cause fréquente.*

### 👤 HUMAIN + RÉFÉRENCES EXTERNES

| | |
|---|---|
| **Mission** | apporter ce qui **ne dérive pas de l'AIR** |
| **Six sous-rôles** | découvreur d'exigences · validateur de domaine · testeur exploratoire · évaluateur UX · relecteur adverse · **certificateur final** |
| **Pouvoirs** | **seul à pouvoir prononcer CERTIFIÉ** · seul à pouvoir déroger |
| **🔴 Faiblesse connue** | **fatigue et biais** — l'attention humaine est rare et dégradable |

> **Minimiser les gates humaines n'est pas une économie : c'est une exigence
> de qualité de la preuve.** Un humain sollicité 50 fois rend 50 jugements
> médiocres.

### 📒 REGISTRE DE PREUVES *(infrastructure — n'existe pas encore)*

Append-only, adressé par contenu. **Sans lui, le moteur de conformité
vérifie une fiction.**

```
{ proposition, nature, niveau_exigé, niveau_fourni,
  producteur, instrument, dépendances[8 axes],
  entrée_hash, sortie_hash, cas_tueur_ref, provenance, horodatage }
```

### Rôles explicitement REJETÉS

| Rôle | Raison du rejet |
|---|---|
| Agent Generator | c'est l'objet examiné, pas un organe de vérification |
| Agent Planner | étage du générateur ; aucune décorrélation ajoutée |
| Agent Validator | **c'est l'Oracle, déjà déterministe** — en faire un agent serait une régression |
| Agent Visual/UX | part mécanique = instruments ; part de jugement = humain. Un agent au milieu produit du niveau 3, jamais une preuve |
| Agent Domain | un agent ne peut pas fournir une exigence extérieure au système |
| Guardian du Guardian | supprimé par le déterminisme |

---

## E. HIÉRARCHIE DES PREUVES

| Niveau | Nature | Prouve | Ne prouve PAS |
|---|---|---|---|
| N0 | raisonnement | rien | tout |
| N1 | inspection de code | l'intention | le comportement |
| N2 | statique mécanique | cohérence formelle | qu'une fonction agisse |
| N3 | test synthétique | ce qu'on a pensé à tester | le reste |
| N4 | bac à sable | ça se construit | **que ça démarre** |
| N5 | exécution | ça démarre | que ça s'affiche |
| N6 | observation | ce qui est affiché | ce qui se passe au toucher |
| N7 | **interaction + delta mesuré** | qu'un contrôle agit | l'ampleur, la qualité |
| N8 | mesure instrumentée | géométrie, frames, contraste réel | le ressenti |
| N9 | contre-épreuve indépendante | robustesse de la conclusion | ce qu'aucun canal ne regarde |
| N10 | validation physique | comportement réel | la généralisation |
| N11 | hors distribution | généralisation **statistique** | le cas rare catastrophique |

### Niveau minimal exigé par nature — et écart constaté

| Proposition | Minimum | État du chantier au 2026-08-29 |
|---|---|---|
| document valide | N2 | 🟢 N2 |
| artefact reproductible | N2 | 🟢 N2 |
| ça compile | N4 | 🟢 N4 |
| l'app démarre | N5 | 🟠 observé 1 fois |
| **ce contrôle agit** | **N7** | 🔴 **N0** — déduit du code |
| **la donnée persiste** | **N7 + stockage** | 🔴 **N0** |
| **cible ≥ 48 dp** | **N8** | 🔴 **N2** — déduit des tokens |
| **c'est fluide** | **N8** | 🔴 **N0** |
| **c'est accessible** | **N8 + N10** | 🔴 **N2** |
| **c'est excellent** | **N9 + humain + référence externe** | 🔴 **N2** |
| **ça généralise** | **N11** | 🔴 **N3** |

> Ce tableau est le diagnostic du chantier en une page : sept propriétés
> revendiquées de 2 à 8 niveaux au-dessus de leur preuve réelle.

---

## F. CORRECT ≠ EXCELLENT

| Propriété | Oracle | Niveau min. | Limite de l'oracle |
|---|---|---|---|
| Correctness | obligations dérivées | N7 | ne juge pas la spéc |
| Conformance | WCAG, HIG, règles store | N8 | les normes sont des planchers |
| Spec completeness | dérivation | N2 | ne voit pas l'absent |
| **Domain completeness** | **référence + expert** | N9 | 🔴 aucun oracle interne |
| **Usability** | **taux de réussite de tâche, utilisateurs réels** | N10 | coûteux |
| Accessibility | mesure + jugement | N8 + humain | la part sémantique reste un jugement |
| **Fitness for purpose** | résultat utilisateur observé | N10 | mesurable après usage réel |
| **EXCELLENCE** | **comparaison à une population de référence** | N9 + humain | voir ci-dessous |

> ### L'excellence n'est pas une propriété de l'artefact. C'est une RELATION entre l'artefact et une population de référence.
> **Corollaire : elle est incertifiable en isolement.** Un système qui
> déclare « Elite » sans population de référence ne dit rien de plus que
> « conforme à ce que j'ai décidé de vérifier ».

*C'est exactement l'état de la grille A++ : 8 dimensions définies en
interne, mesurées en interne, comparées à elles-mêmes.*

---

## G. G22 — COMPLETENESS / ANTI-MINIMALISM

**Statut : 🟠 PARTIEL / NON CERTIFIÉ**

### Le problème

Un générateur peut satisfaire le protocole en **produisant moins**. Peu
d'obligations dérivées ⇒ peu de possibilités d'échec.

### 🔬 Confirmation empirique (2026-08-29)

Application minimaliste (1 écran, 1 entité, 1 liste, 1 bouton) comparée au
slice conteneurs, même protocole :

| Métrique | Minimaliste | Conteneurs |
|---|---:|---:|
| écarts totaux | **1** | 52 |
| effets exécutés | **100 %** | 6 % |
| écrans atteignables | **100 %** | 50 % |
| contrôles non fantômes | **100 %** | 25 % |
| capabilities câblées | **n/a** | 0 % |
| slots invoqués | **n/a** | 0 % |
| règles appliquées | **n/a** | 0 % |

**Deux mécanismes d'évasion distincts :**
1. **`n/a` = sortie du champ de mesure**, pas échec. Ne rien déclarer, c'est
   ne pas être mesuré.
2. **PROTOCOL-D001** : toutes les métriques sont des **ratios**, donc
   **invariantes par changement d'échelle**. `1/1` et `4/4` sont
   indistinguables. **Le protocole ne peut pas voir la taille.**

### Solutions ENVISAGÉES puis REJETÉES

| Solution | Rejet |
|---|---|
| scénarios générés par le système | dérivés de l'AIR ⇒ circularité totale |
| découverte de capacités depuis l'AIR | idem |
| métrique de richesse interne | métrique artificielle ; ne casse aucun mode commun |
| portée attendue **publiée** | 🔴 **devient une cible** (Goodhart) — transforme G22 en gaming de checklist, ne le résout pas |

### Mécanisme actuellement retenu

> **UN POOL DE TÂCHES SCELLÉ, ÉCRIT PAR UN TIERS, TIRÉ AU SORT À LA
> CERTIFICATION.**
> Ni portée attendue, ni liste de fonctions : **des tâches à accomplir.**

**Pourquoi c'est le minimum** : seule mesure dont l'optimisation **coïncide
avec l'objectif**. Optimiser « faire réussir des tâches inconnues », c'est
construire un logiciel qui marche.

### Contre-attaques — 4 identifiées, non fermées

| Attaque | Effet |
|---|---|
| le pool fuite ou est réutilisé | redevient une cible ⇒ **usage unique obligatoire** |
| tâches écrites par quelqu'un qui connaît l'AIR | 🔴 **plus indépendantes** — piège principal |
| **un agent LLM exécute les tâches** | 🔴 il **réussit là où un humain échouerait** (lit l'arbre a11y, ne se perd pas) ⇒ **faux PASS systématique sur l'utilisabilité** |
| échantillon trop petit | conclusion non significative |

**Résiduel assumé** : le pool mesure la **faisabilité** de la tâche, pas son
**agrément**. Une app rendant chaque tâche possible mais pénible passe.

### Résistance mesurée

Sur 10 attaques de minimalisme testées, **3 défenses sur 10 résistent à leur
propre contre-attaque** (`n/a` ⇒ UNKNOWN · tâche à issue négative
obligatoire · tâche « quitter et revenir »). Les 7 autres sont **bornées,
pas fermées**.

---

## H. INDÉPENDANCE DES PREUVES

**L'indépendance n'est pas une propriété d'une paire de preuves. Elle est
relative à une PROPOSITION.**

### Huit axes de dépendance
`spécification · données · modèle · générateur · environnement · instrument ·
oracle logique · opérateur humain`

**Règle** : pour une proposition `P` disposant des preuves {A,B,…}, calculer
l'**intersection des dépendances**. Tout élément de l'intersection est une
**hypothèse de mode commun non vérifiée** — à éliminer ou à publier comme
risque résiduel.

### Échelle et règle de comptage

| Niveau | Définition | Comptent pour deux ? |
|---|---|---|
| **D0** totalement partagé | même modèle, même AIR, même instrument | 🔴 non |
| **D1** faible | ≤1 axe non critique partagé | 🟢 oui |
| **D2** significatif | 2-3 axes, aucun critique | 🟠 oui, avec mention |
| **D3** critique | ≥1 axe **critique** (spéc, modèle, oracle logique) | 🔴 **non** |

### 🔬 Mesuré sur le chantier

**Intersection de TOUTES les preuves existantes = {AIR, modèle LLM, générateur}.**

Trois conséquences :
1. **aucune preuve actuelle ne peut détecter une erreur de l'AIR** ;
2. **l'Oracle recompile avec le même compilateur** — le déterminisme
   garantit qu'il **reproduit le défaut à l'identique et le confirme** ;
3. l'exécution sur émulateur casse le mode commun sur l'axe *oracle
   logique* — d'où sa productivité — **mais partage toujours l'AIR**.

### Indépendance de SOURCE (pour G22 et les références externes)

| Niveau | Critère | Vérifiable mécaniquement ? |
|---|---|---|
| **INDEPENDENT** | producteur n'a vu ni l'AIR, ni le générateur, ni le protocole ; scellée avant | 🟢 provenance signée + horodatage antérieur |
| **PARTIALLY_INDEPENDENT** | producteur distinct mais a vu le domaine ou une version antérieure | 🟢 déclaration de provenance |
| **CORRELATED** | même modèle, ou dérivée de l'AIR | 🟢 empreinte du modèle |
| **INADMISSIBLE** | produite par le générateur ou son opérateur | 🟢 refus mécanique |

Le moteur de conformité peut vérifier ceci : la provenance est une
**métadonnée**, pas un jugement.

---

## I. OBSERVATION — MATRICE PAR PROPRIÉTÉ

> La question n'est jamais « utilisons-nous Playwright ? » mais **« quelle
> observation est nécessaire pour établir cette propriété ? »**

| Propriété | Playwright | Méthode réelle |
|---|---|---|
| navigation | 🔴 INSUFFISANT | `adb` / `simctl` + diff pixel |
| interaction | 🔴 INSUFFISANT | `adb` + **contrôle négatif** |
| DOM | ⬜ sans objet (React Native n'a pas de DOM) | arbre d'accessibilité |
| accessibilité | 🔴 INSUFFISANT | `uiautomator dump` / AX API |
| responsive | 🔴 INSUFFISANT | émulateurs multi-densités |
| visuel | 🔴 INSUFFISANT | capture + Pillow + **référence certifiée** |
| persistance | 🔴 INSUFFISANT | `sqlite3` + **mort du processus** |
| backend | 🔴 INSUFFISANT | appels API directs |
| données | 🔴 INSUFFISANT | inspection base / fixtures |
| performance | 🔴 INSUFFISANT | `dumpsys gfxinfo` |
| appareil physique | 🔴 INSUFFISANT | appareil réel |
| **références externes** | 🟢 **CONDITIONNEL — seul usage valable** | — |
| **cible web (si un jour)** | 🟢 **REQUIRED** | — |

> **Playwright n'est REQUIRED pour aucune propriété de l'application mobile
> actuelle.** L'inscrire comme obligatoire créerait une garantie fictive.

### Artefacts bruts strictement nécessaires

| Type de propriété | Observation brute à conserver |
|---|---|
| navigation, interaction | captures avant/après + identifiant du contrôle activé |
| persistance | dump base **après mort du processus** |
| géométrie, a11y | arbre d'accessibilité (bornes, libellés, focus) |
| fluidité | histogramme de frames |
| erreurs | journal runtime |
| backend | trace réseau + état serveur |
| visuel | capture + référence certifiée |
| régression | hachages des artefacts des deux versions |

Hors de cette liste : vidéo (utile, non nécessaire), git diff (traçabilité,
pas preuve de propriété).

---

## J. MODÈLE CAUSAL DES INTERACTIONS

```
ACTION → CAUSE → TRANSITION D'ÉTAT → EFFET OBSERVABLE
       → EFFET PERSISTANT → CONSÉQUENCES
```

| Maillon | Preuve exigée | Sans quoi |
|---|---|---|
| ACTION | le contrôle activé est **celui du plan** (par identité, pas par position) | `testID` sur nœud décoratif |
| **CAUSE** | 🔴 **CONTRÔLE NÉGATIF** : sans l'action, **pas de delta** | ripple, effet dû à une autre cause |
| TRANSITION | l'état **nommé** change, pas « un » état | écriture dans la mauvaise entité |
| EFFET OBSERVABLE | delta **localisé** dans la zone attendue | faux delta |
| **EFFET PERSISTANT** | 🔴 **tuer le processus**, relancer, relire **en base** | cache mémoire, disparition locale |
| CONSÉQUENCES | effets de bord attendus présents, inattendus absents | régressions silencieuses |
| **NÉGATIF** | l'action **interdite** échoue proprement | fausse permissivité |

### Deux règles qui tuent l'essentiel du gaming

**R1 · CONTRÔLE NÉGATIF OBLIGATOIRE** — toute gate « X produit Y » exige un
second passage **sans X** prouvant que **Y ne se produit pas**. Coût : une
exécution.

**R2 · CAS-TUEUR OBLIGATOIRE** — une gate sans entrée fabriquée qui la fait
échouer n'est pas une gate. *Le chantier pratique déjà ce patron (« preuve
par mutation » des gardes AST) ; il faut le généraliser.*

---

## K. OOD / GÉNÉRALISATION

« Nouveau » n'est pas binaire. **Onze axes**, dont **dix mesurables** :

| Axe | Mesurable |
|---|---|
| domaine | 🟠 faible (vocabulaire) — **et c'est le moins important** |
| structure · navigation · données · relations | 🟢 exactement |
| comportement · interaction · composition | 🟢 |
| contraintes · capacités · plateforme | 🟢 |

**Distance au corpus de construction** = distance dans cet espace. Elle est
calculable.

*Mesure : les 13 documents ont une distance quasi nulle sur structure,
données et relations — tous portent exactement 3 entités et 3-4 écrans.*

### Contamination — 5 canaux par gravité

| Canal | Gravité |
|---|---|
| corpus de test produit par le modèle qui génère les AIR | 🔴 maximale — données d'entraînement partagées |
| corpus produit avec le même prompt/protocole | 🔴 haute |
| **corpus ayant informé les registres** | 🔴 **c'est le cas du corpus actuel** |
| mêmes fixtures / gabarits | 🟠 |
| familiarité indirecte | 🟠 irréductible |

### Ce qu'un test OOD peut / ne peut jamais démontrer

**Peut** : que les métriques ne s'effondrent pas hors du corpus de
construction ; absence de surapprentissage de forme ; énoncé statistique.

**Ne peut jamais** : couvrir l'espace réel (le corpus a lui-même une
distribution) · exclure le cas rare · dire quoi que ce soit du jugement
humain · rester valide après ouverture (**usage unique**).

### Protocole recommandé — trois sources décorrélées

| Source | Décorrélation | Rôle |
|---|---|---|
| **intentions humaines** (rédigées par des tiers ignorant les registres) | maximale | échantillon de référence |
| **grammaire aléatoire** (formes tirées du schéma) | haute sur la forme | test d'amplitude — **remplace la sélection manuelle, qui était biaisée** |
| autre modèle | faible | complément, jamais preuve principale |

### Le protocole doit aussi démontrer SA généralisation

Test concret et peu coûteux : appliquer le protocole à un artefact **d'un
type qu'il n'a pas été conçu pour vérifier** (app d'un autre générateur, ou
app native écrite à la main). S'il rend PASS sur une app manifestement
mauvaise, ou FAIL sur une app reconnue excellente, **il est calibré sur ce
générateur, pas sur la qualité**.

---

## L. LIMITES FONDAMENTALES

Quatre limites **irréductibles**. Aucune architecture ne les supprime, et
aucune multiplication d'agents ne les casse.

### L1 · La propriété jamais formulée
Un champ absent du **schéma** n'engendre aucune obligation. *Portée réduite
depuis PROTOCOL-D003 : ce n'est plus « des inconnues partout », c'est
exactement « un champ absent du schéma ».*

### L2 · Conforme mais inutilisable
Une app peut satisfaire 100 % des obligations et rester confuse, laide ou
pénible. *Exemple observé : formulaire de 11 champs texte à libellés
techniques — 100 % conforme, inutilisable.*

### L3 · Le mauvais produit
Résoudre parfaitement le mauvais problème. Aucun oracle interne.

### L4 · La croyance fausse mais cohérente 🔴 **la plus grave**

```
AIR faux → Generator croit X → Validator croit X → Red Team croit X
→ Moteur de conformité ne vérifie que la procédure → PASS
```

**Démonstration** : tous les organes internes dérivent leur notion de
correction du même AIR. Une erreur de l'AIR est un **mode commun parfait** —
aucun raisonnement interne ne peut la voir puisque tout raisonnement interne
la présuppose.

**Ce qui casse ce mode commun, et rien d'autre** :

| Canal | Casse ? |
|---|---|
| plus d'agents | 🔴 non |
| autre modèle | 🟠 partiellement (données d'entraînement partagées) |
| **tâche réelle échouée par un utilisateur réel** | 🟢 **oui** |
| **expert du domaine** | 🟢 oui |
| **norme / réglementation externe** | 🟢 oui, sur son périmètre |

**Conséquence normative** : toute propriété dépendant de la justesse de
l'AIR est marquée **EXTERNAL-DEPENDENCY**, jamais PASS, et cela figure sur
le certificat.

### Cinq statuts de propriété

```
AUTOMATIQUEMENT PROUVABLE · PARTIELLEMENT PROUVABLE
HUMAN-REQUIRED · EXTERNAL-DEPENDENCY · FONDAMENTALEMENT IMPROUVABLE
```

> Une propriété improuvable n'est pas un défaut du protocole. **C'est un
> défaut du protocole de ne pas la déclarer comme telle.**

---

## M. GOUVERNANCE — MACHINE D'ÉTAT

```
INCONNU  ──►  OBLIGATIONS_DÉRIVÉES  ──►  PREUVES_EN_COLLECTE
                                              │
                              ⚙️ CONFORMITÉ_DE_PROCESSUS
                                 ├── fausse ──► NON_CERTIFIABLE ──┐
                                 └── vraie ───► 🤖 REVUE_ADVERSE  │
                                        ├── réfutation tient ──► RÉFUTÉ ──┤
                                        └── échec de réfutation           │
                                                 ▼                        │
                                        👤 JUGEMENT_HUMAIN                │
                                          ├── refus ─────────────────────┤
                                          └── accord                      │
                                                 ▼                        │
                              CERTIFIÉ(niveau, limites, dérogations)      │
                     toute correction ré-entre au début ──────────────────┘
```

| État | Prononcé par | Levé par |
|---|---|---|
| NON_CERTIFIABLE | ⚙️ moteur, mécaniquement | apport de la preuve manquante **uniquement** |
| RÉFUTÉ | 🤖 adversaire | réfutation de la réfutation, tracée |
| **INCONNU** | par défaut — **état de repli permanent** | **jamais levé par le silence** |
| CERTIFIÉ | 👤 humain, **et lui seul** | expiration, régression, nouvelle version |

**Deux règles absolues** : ① aucun agent ne prononce CERTIFIÉ ; ② toute
correction fait **ré-entrer** le processus, jamais reprendre où il s'était
arrêté.

### Dérogation

Un protocole **sans voie de dérogation légitime sera contourné en bloc au
premier faux négatif**.

| | Condition |
|---|---|
| Qui | le propriétaire — **jamais un agent, jamais le moteur** |
| Coût | signée, publiée, motivée, datée, **avec échéance** |
| Contrepartie | ouvre un **amendement du protocole** |
| Ce qu'elle ne fait pas | **ne convertit jamais** l'état en PROUVÉ |

---

## N. PROTOCOL SELF-TEST

Le protocole doit être testé comme un logiciel critique. **Couverture par
modes d'échec, jamais en pourcentage artificiel.**

| Catégorie | Couverture minimale | État |
|---|---|---|
| défauts connus | 100 % du corpus de régression | 🔴 **2 attrapés sur 4** |
| défauts adversariaux synthétiques | ≥1 par famille de gaming (9) | 🔴 0 |
| faux PASS | les 3 variantes minimalistes | 🔴 0 |
| AIR corrompus | ≥1 par champ optionnel du schéma | 🔴 0 |
| oracles faibles | ≥1 par mode d'échec d'oracle (10) | 🔴 0 |
| preuves corrompues | ≥1 par axe de dépendance (8) | 🔴 0 |
| régression | 100 % de l'historique | 🔴 historique vide |
| OOD | ≥3 domaines de familles distinctes | 🔴 0 |
| gaming du protocole | l'attaquant informé en 5 coups | 🔴 0 |

**Total : ~2 tests sur ~50. Couverture ≈ 4 %.**

---

## O. STATUT — 2026-08-30

```
PROTOCOL:                 🔴 NOT CERTIFIED
G22:                      🟠 PARTIAL
GATES:                    🔴 VALIDITY NOT ESTABLISHED
RED TEAM:                 🟠
MOTEUR DE CONFORMITÉ:     🟠
BLIND DISCOVERY:          🟢 DEMONSTRATED
OOD:                      🟠
CERTIFICATION:            🔴

FINAL TECHNICAL AGREEMENT: NO
```

### Ce qui bloque

**Aucune gate n'a jamais refusé quoi que ce soit.** Un protocole dont aucune
gate ne possède de cas-tueur a une validité **non établie** — pas
« faible » : **non établie**. Par P-C, son état est **INCONNU**.

### Conditions restantes — liste fermée

| # | Condition | Nature |
|---|---|---|
| 1 | **G24 : dérivation totale, 45 % → 100 %** | exécution |
| 2 | **P-E : un cas-tueur par gate**, issu de défauts réels | exécution |
| 3 | **Registre de preuves** — sans lui le moteur vérifie une fiction | construction |
| 4 | **Pool de tâches scellé** — seule parade à G22 | conception + humains |
| 5 | **Décorrélation de l'adversaire** — autre modèle ? humain ? | décision propriétaire |
| 6 | ~~Test de découverte aveugle~~ | 🟢 **SATISFAITE** (APP-D001) |
| 7 | **≥3 domaines à distance mesurée** | exécution |

**Six ouvertes sur sept.** Quatre ne se ferment que par **exécution** ; deux
sont des décisions propriétaire. **Aucune ne se ferme par une analyse
supplémentaire.**
