# MASTER PLAN — MOTEUR DE GÉNÉRATION D'APPLICATIONS MOBILES NATIVES

| | |
|---|---|
| Version | **v0.1 — PROPOSÉ, EN ATTENTE DE VALIDATION EXPLICITE DU PROPRIÉTAIRE** |
| Statut après validation | **FIGÉ** — toute modification passe par une décision explicite consignée dans `DECISIONS.md` |
| Date | 2026-08-27 |
| Origine | Confrontation architecturale multi-IA (Gemini, ChatGPT, Claude Chat/Opus 5) + rapport de confrontation Claude Code du 2026-08-27 + convergence finale actée par le propriétaire |
| Standard cible | 2026 |

---

## 1. MISSION

Transformer une demande humaine nouvelle — dans un domaine arbitraire, dans
n'importe quelle langue supportée — en application mobile native
professionnelle : réellement exécutable sur appareils physiques, testée,
sécurisée, conforme aux stores, évolutive et distribuable, sans que chaque
demande devienne un projet artisanal.

Deribfy n'est PAS un catalogue de générateurs par catégorie. C'est un moteur
général dont la limite est : **capabilities disponibles + providers
accessibles + contraintes techniques** — jamais une liste arbitraire de
catégories.

## 2. PRINCIPE FONDAMENTAL

```
AI AT THE EDGES  +  DETERMINISTIC CORE
```

Le LLM comprend l'intention, produit/modifie l'AIR, écrit le code des Code
Slots, diagnostique et répare. Il ne décide jamais de la structure du
système, ne choisit jamais une dépendance, n'est jamais son propre juge.

## 3. COLONNE VERTÉBRALE (invariante)

```
USER INTENT → AI UNDERSTANDING → AIR → CAPABILITY SYSTEM
→ SMART BLOCKS + CODE SLOTS → STORE POLICY GATE
→ DETERMINISTIC COMPILER → BACKEND PROVISIONING
→ SANDBOX → ORACLE / VERIFICATION → REPAIR LOOP
→ CAPABILITY ROUTER → RUNTIME (profils) / NATIVE BUILD (EAS)
→ PREVIEW / QR → DISTRIBUTION (BYO)
```

Détail de chaque étage : `ARCHITECTURE.md`.

## 4. NON-NÉGOCIABLES (21)

1. AIR comme source de vérité.
2. Compilateur déterministe (même entrée + mêmes versions = même sortie).
3. Capability System fermé et contrôlé — le LLM demande, le registre décide.
4. Smart Blocks contractuels et testés — un bloc non testé n'est pas officiel.
5. Oracle indépendant — les validations critiques sont déterministes ; un
   LLM-juge n'a jamais autorité sur sécurité/comportement/conformité, et le
   juge n'est jamais l'auteur.
6. Sandbox éphémère sécurisée — le code généré ne s'exécute jamais sur
   l'infrastructure principale.
7. Workflow asynchrone durable dès la v1 — jamais une route HTTP synchrone
   « à migrer plus tard ».
8. Repair Loop contrôlé — jamais « erreur → LLM → modification arbitraire ».
9. Capability Router OTA/native — décision fondée sur l'empreinte native
   calculée, pas sur une simple déclaration.
10. Runtime Client en profils versionnés (taille, permissions et surface
    d'attaque minimales).
11. Backend Provisioner déterministe.
12. Architecture multi-provider — aucune dépendance structurelle à un
    fournisseur unique.
13. Gestion sécurisée des secrets — aucun secret dans une sandbox ou un
    binaire ; custody des clés de signature dans le Vault.
14. Cross-domain evaluation comme métrique officielle.
15. Versioning et reproductibilité (air / lock / deployment state ;
    artefacts adressés par hash ; release train reproductible).
16. Architecture internationale (langue utilisateur ≠ langue app ≠ langue
    contenu ≠ langues des utilisateurs finaux ; RTL réel).
17. Design System de niveau professionnel — l'accessibilité est une exigence
    de CONFORMITÉ testée, pas seulement de qualité.
18. Évolution possible vers d'autres targets (Web, desktop) sans les forcer
    en v1.
19. BYO Developer Account **structurel dès la v1** (App Store Guideline
    4.2.6) — seul le preview vit sous le compte Deribfy.
20. Applications réellement exécutables sur appareils physiques.
21. **Isolation de tenancy** : aucun backend d'application générée dans le
    projet Supabase cœur de Deribfy ; blast radius borné à une app.

## 5. GOUVERNANCE DU CHANTIER

- **Source de vérité = ce dossier** (`docs/mobile-generation/`), jamais la
  mémoire d'une conversation.
- **Règle de continuité (obligatoire)** — au début de toute session
  consacrée à ce chantier : lire `MASTER_PLAN.md`, `ARCHITECTURE.md`,
  `ROADMAP.md`, `STATUS.md`, puis `DECISIONS.md` si nécessaire. Ensuite
  seulement, travailler.
- **Mise à jour continue** — après chaque étape significative : `STATUS.md` ;
  décisions dans `DECISIONS.md` ; `ROADMAP.md` si nécessaire ;
  `CHANGELOG.md` pour les changements importants.
- **Aucun saut de phase silencieux** — une étape qui paraît inutile est
  signalée, argumentée, avec alternative proposée, et attend validation.
- **Décisions produit** (périmètre v1, priorités commerciales, arbitrages de
  coût) : propriétaire. **Arbitrages techniques** : meilleure solution
  démontrée, quelle qu'en soit l'origine.
- **Mesurer avant de décider** — les choix listés « expérimentaux » dans
  `DECISIONS.md` ne se tranchent que sur banc de mesure (Phase 1), jamais
  sur papier.
- Les critères de sortie d'une phase ne sont JAMAIS assouplis après coup
  pour faire passer un résultat. Si les mesures sont mauvaises, elles sont
  mauvaises.

## 6. PHASES

L'ordre officiel, les critères d'entrée/sortie et les tests de chaque phase
sont dans `ROADMAP.md`. Résumé : Fondations (0) → Bancs de mesure (1) →
AIR + Capabilities (2) → Design System + Blocks (3) → Compilateur (4) →
Backend Provisioner (5) → Sandbox + Oracle (6) → Workflow durable (7) →
Vertical Slice 1 (8) → Repair + Code Slots (9) → Vertical Slice 2
cross-domain (10) → Router + Profils + OTA (11) → Policy Gate + Compliance +
BYO (12) → Distribution réelle + Guardian (13) → Fleet + industrialisation
(14).

## 7. CE QUE CE PLAN N'AUTORISE PAS ENCORE

Tant que ce document porte le statut « EN ATTENTE DE VALIDATION » :
- aucune implémentation du générateur ;
- aucune restructuration du dépôt ;
- aucune dépense d'infrastructure (sandbox, EAS, projets Supabase).

La validation explicite du propriétaire fige ce plan et ouvre la Phase 0.
