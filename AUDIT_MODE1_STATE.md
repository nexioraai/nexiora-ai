# AUDIT MODE 1 — ÉTAT

Standard exigé : **ELITE 2026 / A+** — aucun chantier déclaré validé sans preuve
réelle (test exécuté, rendu mesuré, schéma vérifié). Distinction stricte :
**code terminé ≠ test effectué ≠ preuve validée**.

Dernière mise à jour : 2026-08-25 (audit général profond — Mode 1 **NON FERMÉ**).

| | |
|---|---|
| Commit de référence | `dacac92` — *feat(mode-1): translate llms.txt and align cart labels with the page* |
| Branche | `fix/xss-jsonld`, synchronisée avec `origin/fix/xss-jsonld` |
| Working tree à l'audit | **propre** (aucun stash) |
| Baseline de tests | **170 fichiers, 2731 tests, 100 % passants** (73 s) |

---

## 1. OBJECTIF

Démontrer que le **Mode 1 (site vitrine)** respecte son contrat : il ne peut ni
accéder aux capacités Mode 2/3, ni afficher de capacité commerciale interdite,
ni l'activer indirectement ; ses chemins d'écriture et de lecture sont
cohérents ; ses données sont protégées ; son rendu est cohérent.

**Stratégie : Mode 1 d'abord.** Les autres modes ne sont abordés qu'après
fermeture complète de Mode 1.

## 2. PÉRIMÈTRE

**Dans le périmètre** — tout problème affectant réellement Mode 1, y compris sur
une surface partagée avec Mode 2/3 dès lors que Mode 1 en subit l'effet.

**Hors périmètre** — tout problème exclusivement Mode 2 ou Mode 3 : consigné en
§9, jamais transformé en chantier Mode 1.

## 3. ARCHITECTURE CONCERNÉE — LES CINQ FRONTIÈRES

| Frontière | Autorité | Question posée |
|---|---|---|
| **Admission au commerce** | `lib/commerce-admission/canTransact.ts` | ce site a-t-il le droit de vendre ? |
| **Routage** | `lib/order-domain/resolve.ts` | qui exécute cette vente ? |
| **Affichage / facturation** | `sites/[slug]/themes/modeCapabilities.ts` | que montre-t-on, et comment facture-t-on le port ? |
| **Catalogue** | `lib/dropship/catalogAdmission.ts` | ce site a-t-il un catalogue fournisseur ? |
| **Outils de l'agent** | `lib/agent-tools/toolCapabilities.ts` | que l'agent peut-il proposer ? |

Toutes sont des **allowlists positives** (`Set.has`, paramètre `unknown`,
comparaison stricte) : un mode ne reçoit une capacité que s'il y est inscrit.
`TRANSACTING_SITE_MODES = [2, 3]` — le Mode 1 en est absent, et c'est la seule
chose que le module affirme à son sujet.

## 4. ORDRE DES ÉTAPES — PLAN GELÉ, 8/8 CHANTIERS VALIDÉS

| Chantier | Statut | Objet |
|---|---|---|
| 1 | **VALIDÉ** | `llms.txt` publie ce que le site rend (`sections`, non la colonne morte `services`) |
| 2 | **VALIDÉ DÉFINITIVEMENT** | FAQ visible dans les quatre thèmes |
| 3 | **VALIDÉ** | `sites.lang` éditable, borné aux langues réellement servies |
| 4 | **VALIDÉ** | `faq` et `whyus` éditables par l'agent, adressés par contenu |
| 5 | **VALIDÉ** | `area_served` et `price_range` éditables, prompts gardés |
| 6 | **VALIDÉ** | `catalog enhance` et `selections` gardés par `hasSupplierCatalog` |
| 7 | **VALIDÉ** | `propose_gallery_add`, le verbe galerie manquant |
| 8 | **VALIDÉ** | `llms.txt` traduit, libellés du panier alignés sur la page |

**Le plan est terminé. Aucun chantier 9 ; aucun chantier nouveau sans décision explicite.**

## 5. ÉTAPE EN COURS

**Chantier de fermeture Mode 1 — TERMINÉ, 3 volets sur 3.**

