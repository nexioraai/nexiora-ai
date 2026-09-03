# RÉTROSPECTIVE — VERTICAL SLICE 1 (restaurant), Étape A

Phase 8, D-036 — 2026-08-28. Critère ROADMAP 3 (« rétrospective consignée »).

## Ce qui a fonctionné du premier coup

- **La chaîne du moteur, intégralement** : gates → compile → backend réel →
  sandbox → Oracle → flows. **0 repair**, **0 contournement manuel**.
  L'intégration forcée par le slice n'a révélé aucun défaut des artefacts
  générés — c'est le résultat le plus significatif.
- **Le déterminisme tient bout en bout** : le `rootHash` du slice
  (`343a94d994c44b22…`) est **identique** à celui produit en Phase 4 et
  en Phase 7, sur trois chaînes d'exécution différentes (locale, cloud
  durable, slice) et à plusieurs jours d'intervalle.
- **La discipline d'indépendance paie** : le slice a réutilisé le contrat
  `SandboxProvider` (Modal injecté) et l'interface de provisioning sans
  une ligne d'adaptation.

## Ce qui a cassé — et pourquoi c'est instructif

Tous les incidents ont porté sur le **harnais du slice**, jamais sur les
artefacts générés :
1. **Projet Supabase orphelin après un plantage** (résolution de module
   manquante). Le teardown n'était pas dans un `finally`. **Corrigé** :
   teardown garanti, et le projet orphelin supprimé immédiatement avec
   preuve d'absence. **Leçon générale** : toute ressource externe créée
   doit être détruite dans un `finally`, comme le fait déjà le runner de
   pipeline (§8) — le harnais doit hériter de la discipline du moteur.
2. Mauvais fichier de credentials (Modal lu depuis l'env Supabase) et
   portées de variables — défauts de script, corrigés sur preuve.

## Décisions NON prises (volontairement)

- **Ne pas connecter l'app au backend vivant** : D-013 impose des données
  de démonstration en preview et D-032 diffère les policies RLS
  applicatives. Connecter aurait exigé de toucher une décision validée —
  refusé. Consigné comme dette du générateur à traiter là où la ROADMAP
  le prévoit.
- **Ne pas simuler l'appareil physique** : les émulateurs ne sont PAS une
  preuve de fonctionnement sur appareil réel. Le critère 1 reste
  explicitement OUVERT.

## À surveiller pour les phases suivantes

- **Provisioning 169 s** (org Pro) vs ~9,5 s (Free) : impact sur le débit
  de flotte (Phase 14) — à instrumenter au Budget Governor.
- **Seed partiel** (entités sans dataset = 0 ligne) : deviendra visible
  quand le Content Pipeline (§19) produira les données.
- **Évaluation anti-template** non significative sur un domaine unique :
  elle prend son sens au scorecard cross-domain (Phases 10/14).
