# VALIDATION SUR APPAREILS PHYSIQUES — SLICE 2 « suivi de conteneurs »

**Critère ROADMAP de la Phase 10** : « app fonctionnelle sur appareils
physiques ». C'est le **dernier critère non satisfait** de la phase ; les
sept autres sont prouvés (voir `STATUS.md`). Ce document est le dossier
complet pour que le propriétaire produise cette preuve.

**Aucune de ces étapes n'est automatisable ici** : le CLI `eas` n'est pas
installé dans l'environnement d'exécution, un build consomme le quota du
compte Expo, et l'installation exige les appareils.

---

## 1. ÉTAT EXACT DU PROJET

| Élément | Valeur |
|---|---|
| Dossier | `slices/conteneurs/app/` — **29 fichiers émis** par le compilateur, plus l'`eas.json` écrit par EAS (30 au total) |
| `rootHash` | **`7555bc357d294b6e…`** (artefact APRÈS correction DET-025 ; déterminisme **5/5**) |
| Identifiant Android | `com.deribfy.preview.suivi_conteneurs` |
| Identifiant iOS | `com.deribfy.preview.suivi-conteneurs` |
| Nom affiché | **Suivi Conteneurs** · slug `suivi-conteneurs` |
| Plateformes | `minSdkVersion` 26 (Android) · `deploymentTarget` 16.4 (iOS) |
| Permissions déclarées | `POST_NOTIFICATIONS` (Android) |
| Écrans | 3 · Entités | 3 · Données de démo : **12 conteneurs, 6 navires** |
| Identité visuelle (v2) | accent **`#0B6E9B`** clair / `#4FB3D9` sombre · rayons **4 / 10 / 18** |
| Chaîne logicielle | gates 🟢 · backend réel 🟢 (RLS 3/3, démonté) · sandbox 🟢 (`npm ci`, `tsc`, bundle : exit 0) · **Oracle L1 7/7** |

## 2. CE QU'IL FAUT AJOUTER À LA MAIN (et pourquoi)

Ces ajouts sont des **dettes du générateur déjà consignées**, pas des
improvisations : le gabarit ne les émet pas encore.

| Élément | État | Dette |
|---|---|---|
| `slices/conteneurs/eas.json` | ✅ **déjà créé** par mes soins (profils identiques à ceux qui ont fonctionné en Phase 8) | **DET-003** |
| `expo.owner` dans `app.json` | ❌ absent — `eas init` l'écrira | **DET-004** |
| `expo.extra.eas.projectId` | ❌ absent — `eas init` l'écrira | **DET-004** |
| `ios.infoPlist.ITSAppUsesNonExemptEncryption` | ❌ absent — `eas build` l'écrira seul au 1er build iOS | **DET-004** |

⚠️ **Ces ajouts sont effacés à chaque régénération du projet** (le
compilateur réécrit `app/`). C'est exactement ce que DET-004 décrit. Ne
régénérez pas le slice entre le build et l'installation.

## 2bis. TRAÇABILITÉ DE L'ARTEFACT (à respecter au prochain build)

| Élément | Valeur |
|---|---|
| `rootHash` de l'artefact courant | **`7555bc357d294b6e…`** (après correction DET-025) |
| Projet EAS | `@deribfy-apps-team/suivi-conteneurs` · `ef523f29-58e6-4f16-a5d0-c1e0e263573c` |
| Build Android déjà produit | `8b9dfd2b-937c-4a5a-bb1c-7e02b18b1062` — **ANTÉRIEUR à DET-025**, ne pas s'y fier |

⚠️ **Deux `eas.json` coexistent** : celui que j'avais préparé
(`slices/conteneurs/eas.json`, profils de la Phase 8) et **celui qu'`eas init`
a écrit dans `slices/conteneurs/app/`** — c'est **ce dernier qui fait foi**
(EAS lit à la racine du projet). Il diffère : `appVersionSource: "remote"` au
lieu de `"local"`, et pas de `android.buildType: "apk"` explicite. Le build du
2026-08-29 a néanmoins produit un APK installable. Comme `app.json`, ce
fichier est **effacé à chaque régénération du slice** — même famille que
DET-004.

**À me transmettre après le build** : l'**URL du nouveau build**. Sans elle,
l'observation appareil ne peut pas être rattachée formellement à l'artefact
corrigé, et le préambule de la ROADMAP exige des critères « consignés ».

## 3. COMMANDES EXACTES

```bash
cd /Users/yia/Documents/woorri/slices/conteneurs/app

# 1. Session Expo (compte deribfy-apps-team, celui de la Phase 8)
npx eas-cli@latest login

# 2. Création du projet EAS + écriture de owner/projectId dans app.json
npx eas-cli@latest init

# 3. ANDROID — APK de distribution interne (Galaxy A17)
npx eas-cli@latest build --platform android --profile preview
```

### iOS (iPhone 16) — mêmes credentials qu'en Phase 8

```bash
set -a; . ~/.deribfy-apple.env; set +a
export EXPO_ASC_API_KEY_PATH="$APPLE_P8_PATH"
export EXPO_ASC_KEY_ID="$APPLE_KEY_ID"
export EXPO_ASC_ISSUER_ID="$APPLE_ISSUER_ID"
export EXPO_APPLE_TEAM_ID="$APPLE_TEAM_ID"
export EXPO_APPLE_TEAM_TYPE=INDIVIDUAL

cd /Users/yia/Documents/woorri/slices/conteneurs/app
npx eas-cli@latest build --platform ios --profile preview
```

L'iPhone 16 est **déjà enregistré** auprès d'Apple (Phase 8, DET-011 :
1 appareil `ENABLED`, 1 profil `IOS_APP_ADHOC` actif). Si EAS propose de
réutiliser les credentials existants, **acceptez** — aucun nouvel
enregistrement n'est nécessaire.

