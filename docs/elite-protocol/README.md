# PROTOCOLE DE RÉFÉRENCE ELITE 2027 A+ — POINT D'ENTRÉE

> **Ceci est la SOURCE DE VÉRITÉ du protocole de référence.**
> Toute session travaillant sur le protocole commence ici. La mémoire de
> conversation ne fait JAMAIS foi.

## SESSION CONTINUITY RULE (obligatoire)

Avant d'analyser, de modifier, de proposer une architecture, de déclarer un
statut ou de lancer un test sur le protocole, une session doit lire, dans
cet ordre :

1. `REFERENCE_PROTOCOL_ELITE_2027.md` — document canonique
2. `registers/DISCOVERY_REGISTER.md` — ce qui a été découvert
3. `registers/PROTOCOL_RISK_REGISTER.md` — ce qui est cassé ou non résolu
4. `registers/GATE_REGISTER.md` — état de validité de chaque gate
5. `CHANGELOG.md` — historique des évolutions et des rétractations

Les autres registres se consultent au besoin.

## 🔴 DEUX COLLISIONS DE VOCABULAIRE — À NE JAMAIS CONFONDRE

Ces deux ambiguïtés existaient dans le dépôt AVANT ce document. Elles sont
levées ici, définitivement.

### Collision 1 — « ELITE 2027 A++ » ≠ « ELITE 2027 A+ »

| Terme | Objet | Défini par |
|---|---|---|
| **PREMIUM / ELITE 2027 A++** (deux plus) | exigence de QUALITÉ PRODUIT — la grille des 8 dimensions A→H | `docs/mobile-generation/ROADMAP.md`, D-039 |
| **ELITE 2027 A+** (un plus) | standard du PROTOCOLE DE PREUVE — ce document | ce dossier |

Le premier dit *ce qu'une application doit valoir*. Le second dit *ce qu'une
démonstration doit valoir*. **Ils ne se remplacent pas et ne se comparent
pas.** La grille A++ est d'ailleurs, selon l'analyse consignée ici, un
exemple de propriété affirmée à un niveau de preuve insuffisant.

### Collision 2 — « Guardian » est déjà pris

`ARCHITECTURE.md §26` définit le **Live App Guardian** : rollout, migrations
expand/contract, rollback OTA, kill-switch. C'est un composant de la Phase 13.

Le rôle de conformité du protocole s'appelle donc **MOTEUR DE CONFORMITÉ**
(*Compliance Engine*), jamais « Guardian ». Ce nom est en outre plus exact :
c'est un moteur déterministe, pas un agent.

## PÉRIMÈTRES — CE DOSSIER N'EST PAS CONCURRENT

| Dossier | Périmètre | Autorité |
|---|---|---|
| `docs/mobile-generation/` | **le chantier** : plan, architecture, roadmap, statut, décisions du moteur | inchangée |
| `docs/elite-protocol/` | **le protocole** qui certifie ce chantier, et qui se certifie lui-même | ce dossier |

Les deux périmètres ne se recouvrent pas. Le protocole **ne modifie jamais**
la ROADMAP ni les décisions du chantier : il les évalue. Toute évolution du
chantier reste régie par `CLAUDE.md` règle 3 et D-017.

## STATUT AU 2026-08-30

```
PROTOCOL:                 🔴 NOT CERTIFIED
G22 (anti-minimalisme):   🟠 PARTIAL
GATES:                    🔴 VALIDITY NOT ESTABLISHED
RED TEAM:                 🟠
MOTEUR DE CONFORMITÉ:     🟠
BLIND DISCOVERY:          🟢 DEMONSTRATED
OOD:                      🟠
CERTIFICATION:            🔴

FINAL TECHNICAL AGREEMENT: NO
```

## FICHIERS

| Fichier | Rôle |
|---|---|
| `REFERENCE_PROTOCOL_ELITE_2027.md` | **document canonique** — objectif, standard, principes, architecture, G22, limites, observation, OOD, self-test |
| `CHANGELOG.md` | toute évolution conceptuelle, avec sa raison et ses rétractations |
| `registers/DISCOVERY_REGISTER.md` | découvertes, jamais supprimées même après correction |
| `registers/PROTOCOL_RISK_REGISTER.md` | faiblesses du protocole, avec mode d'exploitation |
| `registers/GATE_REGISTER.md` | matrice des gates et leur validité |
| `registers/GATE_KILLER_TESTS.md` | cas-tueurs — **17 exécutés** (campagne 1 : 10 · campagne 2 : 7). `GATES` reste 🔴 : la validité n'est pas établie, ce qui n'est **pas** la même chose que l'absence de cas-tueurs |
| `registers/EVIDENCE_INDEPENDENCE_REGISTER.md` | provenance et indépendance des preuves |
| `registers/ORACLE_REGISTER.md` | oracles, risques de mode commun |
| `registers/GATE_SEMANTIC_OBSERVABILITY.md` | **mesure structurelle des 25 gates** — sémantique ↔ runtime, observabilité |
| `evidence/` | **artefacts de preuve exécutables** des campagnes et d'EXP-1 (lève PROTOCOL-D014) |