| Volet | Statut | Preuve |
|---|---|---|
| 1 — garde de mode à l'écriture (`/apply`) | **VALIDÉ** (`71d5b23`) | `modeFrontier.test.ts`, 30 tests ; suite complète 171 fichiers / **2762 tests**, 0 échec ; `tsc` clean |
| 2 — `PromoBanner` + routes promo | **VALIDÉ** (`39173f0`) | `promoFrontier.test.ts`, 28 tests, **4/4 mutations tuées** ; suite 172 fichiers / **2790 tests**, 0 échec |
| 3 — le lien `toolCapabilities` ↔ `canTransact` | **VALIDÉ** (`bee8bfd`) | `toolAllowlistCoherence.test.ts`, 44 tests, **8/8 mutations architecturales tuées** ; suite 173 fichiers / **2834 tests**, 0 échec |

## 6. PROCHAINE ÉTAPE

Le chantier de fermeture Mode 1 est **terminé, 3 volets sur 3** :

1. ~~Garde de mode en tête de `POST /api/agent/[slug]/apply`~~ — **FAIT**, DEBT-030 fermé (`71d5b23`).
2. ~~`PromoBanner` sous `canTransact` + garde de mode dans les deux routes promo~~ — **FAIT**, DEBT-031 fermé (`39173f0`).
3. ~~Lien entre les capacités d'outils et l'admission au commerce~~ — **FAIT**, DEBT-032 fermé (`bee8bfd`).

