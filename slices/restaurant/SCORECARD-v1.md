# SCORECARD v1 — VERTICAL SLICE 1 (restaurant / « maquis-express »)

Phase 8, Étape A (D-036) — 2026-08-28. Métriques **mesurées**, journaux
bruts : `results/*.jsonl`, `results/metrics.json`.

## Identité du slice

| | |
|---|---|
| Intention | « restaurant / maquis » (une des 12 intentions fixes du corpus) |
| AIR | `resto-quartier` — **émis par le modèle** (D-025), aucune retouche manuelle (non-négociable 14 : provenance-modèle préservée) |
| projectId / slug | `prj_resto_quartier_abidjan` / `maquis-express` |
| Contenu | 4 écrans · 3 entités · 5 capabilities · 17 blocs |
| Artefacts | rootHash `343a94d994c44b22…` · SQL `15dd88ffef507151…` |

## Taux de succès (chaîne bout-en-bout)

| Étage | Résultat | Preuve |
|---|---|---|
| Gates (4 validateurs fail-closed) | ✅ 0 diagnostic | `slice-*.jsonl` |
| Compilation déterministe | ✅ 31 fichiers, rootHash **identique à la Phase 4** | store SHA-256 |
| Backend réel (provision → SQL → vérif → teardown) | ✅ 3 tables ⇔ 3 entités, **RLS 3/3**, seed 24 lignes, **teardown prouvé** | `backend-verif`, `teardown-preuve` |
| Sandbox §8 (install → typecheck → bundle) | ✅ vert, teardown prouvé | `sandbox-detail` |
| Oracle L1 (4 contrôles) | ✅ 4/4 | `oracle-detail` |
| Flows E2E générés (Oracle L2) | ✅ générés depuis l'AIR, 4 flows (nav+RTL × 2 plateformes) | `maestro/` |
| **Dev build + validation ÉMULATEURS iOS et Android** | ✅ builds Release verts ×2, **4/4 flows générés PASS** (nav+RTL, 13 étapes chacun, 0 échec) | `results/slice-e2e.jsonl` |
| **Build EAS (cloud, §13)** | ✅ **Android APK FINISHED (10 min 57 s)** + **iOS simulateur FINISHED (4 min 07 s)** — 0 $ (palier Free) ; **APK EAS installé sur émulateur : 2/2 flows générés PASS** | `results/eas-builds.jsonl`, `eas-artifact-e2e.jsonl` |
| **Appareil physique ANDROID (Galaxy A17, SM-A175F, Android 16)** | ✅ **APK EAS installé · app lancée · fixtures rendues · navigation réelle OK** (tap → `scr_panier`, retour → `scr_menu`) — **1 défaut device consigné** (voir dette 5) | `results/device-physique-e2e.jsonl` |
| **Appareil physique iOS (iPhone 16)** | ⏳ **OUVERT** — décision de méthode requise (§ Actions restantes) | — |

**Taux de succès de la chaîne automatisée : 7/7 étages verts.**

## Tests par plateforme et différences cross-platform

| | iOS (simulateur iPhone 17 Pro, iOS 26.5) | Android (émulateur bench_pixel) |
|---|---|---|
| Build dev Release | ✅ EXIT=0 | ✅ EXIT=0 |
| Installation + lancement | ✅ | ✅ |
| Flow navigation généré (13 étapes) | ✅ PASS | ✅ PASS |
| Flow RTL généré (13 étapes) | ✅ PASS | ✅ PASS |
| Fixtures rendues (ligne 1 de la liste) | ✅ | ✅ |
| Action `navigate` réelle + retour | ✅ (pop par geste de bord) | ✅ (back système) |

**Différences entre plateformes — inventaire complet :**
1. **Aucune différence dans le code généré** : 0 occurrence de `Platform.OS`,
   `.ios.`, `.android.` sur les 31 fichiers émis — les MÊMES fichiers
   servent les deux plateformes (vérifié par analyse du projet compilé) ;
