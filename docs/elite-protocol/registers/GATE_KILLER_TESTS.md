# GATE KILLER TEST REGISTER

> ### DEUX CAMPAGNES EXÉCUTÉES — 2026-08-30 · **17 cas-tueurs**
> Verdict attendu **déclaré AVANT exécution** dans les deux campagnes.
>
> | Campagne | Exécutés | Conformes | Échecs | Méthode de conception |
> |---|---:|---:|---:|---|
> | 1 | 10 | 8 | **2** | vocabulaire du protocole |
> | 2 | 7 | 0 | **7** | modèle différentiel runtime ↔ instrument |
> | **Total** | **17** | **8** | **9** | |
>
> Les échecs sont conservés : ils sont l'objet même de ce registre.
> 🔴 **Le verdict 🟢 de `KT-G05-B03` (campagne 1) est INVALIDÉ** par
> `PROTOCOL-D010` — voir la note de rectification en fin de campagne 1.
>
> La validité reste **NON ÉTABLIE** pour les 22 gates **sans implémentation** :
> on ne peut pas exécuter un cas-tueur contre une gate qui n'existe pas.

## RÉSULTATS DE LA CAMPAGNE 1

| ID | Gate | Type | Attaque | Attendu | Réel | Verdict |
|---|---|---|---|---|---|---|
| KT-G05-001 | G5 | KNOWN | bouton à effet `capability` | GATE TOMBE | GATE TOMBE | 🟢 |
| KT-G01-001 | G1 | KNOWN | effet `mutation` hors enveloppe | GATE TOMBE | GATE TOMBE | 🟢 |
| KT-G04-001 | G4 | KNOWN | écran sans chemin | GATE TOMBE | GATE TOMBE | 🟢 |
| KT-G22-001 | G22 | KNOWN | application minimaliste | GATE TOMBE | GATE TOMBE | 🟢 |
| **KT-G04-B01** | **G4** | **BLIND** | **déclencheur `data` fantôme vers un écran mort** | GATE TOMBE | **GATE PASSE** | 🔴 **ÉCHEC** |
| **KT-G05-B02** | **G5** | **BLIND** | **bloc JAMAIS visible (`entity_empty` sur entité peuplée)** | GATE TOMBE | **GATE PASSE** | 🔴 **ÉCHEC** |
| KT-G05-B03 | G5 | BLIND | fantôme masqué par `props.actionId` + trigger lifecycle | GATE TOMBE | GATE TOMBE | 🟢 |
| KT-G01-B04 | G1 | BLIND | dataset à `rowCount: 0` | GATE TOMBE | GATE TOMBE | 🟢 |
| KT-FF-001 | G5 | FALSE FAIL | bloc décoratif sans action | GATE PASSE | GATE PASSE | 🟢 |
| KT-FF-002 | G4 | FALSE FAIL | app à un seul écran | GATE PASSE | GATE PASSE | 🟢 |

🔴 **MENTION RÉFUTÉE (2026-08-30, `PROTOCOL-D010`)** — énoncé original :
*« Aucun faux FAIL détecté — les 2 vrais positifs testés passent correctement. »*

`FACT` — `KT-G05-B03` a été compté 🟢 parce que la gate est tombée. Or le runtime
**dispatche `props.actionId` sans lire `trigger.kind`** : le bouton agit
réellement. Le protocole a donc produit un **faux positif**
(`EXEC_GHOST_CONTROL` sur un contrôle vivant), et le verdict attendu de la
campagne 1 était lui-même faux. `INFÉR.` — le cas-tueur ne pouvait pas détecter
une erreur qu'il **partageait** avec l'instrument testé.
Preuve : `evidence/kt2.mjs` (`KT-C2-05`).

## ÉCHEC 1 — KT-G04-B01 · exploitabilité confirmée à l'échelle

```
ATTAQUE : ajouter N actions `data`→navigate INERTES, une par écran

                                   AVANT   APRÈS
écrans atteignables (déclaré)      2/4     4/4
EXEC_SCREEN_UNREACHABLE_DECLARED   2       0
écrans atteignables (effectif)     2/4     2/4   ← inchangé
produit réellement modifié         NON
```

**Cause racine** : dans `reachableScreens()`, un déclencheur `data` (ou
`lifecycle` sans `screenId`) a une **origine indéterminée**, donc réputée
atteignable. Le chemin est compté sans vérifier qu'il puisse être emprunté.

**🔴 DEUX AFFIRMATIONS DE CETTE FICHE SONT RÉFUTÉES (2026-08-30, EXP-1).**
Les énoncés originaux sont conservés ci-dessous, suivis de leur réfutation.

