# VALIDATION SUR APPAREILS PHYSIQUES — Phase 8, critère de sortie 1

Critère ROADMAP (l.123, verbatim) : « app installée et fonctionnelle sur
**2 appareils physiques** ». Appareils retenus par le propriétaire :
**iPhone 16 (iOS 26.5.2)** et **Samsung Galaxy A17 (Android)**.

État au 2026-08-28 : aucun des deux n'est connecté au Mac (`adb devices` :
émulateur seul ; `devicectl` : aucun appareil iOS). Les deux volets
attendent donc une action du propriétaire.

## Volet ANDROID — prêt, 0 $, aucune décision requise

L'artefact est **déjà construit par EAS** et **déjà prouvé fonctionnel**
(installé sur émulateur, 2/2 flows générés PASS).

- Page d'installation (QR) :
  `https://expo.dev/accounts/deribfy-apps-team/projects/maquis-express/builds/07b39479-98b4-4219-a22b-da4836299fcc`
- APK direct :
  `https://expo.dev/artifacts/eas/triWE5v0UoDqmmPhatlFvSucJbJ80vu9xeifOo4TOqU.apk`
- Distribution : INTERNE (pas de store, pas de compte tiers)

**Deux voies, au choix du propriétaire :**
1. **QR seul** (le plus simple) : ouvrir la page ci-dessus sur le Galaxy
   A17, installer, ouvrir l'app. Preuve = constat propriétaire + capture.
2. **USB + débogage** (preuve la plus forte) : activer « Options pour les
   développeurs » → « Débogage USB », brancher le Galaxy A17 au Mac. Je
   peux alors installer l'APK **et rejouer les flows générés depuis l'AIR
   sur l'appareil RÉEL** — exactement les mêmes assertions que sur
   émulateur, exécutées automatiquement, avec journal versionné.

## Volet iOS — bloqué sur une DÉCISION propriétaire (méthode)

Un build iOS installable sur un **appareil physique** exige des
credentials Apple. Deux voies, mutuellement exclusives :

| Voie | Coût | Ce qu'elle implique |
|---|---|---|
| **(a) EAS + Apple Developer Program** | **99 $/an** | Chemin conforme à ARCHITECTURE §13 ; installation par QR ; **de toute façon obligatoire en Phase 12** (TestFlight, critère de sortie l.168) — dépense anticipée, non gaspillée |
| **(b) Build local Xcode, Apple ID gratuit** | **0 $** | Signature « personal team », profil valable 7 jours ; exige l'iPhone branché en USB et une confirmation de confiance sur l'appareil ; s'écarte du chemin EAS de §13 (écart à consigner) |

**Aucune des deux n'est exigée par le critère de sortie** — c'est un choix
de méthode. Aucune dépense ne sera engagée sans accord explicite.

## Ce qui sera consigné après validation

- Preuves par appareil (installation, lancement, parcours, captures) ;
- Complément du SCORECARD-v1 (colonne « appareils physiques ») ;
- Tout écart manuel nécessaire → **dette du GÉNÉRATEUR** (garde-fou),
  jamais présenté comme une solution.