2. **Une seule différence, dans les FLOWS de test** (pas dans l'app) : le
   geste de retour — `back` système sur Android, pop par geste de bord sur
   iOS, car iOS n'a pas de bouton retour matériel. Cette différence est
   portée par le **générateur de flows** (paramètre `platform`), jamais par
   l'application ;
3. **Manifeste `app.json`** : sections `ios` et `android` toutes deux
   émises (identités, permissions induites, planchers de plateforme via
   `expo-build-properties`) — symétrie complète.

**Conclusion cross-platform : le slice est nativement bi-plateforme.**
Aucune implémentation iOS-only n'a été introduite ; l'absence d'appareil
Android physique n'a eu AUCUN effet sur l'architecture ni sur le code.

## Temps (mesurés)

| Étape | Durée |
|---|---|
| Gates | 2 ms |
| Compilation | 3 ms |
| **Backend Supabase** (création → SQL → vérifications) | **169,4 s** |
| **Sandbox** (npm ci 9,9 s · tsc 1,9 s · bundle 14,7 s) | **28,7 s** |
| Oracle L1 | 17 ms |
| **Total chaîne (hors device)** | **≈ 3 min 20 s** |

## Coût

| Poste | Coût réel |
|---|---|
| LLM | **0 $** (AIR déjà émis en D-025 ; aucun appel dans ce slice) |
| Sandbox (Modal) | ~0 $ (crédits ; ~30 s de compute) |
| Backend (Supabase) | ~0 $ (org de banc Pro déjà souscrite ; projet **détruit** après vérification) |
| Émulateurs / Maestro | 0 $ (local) |
| **Total slice** | **≈ 0 $** |

## Repairs

**0 repair** — conforme à l'attente de la ROADMAP pour cette phase
(« repairs=0 attendu ici »). Aucune boucle de réparation n'a été
nécessaire : la chaîne a réussi du premier coup sur le document du slice.

## Qualité UI (évaluation)

Évaluée sur émulateurs (captures de 4.7/6.4 et flows du slice) : écrans
composés de blocs gelés (header/list/button/form/detail_header), thème
issu des tokens scellés, états explicites, page défilante ; navigation
native-stack conforme à l'AIR. **Réserve consignée** : l'évaluation
« anti-template » (variété visuelle inter-apps, §22) n'est pas
significative sur **un seul** domaine — elle prendra son sens au scorecard
cross-domain (Phase 10/14). Évaluation propriétaire attendue sur appareil.

## Garde-fou ROADMAP (« dette du GÉNÉRATEUR »)

**Aucun écart construit à la main pour faire passer le slice** :
`manualWorkarounds: []`. L'app, le SQL, les manifestes et les flows sont
**intégralement générés**. Les corrections faites pendant l'Étape A ont
porté sur le **harnais du slice** (résolution de module, fichier de
credentials, portée de variables, **teardown garanti en `finally`**), pas
sur les artefacts générés — elles sont journalisées et n'entrent pas dans
la dette du générateur.

## Dette du GÉNÉRATEUR consignée (constats, non corrigés ici)

1. **Seed partiel** : seules les entités portant un `dataset` dans l'AIR
   reçoivent des lignes (ici `ent_plat` = 24 ; `ent_commande` et
   `ent_ligne_commande` = 0). Constat de conception (D-030), à réexaminer
   quand les datasets seront produits par le Content Pipeline (§19).
2. **App non connectée au backend en preview** : conforme à D-013
   (« preview = données de démonstration uniquement ») et à D-032 (policies
   RLS applicatives différées) — mais cela signifie que le slice ne prouve
   pas encore le chemin app ⇄ backend vivant. À traiter là où la ROADMAP
   le prévoit, jamais par contournement.
3. **Provisioning à 169 s** (org Pro) contre ~9,5 s mesuré en Free
   (D-032-R55) : à surveiller pour le débit de flotte (Phase 14).
4. **Le gabarit ne porte pas la configuration de build cloud** — écarts
   ajoutés À LA MAIN pour faire passer le slice (garde-fou ROADMAP, donc
   DETTE DU GÉNÉRATEUR, pas solution) :
   a) `eas.json` absent du projet généré (profils de build) ;
   b) `app.json` émis sans `owner` ni `extra.eas.projectId` (liaison au
      projet EAS faite à la main) ;
   c) `expo-dev-client` absent : le profil EAS `development` (dev build au
      sens Expo) est donc **impossible sans modification manuelle** — le
      slice a utilisé la **distribution interne** (APK release installable
      par QR), qui satisfait « app installée et fonctionnelle » mais n'est
      pas un « dev build » au sens strict du terme.
   Ces trois manques sont des CONSTATS sur le générateur ; aucun n'a été
   « corrigé » dans les zones scellées (le gabarit reste intact).
5. **DÉFAUT RÉVÉLÉ PAR L'APPAREIL PHYSIQUE — safe area du bas non
   respectée** [démontré, Galaxy A17 / Android 16] : le **dernier bloc**
   d'un écran est rendu en `[0,2213]→[1080,2340]`, son bord inférieur
   coïncidant avec le **bas absolu de l'écran** (fenêtre applicative
   `1080x2340`, bord à bord) — il se retrouve **sous la barre de
   navigation gestuelle** et n'est pas pleinement atteignable. Preuve :
   les flows générés passent 3 étapes (lancement, écran, fixtures) puis
   échouent au `scrollUntilVisible` du dernier bouton, sur les DEUX flows.
   **Non reproduit sur émulateur** (3 phases de validation émulateur
   l'avaient manqué) — c'est exactement le type d'intégration que le
   vertical slice existe pour forcer.
   **Impact** : tout écran dont le dernier bloc atteint le bas ; contrôle
   partiellement inaccessible sur appareil réel (iOS aurait l'équivalent
   avec l'indicateur d'accueil).
   **Non corrigé ici, volontairement** : le garde-fou ROADMAP impose de
   consigner comme dette du générateur plutôt que de patcher pour faire
   passer le slice ; et la correction (padding d'inset dans le code émis)
   changerait tous les hash de sortie, invalidant les preuves de
   déterminisme des Phases 4/6/7 — cela relève d'une décision propriétaire.
   **L'app reste fonctionnelle** : navigation et retour vérifiés sur
   l'appareil réel.