> *« L'attaque ajoute 4 écarts triviaux et en supprime 2 critiques. Comme les
> écarts n'ont pas de sévérité (PROTOCOL-D002), le protocole ne peut pas dire
> que le troc est défavorable. »*

🔴 **RÉFUTÉ — `PROTOCOL-D015`.** `FACT` — à construction contrôlée, le comptage
est **strictement additif** (2 + 2 = 4) : **aucun écart n'est supprimé**. Les
`EXEC_SCREEN_UNREACHABLE_DECLARED` (owner `document`) sont remplacés un pour un
par des `EXEC_SCREEN_UNREACHABLE_ENGINE` (owner `moteur`). `INFÉR.` — ce n'est
pas un troc, c'est un **TRANSFERT D'IMPUTATION** : `owner:document` passe de 2 à
0. `CONCL.` — une échelle de sévérité **ne détecterait pas** ce mécanisme : les
deux configurations portent 2 écarts critiques. Preuve : `evidence/exp1b.mjs`.

> *« Atténuation partielle observée : la métrique effective résiste (2/4
> inchangé), car elle borne les déclencheurs à l'enveloppe. La défense en
> profondeur a partiellement joué. »*

🔴 **RÉFUTÉ — `PROTOCOL-D007`.** `FACT` — les deux métriques appellent **la même
fonction** `reachableScreens()` avec un ensemble de déclencheurs différent :
elles partagent intégralement le défaut. Sous une enveloppe élargie à `data`,
l'effectif tombe aussi (**1/2 → 2/2**). `CONCL.` — ce n'est pas une défense en
profondeur mais une **coïncidence de l'enveloppe v1** (`triggers: ["ui"]`), qui
**expirera** dès que le moteur câblera les déclencheurs `data`.
Preuve : `evidence/kt2.mjs` (`KT-C2-02`).

## ÉCHEC 2 — KT-G05-B02 · bloc structurellement invisible

Un bloc portant `visibleWhen: {kind: "entity_empty"}` sur une entité **toujours
peuplée** n'est **jamais** rendu. C'est de l'interface morte. Le protocole ne
forme aucune obligation sur la **satisfiabilité** d'une condition de
visibilité — `visibleWhen` fait partie des 44 champs non couverts
(PROTOCOL-D003).

**Note d'honnêteté** : c'est l'inverse exact du défaut DET-017 corrigé par
D-044. En rendant les blocs conditionnables, le contrat a créé une seconde
classe de défaut — **un bloc toujours visible à tort, ou jamais visible à
tort** — dont une seule est traitée.

## RÉSULTATS DE LA CAMPAGNE 2 — 2026-08-30

**Méthode** : les attaques sont dérivées d'un **modèle différentiel** — la
sémantique du runtime écrite depuis le source, confrontée à celle du validateur.
**Ajout par rapport à la campagne 1** : chaque document d'attaque traverse
d'abord les **trois validateurs réels** (schéma · sémantique · registre de
blocs). Un document rejeté en amont ne prouverait rien sur la gate.

| ID | Gate visée | Type | Attaque | Attendu | Réel | Verdict |
|---|---|---|---|---|---|---|
| **KT-C2-01** | G4 (proxy) | BLIND | déclencheur `ui` sur un bloc `header` — aucun handler runtime | GATE TOMBE | **GATE PASSE** | 🔴 **ÉCHEC** |
| **KT-C2-02** | G4 (proxy) | BLIND | D004 rejoué sous enveloppe élargie à `data` | GATE TOMBE | **GATE PASSE** | 🔴 **ÉCHEC** |
| **KT-C2-03** | G5 (proxy) | BLIND | `entity_not_empty` sur entité sans dataset | GATE TOMBE | **GATE PASSE** | 🔴 **ÉCHEC** |
| **KT-C2-04** | G4 (proxy) | BLIND | source d'`itemId` portée par une liste sur écran inatteignable | GATE TOMBE | **GATE PASSE** | 🔴 **ÉCHEC** |
| **KT-C2-05** | G5 (proxy) | BLIND | `props.actionId` + trigger `lifecycle` — le runtime dispatche pourtant | GATE PASSE | **GATE TOMBE** | 🔴 **ÉCHEC (faux positif)** |
| **KT-C2-06** | G1 / G22 | COMPOSITION | −5 écarts `capability` triviaux, +1 écran mort critique | GATE TOMBE | **GATE PASSE** | 🔴 **ÉCHEC** |
| **KT-C2-07** | G0 | BLIND | métriques constantes d'enveloppe | GATE TOMBE | **GATE PASSE** | 🔴 **ÉCHEC** |

