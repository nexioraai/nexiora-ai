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

## A bis. MESURES POUR LA GRILLE A++ (`A12`, `A13` — ajoutées le 2026-09-04, `D-135` volet V3)

> Ces deux étapes n'appartiennent pas au fil `E1→E3.3` : elles alimentent le
> **canal de preuve appareil** de la grille A++, seul chemin par lequel les
> dimensions **A** et **G** peuvent cesser d'être NON DÉTERMINÉES. Elles
> produisent un **artefact machinable**, pas une appréciation : une capture
> d'écran, une vidéo ou un constat d'architecture ne sont PAS recevables.

| # | Étape | Ce qu'il faut relever | PASS/FAIL | Preuve |
|---|---|---|---|---|
| A12 | **Dimension A — géométrie** : sur l'écran d'accueil, exporter la hiérarchie UI (Maestro `--debug-output`), puis relever la **densité** et les **insets système** de l'appareil | hiérarchie BRUTE (`bounds` + `resource-id` par nœud) · `densité` · `insets` haut/bas/gauche/droite en px · dimensions d'écran · modèle · OS · identifiant de build EAS · empreinte de l'artefact installé | ☐ | `preuve-appareil.json` |
| A13 | **Dimension G — fenêtre de virtualisation** : ouvrir une liste **longue**, défiler jusqu'au bas, exporter la hiérarchie PENDANT/APRÈS le défilement | hiérarchie BRUTE de la liste · identifiant du bloc de liste · **nombre de lignes réellement SERVIES** par la source à l'instant de la capture | ☐ | `preuve-appareil.json` |

**Ce que `A12` et `A13` mesurent — et ce qu'elles NE mesurent PAS.**

`A12` établit les trois clauses de **A** : zones sûres, aucune cible sous une
barre système, cibles ≥ 48 dp. Périmètre nommé : seuls les blocs `button` et
les LIGNES de liste sont mesurés, leur `testID` étant posé par les primitives
sur le `Pressable` lui-même. **Les champs de formulaire sont EXCLUS** —
`TextField` pose son `testID` sur l'enveloppe, pas sur la saisie ; mesurer
l'enveloppe ne prouverait rien. Exclusion assumée, jamais conformité par défaut.

`A13` n'établit **qu'une** des trois clauses de **G** : l'existence d'une
fenêtre de virtualisation. La clause « **défilement sans jank** » n'est PAS
mesurée — la seule méthode dont dispose le dépôt (banc `P-003`, échantillonnage
RAF) est qualifiée par le dépôt lui-même de *comparative, jamais absolue*. Le
« retour visuel sur chaque action » n'est pas mesuré non plus.
**Conséquence, à énoncer sans détour : `A13` peut RÉFUTER `G` — c'est la
signature de `DET-025` — mais ne peut pas l'établir. `G` demeure NON DÉTERMINÉE
même après une session `A12`/`A13` intégralement PASS.**

⚠️ **Prérequis de longueur.** `A13` exige une liste dont la source sert au
moins **6** lignes pour que la capture dise quoi que ce soit. Pour qu'un
montage COMPLET vaille réfutation, il faut dépasser la **fenêtre de rendu** de
`VirtualizedList` — `windowSize ?? 21` dans la dépendance installée, et la
`FlatList` émise ne la surcharge pas. Cette borne n'est pas un chiffre fixé
d'avance : elle est **DÉRIVÉE de la mesure**, `21 × hauteur d'écran / plus
petite hauteur de ligne capturée`. Ordre de grandeur sur les appareils visés
(écran 2340 px, lignes de 58 à 69 dp) : **environ 240 à 310 lignes**.
**La fixture actuelle `validation-appareil` sert 5 lignes (6 en état modifié) :
elle ne permet donc PAS d'exécuter `A13`.** Constat consigné ; la fixture n'est
pas modifiée — son extension relève d'un arbitrage distinct.

**Artefact.** Un unique `preuve-appareil.json` par session, déposé dans
`docs/elite-protocol/evidence/appareil/<date>/`, au contrat
`deribfy.preuve-appareil/1`. Il est REFUSÉ — donc sans effet, `A` et `G`
restant NON DÉTERMINÉES — s'il manque la hiérarchie brute, la densité, les
insets, l'horodatage, l'identifiant de build, l'empreinte de l'artefact, ou si
son `airHash` ne correspond pas au document évalué. Ce dernier contrôle est le
rattachement au build : une preuve captée sur une autre application est rejetée
mécaniquement. `easBuildId` et l'empreinte sont EXIGÉS et conservés pour la
traçabilité, mais ne sont pas vérifiables hors appareil — limite nommée.

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
