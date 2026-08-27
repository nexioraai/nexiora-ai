# BANC E2E MOBILE — MAESTRO vs DETOX

**Décision alimentée** : choix de l'outil du niveau 2 de l'Oracle
(ARCHITECTURE §9). Candidats : Maestro (pressenti) · Detox. Critère de fond :
l'Oracle devra GÉNÉRER les flows depuis l'AIR — la lisibilité/générabilité du
format de flow compte autant que la fiabilité.

## Fixture

La mini-app du banc P-003 (mêmes 3 écrans), en build release sur simulateur
iOS et émulateur Android.

## Mesures

| Mesure | Méthode |
|---|---|
| Fiabilité (flakiness) | le même flow (navigation + formulaire + assertion d'états loading/error/empty) exécuté **20 fois** par plateforme ; taux d'échec non reproductible |
| Vitesse | durée médiane du flow complet |
| RTL | le flow passe-t-il sans modification sur l'app en mode RTL ? |
| Générabilité | le flow peut-il être émis mécaniquement depuis une structure de type AIR ? (essai : écrire le générateur trivial du flow de navigation) |
| Intégration sandbox/CI | exécution headless possible dans l'environnement retenu par P-002 ? coût/minute |
| Diagnostic d'échec | qualité des artefacts d'échec (captures, hiérarchie, logs) |

## Livrables

`benchmarks/e2e/<candidat>/` : flows, journaux des 20 runs, synthèse.
Prérequis : identiques à P-003 (simulateurs/appareils — absents de la
machine actuelle [mesuré]).