## 4. INSTALLATION

- **Galaxy A17** : ouvrir la page de build EAS (QR) **sur le téléphone**,
  télécharger l'APK, autoriser l'installation depuis une source inconnue,
  ouvrir l'app. *(Le port USB du Mac fonctionne pour ce téléphone si vous
  préférez `adb install`.)*
- **iPhone 16** : ouvrir le QR du build **sur le téléphone** et installer.
  **Ne pas passer par le câble** : le port de données de l'appareil est mort
  (DET-012, démontré) — la voie QR l'a déjà contourné en Phase 8.

## 5. CHECKLIST D'OBSERVATION

### 5.A — Fonctionnement (bloquant)

| # | À observer | Attendu |
|---|---|---|
| 1 | L'app démarre | Écran **« Mes conteneurs »**, aucun crash, aucun écran rouge |
| 2 | Liste peuplée | **12 lignes** de conteneurs, avec sous-titre et valeur de fin de ligne |
| 3 | Défilement | La liste défile **sans à-coups** jusqu'à la 12ᵉ ligne |
| 4 | Navigation | Appui sur la **liste** → écran **« Détail du conteneur »** |
| 5 | Retour | Geste retour (Android) / balayage (iOS) → retour à « Mes conteneurs » |
| 6 | Écran de détail | En-tête de détail + **historique** + bouton « Activer les alertes » |
| 7 | Zone sûre basse | Le **dernier élément** de chaque écran reste atteignable, jamais sous la barre système (correction D-037) |
| 8 | Titre d'écran | Le titre apparaît **une seule fois**, dans l'en-tête natif (correction DET-017) |

### 5.B — Qualité A++ à confirmer sur appareil

| Dim. | À observer | Attendu |
|---|---|---|
| **A** | Cibles tactiles | Boutons et lignes de liste **confortables au doigt** (≥ 48 dp garantis par les tokens) |
| **B** | Contraste | Textes lisibles en plein soleil ; le **numéro de conteneur en bleu** reste lisible sur fond clair |
| **E** | Typographie | Réglages → taille de police **maximale** : rien n'est **coupé** ni tronqué |
| **G** | Virtualisation | Défilement fluide de la liste (observation d'exécution attendue par **DET-006**) |
| **H** | Identité visuelle | L'app est **bleu maritime `#0B6E9B`**, visiblement **différente** de « Maquis Express » (orange) — c'est la preuve visuelle du design system v2 |

### 5.C — Comportements ATTENDUS qui ne sont PAS des défauts

À ne pas signaler comme bugs — ce sont des limites connues et consignées :

| Observation | Pourquoi | Référence |
|---|---|---|
| **« Synchroniser maintenant »**, **« Activer les alertes »**, **« Tout marquer comme lu »** ne font **rien** | Ces actions ont un effet `capability`/`mutation`, non exécutable dans le moteur v1 | limite v1 connue |
| L'écran **« Notifications » est inatteignable** | Aucune action `navigate` ne le cible. **Mesuré : 17 écrans sur 50 (34 %) sont dans ce cas**, sur 10 des 13 documents — slice 1 compris | **DET-024** |
| Le bloc **« Rien à afficher pour l'instant »** s'affiche SOUS les 12 conteneurs | Le schéma AIR gelé ne permet pas de conditionner un bloc : `empty_state` est rendu sans condition. **Mesuré : 19 écrans sur 50** dans ce cas. La correction DET-025 n'a pas créé ce bloc, elle l'a rendu VISIBLE (il était hors écran) | **DET-017** volet 2 · décision **P-009** |
| **« Synchroniser maintenant »** et **« Synchroniser »** déclenchent la MÊME action | Un seul `actionId` (`act_synchroniser_conteneurs`), exposé par le bouton d'écran ET par le CTA de l'état vide. **Mesuré : 4 écrans** dans ce cas. Ils ne seraient jamais visibles ensemble si l'état vide était conditionné | **DET-017** volet 2 · décision **P-009** |
| Textes de démo génériques (« numero_conteneur 1 », « port_arrivee 1 ») | Fixtures déterministes : seul le contenu réel viendra du Content Pipeline | **DET-007** |
| Aucune donnée en direct | La preview utilise les données de démo (décision D-013) | **DET-008** |

## 6. CRITÈRES PASS / FAIL

**PASS — la Phase 10 peut être close** si, **sur les DEUX appareils** :
- les **8 points de 5.A** sont vérifiés ;
- les **5 points de 5.B** sont vérifiés, en particulier **H** (identité
  bleue, distincte du slice 1) et **G** (défilement fluide) ;
- aucun crash, aucun écran illisible, aucun contrôle inatteignable.

**FAIL — la phase reste ouverte** si l'un de ces cas survient :
- crash au démarrage ou pendant la navigation ;
- liste vide ou navigation impossible ;
- élément coupé/inatteignable (zone sûre) ;
- texte illisible ou tronqué à la taille d'accessibilité maximale ;
- **app visuellement identique au slice 1** (l'identité v2 n'aurait pas
  atteint l'appareil).

Un point de **5.C** observé n'est **jamais** un FAIL.

## 7. CE QUE JE FERAI ENSUITE

Transmettez-moi : le **verdict par point**, le **modèle et l'OS** de chaque
appareil, et si possible **2 captures** (liste + détail) par appareil. Je
consignerai la preuve dans `STATUS.md` et le scorecard, puis je clôturerai
la Phase 10 — **pas avant**.

Si vous branchez le Galaxy A17 en USB avec le débogage activé, je peux en
plus **rejouer automatiquement les flows générés** (`maestro/nav-android.yaml`)
sur l'appareil réel et produire un journal versionné, comme en Phase 8.
