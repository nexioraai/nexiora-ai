# CHANGELOG DU PROTOCOLE

> Toute évolution conceptuelle laisse une trace. **Les rétractations sont
> conservées** : une thèse abandonnée renseigne autant qu'une thèse retenue.

---

## v0.5 — 2026-08-30 · EXP-1, mesure structurelle des 25 gates, versement des preuves

**Changement** : (a) campagne 2 de cas-tueurs — **7 exécutés, 7 échecs** ;
(b) **EXP-1**, expérience causale pré-enregistrée sur D004/D005/R-25 ;
(c) **mesure structurelle** des 25 gates (sémantique ↔ runtime, observabilité) ;
(d) versement des scripts de preuve dans `evidence/`.

**Raison** : la campagne 1 attaquait avec le vocabulaire de l'instrument. EXP-1
impose une extraction d'hypothèses **mécanique et gelée avant l'analyse**.

**Résultats retenus** :
- 🔴 **La description du mécanisme de PROTOCOL-D004 est RÉFUTÉE.** L'attaque ne
  supprime aucun écart : le comptage est strictement additif (2+2=4). Elle
  **transfère l'imputation** — `owner:document` passe de 2 à 0.
  ⇒ `PROTOCOL-D015`. **Une échelle de sévérité ne détecterait pas ce mécanisme.**
- 🔵 **D004 / D005** : `H3` **exclu** · `H0` **indéterminé** · **`H1` vs `H2`
  OUVERT**. La conclusion H2 d'EXP-1 **n'est PAS versée comme fait** : R-GRAN
  est une projection incomplète, une intersection vide ne conclut pas.
  **La granularité doit être réarbitrée avant toute expérience causale.**
- 🔵 **R-25** : n'est PAS une conséquence compositionnelle nécessaire de
  D004/D005 (`KT-C2-06` le produit sans eux). Statut retenu :
  **CONDITION D'EXPLOITABILITÉ ÉTABLIE — CAUSE NON IDENTIFIÉE**. C1/C2 ne sont
  **pas** promues au rang de causes.
- 🔵 **PROTOCOL-D020** établi **pour la seule métrique d'atteignabilité déclarée**.
  Généralisation aux 25 gates **interdite sans mesure**.
- 🟠 **H-14** repose sur une affirmation universelle établie par inspection.
  **Fragile** tant qu'aucune exécution ne la corrobore. Non promue.
- 📏 **Mesure des 25 gates** : **0 gate** possède une correspondance runtime
  établie ayant survécu à l'examen · **9** énoncent une propriété observable sur
  un artefact produit · **8** ne sont pas observables en l'état · **1 seule
  gate a réellement refusé un artefact** (G14).

**Preuve** : `registers/GATE_SEMANTIC_OBSERVABILITY.md` · `evidence/`.

**Non-régression** : **aucune gate, aucun code produit, aucun runtime, aucune
roadmap, aucune phase modifiés.** Seuls les registres et `evidence/` ont changé.

**Statuts** : inchangés. `FINAL TECHNICAL AGREEMENT: NO`. Phase 10 **ouverte**.
Validation physique **suspendue**.

---

## v0.4 — 2026-08-30 · Première campagne de cas-tueurs