~~**DEBT-033**~~ — **FAIT** (contexte de l'agent). Reste **DEBT-034**
(fraîcheur SEO/GEO, migration de schéma), puis statuer explicitement sur
DEBT-035, DEBT-036 et DEBT-037 (découvert en traitant DEBT-033).

## 7. DÉCOUVERTES — AUDIT GÉNÉRAL PROFOND DU 2026-08-25

Sept défauts, **tous nouveaux** : aucun ne figurait dans `KNOWN_ISSUES.md`,
aucun n'appartenait au périmètre d'un chantier 1-8, aucun n'est la reformulation
d'un rapport antérieur. Détail complet et preuves dans `KNOWN_ISSUES.md`.

| Réf. rapport | Registre | Niveau | Résumé |
|---|---|---|---|
| M1-01 | DEBT-030 | ✅ **FERMÉ** | `/apply` n'appliquait **aucune** frontière de mode — 4 outils commerciaux acceptés sur une vitrine. Corrigé au volet 1 |
| M1-02 | DEBT-031 | ✅ **FERMÉ** | `PromoBanner` monté sans condition de mode (**à deux endroits**, découverte du volet 2) + routes promo publiques sans garde. Corrigé au volet 2 |
| M1-03 | DEBT-033 | ✅ **FERMÉ** | Contexte agent lisait `site.phone` / `site.contact_email`, **colonnes inexistantes**. Corrigé, et la CLASSE fermée par un invariant Proxy contre le schéma réel |
| M1-04 | DEBT-034 | 🟠 | `sites.updated_at` n'existe pas → fraîcheur SEO/GEO gelée sur trois surfaces |
| M1-05 | DEBT-035 | 🟡 | `price_range` en JSON-LD, absent de `llms.txt` |
| M1-06 | DEBT-032 | ✅ **FERMÉ** | Aucun lien n'existait entre `toolCapabilities` et `canTransact` — inscrire le Mode 1 dans `PROMO_MODES` n'aurait fait rougir aucun test. Cause structurelle de M1-01. Corrigé au volet 3 |
| M1-07 | DEBT-036 | ⚪ | Colonnes commerciales éditables en PostgREST par un Mode 1 — classe C, non exploitable |

### Méthode de preuve

Deux tests adversariaux ont été écrits, exécutés (7/7 assertions) puis
**supprimés** — le working tree est resté propre. Le schéma a été reconstruit
programmatiquement depuis `lot_g_final_field_level_authorization.sql` :
41 colonnes éditables + 18 protégées = **59 colonnes nommées**, sans `phone`,
sans `contact_email`, sans `updated_at`.

## 8. INVARIANTS MODE 1 — VÉRIFIÉS SAINS

| Invariant | Preuve | |
|---|---|---|
| Ne peut pas produire de commande | trigger Postgres `ORDER_SITE_NOT_TRANSACTING` + `trg_site_mode_keeps_orders_valid` — **imposé en base** | 🟢 |
| Ne peut pas posséder de `shop_products` | `canTransact` sur POST + `requireProductOwner` sur PATCH/DELETE + **zéro GRANT PostgREST** | 🟢 |
| Ne peut pas interroger un catalogue fournisseur | `hasSupplierCatalog` sur `curate`/`enhance`/`selections`/`search` | 🟢 |
| N'affiche ni panier ni Shop | `CartShell` **recalcule** `hasShop` depuis les données brutes | 🟢 |
| Ne peut pas changer de mode | `mode` hors `GRANT UPDATE` ; aucun chemin applicatif post-création | 🟢 |
| Sa page produit n'existe pas | `fetchProduct` ne lit que `shop_products` / `site_catalog_selections` → 404 structurel | 🟢 |
| L'agent ne reçoit que les outils de son mode | `toolNamesForSite`, fail-closed — **vérifié à la proposition** | 🟢 |
| L'agent ne reçoit que la guidance de son mode | `guidanceForSite`, fail-closed | 🟢 |
| XSS | 2 sinks `dangerouslySetInnerHTML` dans tout le dépôt, tous deux échappés, cliquet structurel sur JSON-LD | 🟢 |
| i18n | cliquet vérifiant que chaque langue déclarée résout dans les **trois** dictionnaires, avec libellés distincts du repli | 🟢 |
| Éditeur | `ProductManager`, `PaymentConnect`, `CatalogSelections`, `OrderManager`, `FinanceDashboard` tous gardés `mode 2\|3` | 🟢 |
| **Ne peut pas produire d'artefact commercial** | — | 🔴 DEBT-030 |
| **N'affiche aucune surface commerciale** | — | 🔴 DEBT-031 |

## 9. HORS PÉRIMÈTRE MODE 1 — non analysé, non traité

- `CartShell` reçoit `mode` mais **pas** `products` depuis `produits/[id]/page.tsx:96`
  → `hasShop=false` pour un site **Mode 2** sur sa propre page produit. Non vérifié plus avant.
- `PromoBanner` : libellés en dur en français et devise `$` en dur, ignorant `site.lang`.
- `promo_codes` n'a **aucun** script dans `supabase/sql/` — table créée hors versionnement.
- DEBT-002, DEBT-003, DEBT-004, DEBT-007, DEBT-026 — ouvertes, sans impact Mode 1 démontré.

## 10. INCERTAIN FAUTE DE PREUVE

1. **Privilèges PostgREST sur `promo_codes`** — second vecteur possible pour
   DEBT-030, dont celui-ci **ne dépend pas** (prouvé par le chemin `/apply`).
2. **Confirmation directe** de l'absence de `sites.phone` / `contact_email` /
   `updated_at` — établie par reconstruction cohérente, non par `information_schema`.
3. **Rendu navigateur réel** de `PromoBanner` sur une vitrine — chaîne prouvée par
   lecture de code et exécution des trois maillons, rendu visuel non observé.

Les points 1 et 2 relèvent d'une **limite environnementale unique** : ni
`DATABASE_URL`, ni CLI Supabase liée, ni token Management API — la même qui tient
DEBT-004 ouverte depuis le 2026-08-19. Un accès Postgres en lecture seule les
rendrait décidables en une requête.

## 11. CRITÈRES DE FERMETURE

Mode 1 est fermé quand, et seulement quand, il est **démontré** que :

- [x] il respecte son contrat de vitrine ;
- [x] il ne peut pas accéder aux capacités Mode 2/3 *(admission, catalogue, commande, produits)* ;
- [ ] **il n'affiche aucune capacité commerciale interdite** → DEBT-031 ;
- [ ] **il ne peut pas les activer indirectement** → DEBT-030 ;
- [x] ses chemins d'écriture/lecture sont cohérents ;
- [x] ses données sont protégées ;
- [x] son rendu est cohérent *(quatre thèmes, quatre langues)* ;
- [ ] **il ne possède plus aucun défaut 🔴/🟠 non traité** → DEBT-030, 031, 033, 034.

**STATUT : NON FERMÉ.** Le critère « ne peut pas les activer indirectement » est
fermé côté applicatif depuis le volet 1 (DEBT-030), **sous la réserve du §10.1** :
le vecteur PostgREST direct sur `promo_codes` reste non prouvé. Le critère
« n'affiche aucune capacité commerciale interdite » reste ouvert (DEBT-031).

---

## 14. DÉCOUVERTE DU VOLET 1 — un test documentait le défaut

`faqWhyUsTools.test.tsx` contenait **deux assertions contradictoires** :
« le Mode 2 reçoit les six outils, **le Mode 3 ne les reçoit pas** » (l. 324) et
« les Modes 2 **et 3** empruntent le même chemin d'écriture », qui exigeait un
**200 sur un site Mode 3** (l. 340). Les deux ne coexistaient que parce que
`/apply` ignorait le mode : le 200 ne mesurait pas un chemin partagé, il mesurait
le trou.

**Conséquence hors Mode 1, assumée et dite** — un site Mode 3 émettant une requête
`/apply` forgée sur `propose_faq_*` / `propose_whyus_*` reçoit désormais **403** au
lieu de 200. Ce n'est atteignable ni par l'agent (`toolNamesForSite` ne lui propose
pas ces outils) ni par l'éditeur (le formulaire y existe pour tous les modes et
n'emprunte pas `/apply`). Le chantier 4 n'est **pas invalidé** : c'est son contrat
déclaré qui est appliqué au lieu d'être seulement écrit. L'intention d'origine du
test est conservée et mieux prouvée — l'absence de branche de mode est vérifiée sur
les deux modes que la famille admet (1 et 2), par égalité stricte des écritures.

**Classification : B** — nécessaire à une étape déjà prévue (le volet 1 lui-même).

---

## 12. LACUNES DE MÉTHODE IDENTIFIÉES

1. **Mode 1 était le seul mode sans document d'état versionné.** Mode 3 avait
   `AUDIT_MODE3_STATE.md`, Mode 2/3 son plan dans `docs/` ; les 8 chantiers Mode 1
   n'avaient laissé de trace que dans les messages de commit et les commentaires de
   code — le plan a dû être reconstruit par rétro-ingénierie pour auditer. **Ce
   fichier comble cette lacune.**
2. **Deux allowlists décrivaient le même domaine sans que rien ne les relie** —
   `toolNamesForSite` (proposition) et `ALLOWED_TOOLS` (application). Une propriété
   exécutable les aurait tenues ensemble dès le premier jour. Voir DEBT-032.
3. **Chaque cliquet a un dénominateur, et ce dénominateur EST son angle mort.**
   `modeSurfaceExhaustivity` indexe les *lecteurs* de `sites.mode` : un fichier qui
   ne lit pas le mode lui échappe **par construction**, et son propre en-tête
   l'admet. Les 5 cliquets du dépôt n'ont jamais subi cet examen.
4. **Un test qui vérifie la forme ne vérifie pas la résolution.**
   `currentSiteState.test.ts` contrôlait la présence des clés du contexte de
   l'agent, jamais leur valeur contre un site réel — d'où DEBT-033, invisible
   pendant huit chantiers.

## 13. MÉTHODE — LEÇONS ACQUISES

- Une garde en **commentaire** n'est pas une garde. Toujours mesurer les
  occurrences *exécutables* (`grep` puis lecture ligne à ligne), jamais le simple
  compte textuel : `/apply` citait `canTransact` trois fois sans jamais l'appeler.
- Une protection **relayée** (re-appel HTTP vers une route gardée) et une écriture
  **directe** (`supabaseAdmin`) dans le même fichier n'ont pas la même sûreté.
  Les distinguer explicitement à chaque revue.
- Un composant monté **en frère** d'une garde n'hérite pas de cette garde.
  `CartShell` se neutralise correctement ; `PromoBanner`, à côté, ne le fait pas.
- Une colonne lue nulle part ailleurs dans le dépôt est **suspecte par nature** :
  `site.phone` n'avait qu'un seul lecteur au monde, ce qui suffisait à le signaler.
- `JSON.stringify` **élide** les clés `undefined` : un contexte LLM peut perdre
  silencieusement un champ sans qu'aucune erreur ne se produise.
- Le schéma réel peut être reconstruit sans accès base, depuis les scripts de
  privilèges versionnés — à condition qu'ils se déclarent recalculés contre le
  schéma réel, ce que fait `lot_g_final_field_level_authorization.sql`.
- Un test adversarial écrit pour un audit doit être **supprimé** ensuite : la
  preuve appartient au rapport, pas au working tree.
- Le reporter `basic` n'existe plus en Vitest 4 — `npx vitest run` sans option.