**7 exécutés · 0 conforme · 7 échecs.** Preuve : `evidence/kt2.mjs`.

### 🔴 Réserve d'imputation — les étiquettes « G4 » et « G5 » sont imprécises

`FACT` — La propriété énoncée au `GATE_REGISTER` pour **G4** (« 100 % écrans +
contrôles **observés** ») et pour **G5** (« delta + **contrôle négatif** ») n'a
**aucune implémentation** dans le dépôt. Ce qui existe — l'atteignabilité
calculée sur l'AIR et le recensement statique `controls()` — mesure **une autre
propriété**.

`INFÉR.` — Les cas-tueurs des deux campagnes étiquetés G4/G5 ont donc attaqué un
**proxy**. Leurs résultats restent **valides pour ce proxy** ; leur imputation à
G4/G5 est imprécise. `HYPO.` — **non testé** : la même imprécision pourrait
affecter d'autres gates.
Référence : `registers/GATE_SEMANTIC_OBSERVABILITY.md`.

### Lecture méthodologique — `INFÉR.`, non promue

| | Campagne 1 | Campagne 2 |
|---|---|---|
| conception des attaques | vocabulaire du protocole | modèle différentiel runtime ↔ instrument |
| échecs | 2 / 10 | **7 / 7** |

`INFÉR.` — Le taux de 100 % n'est **pas** informatif : les 7 tests ont été
*choisis* parce que le modèle prédisait l'échec. Le fait informatif est :
**7 prédictions issues du modèle, 7 confirmées, 0 réfutée** — c'est une
propriété du modèle, pas un taux de défauts.
`HYPO.` — que ce rendement se transporte hors de ce chantier **n'est pas
établi** : un objet, une fois.

---

# GABARIT ET COUVERTURE


**Convention d'identifiants** : `KT-Gnn-nnn`

## Gabarit obligatoire

```
ID               : KT-Gnn-nnn
Gate ciblée      :
Propriété visée  :
Attaque          : (faux PASS | faux FAIL | corruption de preuve |
                    attaque d'oracle | attaque d'indépendance | contournement)
Précondition     :
Observation attendue :
Verdict attendu  : la gate DOIT tomber
Résultat réel    :
Preuve           : (sortie brute, hachée)
Date · Environnement · Statut
```

## Couverture minimale exigée avant de lever `GATES: 🔴`

| Gate | Cas-tueurs minimaux | Exécutés |
|---|---|---|
| G0 / G24 | un champ de schéma sans obligation ⇒ doit tomber | **0** |
| G2 | `testID` posé sur un nœud décoratif ⇒ doit tomber | **0** |
| G4 *(proxy)* | écran sans chemin ⇒ doit tomber · **déclencheur `data` fantôme ⇒ doit tomber** | **6 exécutés · 4 échecs** (B01, C2-01, C2-02, C2-04) |
| G5 *(proxy)* | ripple d'appui sans effet ⇒ doit tomber · effet dû à une minuterie ⇒ doit tomber | **5 exécutés · 3 échecs** (B02, C2-03, C2-05) |
| G0 | métrique ne mesurant pas l'artefact ⇒ doit tomber | **1 exécuté · 1 échec** (C2-07) |
| G1 / G22 | composition par soustraction déclarative ⇒ doit tomber | **1 exécuté · 1 échec** (C2-06) |
| G6 | écriture en cache mémoire ⇒ doit tomber · écriture dans la mauvaise entité ⇒ doit tomber | **0** |
| G7 | cible à 44 dp ⇒ doit tomber | **0** |
| G9 | app qui plante réseau coupé ⇒ doit tomber | **0** |
| G10 | référence empoisonnée ⇒ doit être refusée | **0** |
| G16 | gate à seuil complaisant (`> 1`) ⇒ doit être signalée | **0** |
| G22 | app minimaliste ⇒ doit tomber | **1 exécuté 🟢** |
| **TOTAL** | **≥ 13 cas-tueurs** | **17 exécutés · 8 conformes · 9 échecs** — seuil quantitatif franchi, **validité toujours NON ÉTABLIE** (`RN-14`) |

## Faux FAIL — à tester aussi

Une gate qui refuse du valide est aussi défaillante qu'une gate permissive.
Chaque gate exige **≥1 cas de vrai positif** : un artefact légitime qu'elle
doit **accepter**.

| Gate | Vrai positif attendu | Exécuté |
|---|---|---|
| G22 | application **légitimement simple** ⇒ doit PASSER | **1 exécuté 🟢** |
| G5 | bloc décoratif sans action ⇒ ne doit **pas** compter comme fantôme | **1 exécuté 🟢** |