**Changement** : exécution de 10 cas-tueurs, verdicts attendus déclarés
avant exécution.
**Raison** : condition n°2 — la validité d'une gate n'est pas établie tant
qu'elle n'a jamais rien refusé.
**Résultat** : **8/10 conformes · 2 ÉCHECS**, tous deux sur attaques aveugles.
**Preuve** : `registers/GATE_KILLER_TESTS.md`, campagne 1.
**Non-régression** : aucune gate modifiée — les échecs sont documentés, pas
corrigés (règle 13 de l'épreuve).
**Décision** : `PROTOCOL-D004` et `PROTOCOL-D005` ouverts ; `R-23`, `R-24`,
`R-25` inscrits au registre des risques.

**Fait notable** : `R-25` n'a été trouvé ni par analyse ni par un cas-tueur
isolé, mais par **composition** de deux faiblesses individuellement bornées
(R-23 supprime des écarts critiques, R-10 empêche de voir que le troc est
défavorable). **Une classe d'attaque que le protocole ne cherchait pas.**

**Statuts** : inchangés. Aucun n'a été élevé.

---

## v0.3 — 2026-08-30 · Documentation canonique

**Changement** : création de `docs/elite-protocol/` — document canonique et
six registres.
**Raison** : les décisions critiques n'existaient que dans l'historique de
conversation. Le dépôt doit être la source de vérité opérationnelle.
**Preuve** : arborescence créée ; aucune documentation concurrente détectée.
**Tests** : sans objet (documentation).
**Non-régression** : aucun fichier existant modifié hors ajout d'un pointeur.
**Décision** : `docs/elite-protocol/` est **parallèle** à
`docs/mobile-generation/`, jamais subordonné — le protocole doit rester
indépendant de ce qu'il certifie (P-D).

### Deux collisions de vocabulaire levées

| Collision | Résolution |
|---|---|
| « Guardian » — déjà pris par le **Live App Guardian** (ARCH §26, Phase 13) | le rôle de conformité s'appelle **MOTEUR DE CONFORMITÉ**. Nom plus exact : c'est un moteur déterministe, pas un agent |
| « ELITE 2027 A++ » (qualité produit, D-039) vs « ELITE 2027 A+ » (standard de preuve) | les deux termes coexistent, **explicitement distingués** dans le README |

---

## v0.2 — 2026-08-30 · Rétractation majeure

### 🔴 THÈSE RÉTRACTÉE

> *« D3 et D4 portent sur ce que le langage ne sait pas exprimer. Aucune
> obligation ne peut en être dérivée. On ne corrige pas cela en améliorant
> le protocole. »*

**Cette thèse, énoncée en v0.1 sous forme de "théorème", est FAUSSE.**

**Réfutation par la mesure** :

| Défaut | Dérivable de l'AIR seul ? | Mesure |
|---|---|---|
| D3 titre de bloc redondant | 🟢 **OUI** — comparer deux chaînes déjà présentes | 24 occurrences / 13 documents |
| D4 champ non rendable par son bloc | 🟢 **OUI** — croiser `field.type` et la capacité du registre | 49 champs / 98 (50 %) / 11 documents |

**Cause réelle** : PROTOCOL-D003 — la dérivation ne visite que **45 %** des
champs du schéma. **P-A avait été implémenté en réintroduisant la liste
écrite à la main un étage plus bas.**

**Conséquence positive** : la limite L1 rétrécit d'un trou non borné à
« un champ absent du schéma ».

**Ajouts** : G24 (totalité de la dérivation) · P-E renforcé (G24 et G16 sont
conjointes ou gamables séparément).

---

## v0.1 — 2026-08-29 · Première formulation

**Principes** P-A à P-F · chaîne à 17 étapes · architecture à 3 rôles +
1 infrastructure · hiérarchie de preuves N0-N11 · 4 états.

**Résultats d'épreuve** :
- test de discrimination sur le slice conteneurs : **2/4** 🔴
- G22 confirmée empiriquement : minimaliste **1 écart** vs riche **52** 🔴
- découverte aveugle : **APP-D001, PROTOCOL-D001, PROTOCOL-D002** 🟢

**Décisions structurantes** :
- le moteur de conformité est **déterministe**, jamais un agent — c'est ce
  qui **termine la récursion** « qui garde le gardien ? »
- l'adversaire opère en **mode 3** (artefacts bruts, aucune conclusion) et en
  **double passe** (aveugle puis informée)
- rôle « découverte d'angles morts » **fusionné** dans l'adversaire :
  les défauts manqués n'étaient pas des angles morts mais des trous de
  dérivation
- **Playwright n'est REQUIRED pour aucune propriété** de l'application
  mobile ; son seul usage valable est la collecte de références externes
