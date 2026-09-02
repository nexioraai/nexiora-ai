# PROTOCOLE DE VALIDATION APPAREIL & FIL RÉEL — imprimable

> Chantier arbitré le 2026-09-02 (option ③ : endpoint statique sur
> `www.deribfy.com`). App : `slices/validation-appareil/app` (49 fichiers,
> émise par le vrai compilateur, tsc EXIT=0, batterie `verifier.mjs` verte).
> **Préalables** : (1) endpoint déployé (voir `slices/validation-appareil/
> endpoint/README.md`) — autorisation propriétaire ; (2) build EAS `preview`
> (APK) — autorisation quota donnée pour 1-2 builds ; (3) `verifier.mjs`
> rejoué VERT le jour même. Chaque preuve = observation réelle ; rien n'est
> coché sur intention. Polling ≠ push : ne jamais qualifier ces preuves de
> « temps réel poussé ».

## A. ANDROID (Galaxy A17)

| # | Étape | Observation attendue | PASS/FAIL | Preuve |
|---|---|---|---|---|
| A1 | Installer l'APK (QR EAS), ouvrir l'app | Écran d'accueil rendu, navigation primaire présente | ☐ | photo A1 |
| A2 | **E3.3/E3.1 — chargement réel** : ouvrir « Départs » avec réseau ACTIF | Bref « Chargement des départs… » puis **Bouaké, Korhogo, San-Pédro, Man, Yamoussoukro** (valeurs SERVEUR — la démo dit « destination N ») | ☐ | vidéo A2 |
| A3 | Contre-preuve seed≠distant | AUCUNE ligne « destination N » visible dans les départs | ☐ | photo A3 |
| A4 | **E1 — filtre choix** : filtre statut = `retarde` | Seul **San-Pédro** reste | ☐ | photo A4 |
| A5 | **E1 — filtre texte** : effacer, saisir « bou » | Seul **Bouaké** reste ; vider ⇒ tout revient | ☐ | vidéo A5 |
| A6 | **E2 — scope** : détail **Bouaké** | « Billets de ce départ » : **1 billet** (table `verifier.mjs`) | ☐ | photo A6 |
| A7 | **E2 — scope** : détail **Korhogo** | « Aucun billet pour ce départ » (**VIDE attendu**, jamais rows[0]) | ☐ | photo A7 |
| A8 | **E3.1 — erreur vraie** : mode avion, tirer/rouvrir « Départs », attendre ≤ 30 s | « Départs indisponibles » (l'état DIT l'échec ; pas de fausse fraîcheur) | ☐ | photo A8 |
| A9 | Réseau rétabli, attendre ≤ 30 s | Les départs serveur reviennent seuls (polling déclaré) | ☐ | vidéo A9 |
| A10 | **E3.3 — modification serveur** : remplacer `rows` par `rows.apres-modification`, redéployer, attendre ≤ 30 s | **Bouaké : 7500 + badge `retarde`** ; **Odienné apparaît** | ☐ | vidéo A10 |
| A11 | Hors-allowlist | Constat d'architecture : hôte revérifié par l'adaptateur embarqué (falsifié au banc) ; sur appareil, aucune donnée d'une autre origine ne peut s'afficher comme distante | ☐ | n/a |

## B. iOS (iPhone 16) — mêmes étapes A1→A10, installation par QR
(port USB-C mort — DET-012 : aucune automatisation ; build iOS = 2ᵉ build du
quota autorisé, à lancer seulement si l'Android est PASS.)

## C. PREUVES À CONSERVER
Captures/vidéos nommées `A2-chargement.mp4`, `A4-filtre-statut.jpg`, … dans
`docs/elite-protocol/evidence/appareil/2026-09-XX/` + une ligne de verdict
par étape (PASS/FAIL + heure) recopiée dans STATUS à la consignation.
**Critère global** : P10 crit. 7 se ferme si A1→A10 PASS sur les DEUX
appareils ; Android seul = progression consignée, pas de clôture.

## Critères ROADMAP visés
- **P10 crit. 7** « app fonctionnelle sur appareils physiques » (app GÉNÉRÉE).
- **P11** : une app installée rend exécutables « OTA < 15 min » et « rollback
  OTA » (session distincte, même appareil, arbitrage séparé).
- Réserves purgées si PASS : 🟡 visuels E1/E2, 🟡 E3.1, fil réel E3.3
  (le fait `liveData` reste inchangé : il ne prétendait PAS le fil réel).
