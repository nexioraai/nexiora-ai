# SCORECARD CROSS-DOMAIN — 2 DOMAINES (Phase 10)

| Champ | Valeur |
|---|---|
| Rôle EXCLUSIF | Comparaison MESURÉE des deux vertical slices sur les métriques officielles. Recalculé par `slices/run-scorecard.mjs` ; aucun chiffre n'y est saisi à la main. |
| Date | 2026-08-29 |
| Moteur | train `rt-2026.08` 1.0.0, tokens 1.1.0, blocs 1.0.0 |

## IDENTITÉ DES DOMAINES

| Domaine | Slice 1 — restaurant de quartier | Slice 2 — suivi de conteneurs maritimes |
| --- | --- | --- |
| Famille | commerce de proximité (famille du corpus) | logistique B2B (HORS-TEMPLATE, D-042) |
| Provenance de l'AIR | campagne D-025 (corpus gelé) | campagne D-042, **même protocole vérifié** |
| Thème déclaré | `warm_bistro` | `maritime_logistics` |
| Classe commerce | physical_or_offapp | none |

## GÉNÉRATION

| Écrans | 4 | 4 |
| Entités / champs | 3 / 28 | 3 / 21 |
| Actions / slots | 17 / 5 | 16 / 4 |
| Capabilities | auth, payments.psp, push_notifications, offline_storage, analytics | auth, push_notifications, offline_storage, share, analytics |
| Providers résolus (§15) | 5 | 6 |
| Fichiers émis | 31 | 31 |
| rootHash | `8da987ee01691540…` | `2482d93d976c95c0…` |
| Déterminisme (5 compilations) | 5/5 | 5/5 |
| Tables SQL générées | 3 | 3 |

## VÉRIFICATION

| Oracle L1 | 🟢 7/7 | 🟢 7/7 |
| Backend réel (provision → SQL → vérif → démontage prouvé) | 🟢 (Phase 8) | 🟢 ok=true, démonté=true |
| Sandbox §8 (npm ci · typecheck · bundle) | 🟢 exit 0 sur les 3 étapes | 🟢 exit 0 sur les 3 étapes |
| Appareils physiques | 🟢 Android physique (Galaxy A17, 2/2 flows PASS) · 🟢 build iOS de distribution interne FINISHED (Phase 8) | 🔴 non validé — exige un build EAS puis une installation manuelle sur appareil |
| Réparations nécessaires | 0 | 0 |
| Contournements manuels | 0 | 0 |

## QUALITÉ UI — GRILLE A++ (8 dimensions)

| Dimension | restaurant | conteneurs | Constat |
|---|---|---|---|
| **A** ergonomie | 🟢 | 🟢 | tapTarget=48 (min 48), 3 surface(s) contrainte(s) |
| **B** contraste | 🟢 | 🟢 | 36 paires / 0 échec |
| **C** états | 🟢 | 🟢 | états rendus par le bloc liste : loading/empty/error |
| **D** cohérence | 🟢 | 🟢 | 0 valeur en dur (couleurs, espacements, rayons, typographie) |
| **E** typographie | 🟢 | 🟢 | échelle strictement croissante (12 < 14 < 17 < 22), 0 verrou d'agrandissement |
| **F** i18n/RTL | 🟢 | 🟢 | 0 propriété physique |
| **G** virtualisation | 🟢 | 🟢 | 3 écran(s) à liste, 0 encapsulé dans un ScrollView, parent borné=true |
| **H** anti-template | 🟢 | 🟢 | 2 domaines · structure : 2 silhouettes distinctes, 0 collision(s) · visuel : 2 identité(s) pour 2 thème(s) déclaré(s) |

## DIMENSION H — DÉTAIL DE LA MESURE SUR LES 2 DOMAINES

| Silhouette structurelle | `b81507bafd0d8fe6…` | `5891205da3af0206…` |
| Identité visuelle émise | `ed87b070c5d3f299…` | `3a2c148e9fd5dd4f…` |

- **Axe structurel** : 2 silhouettes, **0 collision** — les deux apps ne partagent pas la même composition d'écrans.
- **Axe visuel** : **2 identité visuelle** pour **2 thèmes déclarés** (`maritime_logistics`, `warm_bistro`) — la variété demandée par l'AIR n'atteint pas l'artefact.
- **Verdict H : CONFORME** — dette DET-021, correction suspendue à la décision P-007 (design system v2).

## GÉNÉRALISATION HORS-TEMPLATE — CE QUE LE SLICE 2 DÉMONTRE

- Le moteur produit une app **complète, compilable et bundlable** pour un
  domaine qu'aucun gabarit du corpus ne couvre : `npm ci`, `tsc` strict et
  le bundler renvoient **exit 0** en sandbox, sans aucune intervention.
- **0 réparation, 0 contournement manuel** sur la chaîne du slice 2.
- Le **registre de capabilities gelé a suffi** : les 5 capacités demandées
  par le domaine logistique existent toutes dans le registre v1 — aucune
  capability hors registre n'a été nécessaire.
- Les **silhouettes diffèrent** : la structure suit réellement le domaine.
- **Limite mesurée** : l'identité visuelle, elle, ne suit pas — c'est
  exactement la non-conformité H, et elle est la même pour les deux slices.
