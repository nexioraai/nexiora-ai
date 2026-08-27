# BANC P-003 — BIBLIOTHÈQUE DE STYLING REACT NATIVE

**Décision alimentée** : `DECISIONS.md` P-003. **Candidats** : StyleSheet +
tokens maison · react-native-unistyles · Tamagui · NativeWind.
**Contrainte absolue** (ARCHITECTURE §22) : le choix ne doit jamais fuiter
dans les CONTRATS de primitives — un candidat dont l'API impose ses types
dans les props publiques des primitives est disqualifié.

## Fixture

Mini-app Expo commune (`benchmarks/styling/fixture/`) : 3 écrans —
liste de 500 cartes (FlatList), formulaire (8 champs, états
error/loading), écran thème (light/dark + RTL). Tokens identiques pour les
4 candidats, générés depuis une source JSON unique (préfigure le pipeline
tokens double cible).

## Mesures

| Mesure | Méthode |
|---|---|
| Perf liste | temps de rendu initial + frame drops sur scroll 500 items (release build, appareil/simulateur identique) |
| Bascule thème | latence light↔dark |
| RTL | miroir correct sans code spécifique candidat (inspection + capture) |
| Poids | delta de taille du bundle JS et du binaire vs StyleSheet nu |
| Compat New Architecture | build + exécution sans warning spécifique |
| Étanchéité contractuelle | les 3 écrans compilent avec les MÊMES contrats de primitives pour les 4 candidats (preuve : un seul fichier de contrats partagé) |
| DX générateur | verbosité du code émis (LOC pour les 3 écrans) — le compilateur écrira ce code |

## Livrables

`benchmarks/styling/<candidat>/` + synthèse. Prérequis : simulateurs ou
appareils physiques ([mesuré] : absents de la machine actuelle).
