# AUDIT MODE 3 — ÉTAT

Standard exigé : **ELITE 2026 / A+** — aucun lot déclaré validé sans preuve réelle
(résultat SQL littéral, test exécuté, tsc/vitest réels). Distinction stricte :
**code terminé ≠ test effectué ≠ preuve validée**.

Dernière mise à jour : 2026-08-25 — **PHASE 0 de cartographie livrée** (voir en fin de fichier).

> ⚠️ **Le plan 9/9 lots ci-dessous date du 2026-08-22 et PRÉCÈDE les audits Mode 1
> et Mode 2.** Il n'a donc pas appliqué les classes de défaut que ceux-ci ont
> révélées : contexte LLM mentant au modèle, composition de rendu non testée,
> i18n de surface publique, borne non testée, RPC non versionnée, protection
> reposant uniquement sur une autre couche. **Sa validation reste acquise sur
> son propre périmètre ; elle ne vaut pas audit selon la méthodologie
> actuelle.**

---

## PLAN MODE 3 — TERMINÉ, 9/9 LOTS VALIDÉS

| Lot | Statut | Preuve obtenue |
|-----|--------|----------------|
| A | **VALIDÉ** | Éligibilité fournisseur par `dropship_type` — code + tests |
| B | **VALIDÉ** | Bucket `custom-designs` durci — SQL exécuté, capture confirmée |
| C | **VALIDÉ** | Garde `pod_brand` mockups + validation `dropshipType` — code + tests |
| G | **VALIDÉ** | Autorisation champ par champ (`sites`, `shop_products`) — **56/56 tests déclaratifs, 0 échec** |
| H/1 | **VALIDÉ** | Machine à états `shop_orders.status` — **56/56 transitions comportementales, 0 échec** |
| I | **VALIDÉ** | Webhooks fournisseurs + crons financiers fail-closed — secrets confirmés présents en production Vercel avant l'audit |
| J | **VALIDÉ** | `design_uploads` tenant-bound single-use — **24/24 structure + 7/7 comportement, 0 échec** |
| K | **VALIDÉ** | `supplier-watch` CRON_SECRET + fuites d'info (`catalog/search`, `pod/catalog`, `shipping-estimate`) |
| L | **VALIDÉ (A/B)** | Bug actif `cost_price` + duplication `catalog-suggest` |

### SQL exécutés et prouvés en production
- `supabase/sql/lot_g_final_field_level_authorization.sql` — LOT G
- `supabase/sql/shop_order_status_machine.sql` — LOT H/1 (2 triggers ENABLED, RPC SECURITY INVOKER)
- `supabase/sql/design_uploads.sql` — LOT J (table, RLS, grants)
- `supabase/sql/phase2_privileges_hardening.sql` — phase 2 (5 étapes)

---

## PHASE 2 — PASSE DE CLÔTURE — **TERMINÉE**

### 1. Codes promo — **VALIDÉ**
Cause racine : la remise était calculée et **affichée** par `CartDrawer.tsx` mais
n'était **jamais transmise ni appliquée** — le client voyait « −20 % » et payait plein tarif.

Décision produit actée : **OPTION A** — le marchand choisit le pourcentage **et en
assume intégralement le coût**. Commission Nexiora calculée sur le montant **avant**
remise. Garde-fous Mode 3 inchangés, désormais évalués sur le `clientPays` réel
(donc strictement plus stricts).

| # | Problème | État |
|---|----------|------|
| P-1 | Remise affichée jamais appliquée | ✅ code seul transmis, tout recalculé serveur, coupon Stripe `amount_off` |
| P-2 | `ILIKE` → jokers `%`/`_` exploitables | ✅ égalité stricte, code normalisé majuscules |
| P-3 | `subtotal` client utilisé | ✅ `min_order` + remise sur total serveur ; route `validate` = aperçu sans autorité |
| P-4 | `max_uses` jamais appliqué | ✅ RPC `consume_promo_code` atomique, appelée après le CAS `pending→paid` (exactement-une-fois) |
| P-5 | `promo_codes.site_id` nullable | ✅ migration DB **15/15** |
| P-6 | Aucune borne sur `discount_value`/`discount_type` | ✅ applicatif + contraintes DB |

**Isolation tenant** : policy cross-tenant `"Public read active promos"`
(`qual = active = true`, **sans filtre `site_id`**) découverte, supprimée et vérifiée
(0 policy, RLS actif, `service_role` intact). 19 tests dédiés.

### 2. Privilèges Supabase — **VALIDÉ** (5 étapes)

Script versionné : `supabase/sql/phase2_privileges_hardening.sql`.

| Étape | Avant | Après | Nature du gain |
|---|---|---|---|
| 1 — `TRUNCATE` | 54 | **0** | Seul privilège qui **contourne RLS** par conception. Prouvé **comportementalement** : 8/8 tentatives refusées (`42501`) sous `SET LOCAL ROLE anon`/`authenticated`, 0 anomalie |
| 2 — `REFERENCES`/`TRIGGER` | 108 | **0** | + invariant prouvé comportementalement sur les futures tables |
| 3 — `INSERT`/`UPDATE`/`DELETE` | → 13 → | **1** | Le restant (`score_history`) est légitime |
| 4 — `SELECT` | 60 | **16** | 8 tables réellement lues, sur 30 |
| 5 — `EXECUTE` | 4 exposées | **0** | Axe jamais audité avant cette passe |

**Deux vulnérabilités réelles trouvées et fermées** :

- **`admin_sites_by_mode()`** — `SECURITY DEFINER`, corps sans `WHERE`, `EXECUTE`
  hérité de `PUBLIC`. Exposait la cartographie des **14 sites, tous propriétaires
  confondus**, à quiconque possède la clé anon publique. Preuve comportementale sous
  `SET LOCAL ROLE anon` : somme des compteurs = 14 = totalité de la base.
- **`score_history`** — policy `INSERT` avec `WITH CHECK true` alors que sa policy
  `SELECT` filtrait correctement par propriété. Tout utilisateur authentifié pouvait
  polluer l'historique de scores de n'importe quel marchand. Prédicat resserré.

Aucune des deux n'était atteignable par les LOTS G/H/J/K : elles vivaient dans les
**fonctions** et dans les **prédicats `WITH CHECK`** — deux axes hors de tous les
périmètres précédents.

**Risque résiduel documenté, non contournable** : 4 entrées `pg_default_acl`
appartenant à `supabase_admin` (`postgres` n'en est pas membre, prouvé). Mitigation :
`REVOKE` explicite dans chaque script de création de table (patron `design_uploads.sql`),
empiriquement validé — les 4 tables déjà propres sur 31 étaient exactement celles
créées avec ce `REVOKE`.

### 3. Reporting `admin/stats` — **VALIDÉ**
`processing` était exclu du chiffre d'affaires alors que ce statut n'est atteignable
que depuis `paid` : les commandes **POD** en préparation disparaissaient du CA,
tandis que les commandes **CJ** au même stade (qui restent `paid`) y figuraient —
sous-évaluation systématique et asymétrique.
Corrigé via `REVENUE_STATUSES` dans `orderStatusMachine.ts` (source unique, cohérente
avec la machine à états du LOT H). 8 tests dédiés.

### 4. Audit supplémentaire — **VALIDÉ**, 1 défaut actif trouvé et corrigé

Revue ciblée du chemin promo/paiement modifié dans cette passe.

**DEBT-027 — idempotence Stripe inerte en production (corrigé).**
`stripe.ts` dérive **trois** clés d'idempotence de `checkoutNonce` et documente ce
champ comme le correctif du double-clic / des deux onglets ; `checkout/route.ts`
l'accepte. Mais `CartDrawer.tsx` — seul appelant réel — ne l'envoyait **jamais** :
les trois clés valaient `undefined`, et les sessions Stripe étaient créées sans
aucune idempotence. **Exactement la même classe de défaut que P-1** : mécanisme
implémenté, testé, documenté — jamais activé faute d'un paramètre côté appelant.

Corrigé par une clé **dérivée du panier** (`src/lib/shop/checkoutNonce.ts`) plutôt
qu'un aléa persisté : Stripe rejette une même clé rejouée avec des paramètres
différents, donc un nonce aléatoire conservé côté navigateur aurait **cassé** le
checkout dès la première modification du panier. 19 tests dédiés verrouillent les
deux propriétés contradictoires (stabilité / sensibilité).

**DEBT-028 — oracle d'énumération de codes promo (corrigé).**
Route publique non authentifiée confirmant en une requête l'existence d'un code.
Limitation de débit posée **uniquement sur le chemin « code introuvable »** : un
code valide est renvoyé avant tout comptage, donc saturer la limite ne bloque
jamais un acheteur légitime — c'est le placement de la garde, et non son seuil,
qui neutralise le risque de déni de service ciblé. 8 tests (première couverture
de cette route).

**DEBT-029b — garde montant nul, tous modes (corrigé).**
Tous les garde-fous financiers étaient enfermés dans `if (site.mode === 3)` : une
remise de 100 % en mode 1/2 avec livraison gratuite produisait un montant de 0
refusé par Stripe, avec une erreur opaque côté acheteur. Garde sortie du bloc,
409 explicite. 2 tests dont un contrôle positif.

**DEBT-029a — accumulation de coupons Stripe : correction refusée, argumentée.**
Les deux correctifs envisageables sont pires que le problème : réutiliser un
coupon est incompatible avec `max_redemptions: 1` (ce qui empêche le partage de
lien), et un `redeem_by` recalculé à chaque tentative provoquerait un
`idempotency_error` sur tout rejeu dans les 24 h. L'accumulation est par ailleurs
déjà largement réduite par DEBT-027 (un rejeu du même panier réutilise le coupon).

Voir aussi « Lacunes de méthode » ci-dessous : le résultat structurant de ce point
est d'avoir établi que **deux axes n'avaient jamais été audités**, puis de les
avoir fait auditer.

---

## ÉTAT TECHNIQUE

- `npx vitest run` → **876/876 tests, 100 fichiers**
- `npx tsc --noEmit` → **exit 0** (vérifié explicitement, jamais via un pipe qui masque l'échec)
- Aucun usage `realtime`/`postgres_changes` dans le dépôt (vérifié) — aucune
  souscription ne dépend d'un `SELECT` révoqué.
- Seul appel PostgREST brut (`postHealthReport.ts:17`) : `SUPABASE_SERVICE_ROLE_KEY`,
  non concerné par les révocations.

---

## LACUNES DE MÉTHODE IDENTIFIÉES (à corriger dans les audits futurs)

1. **Les privilèges `EXECUTE` sur les fonctions** n'étaient dans aucun périmètre.
   Les LOTS G/H/J/K auditaient les routes HTTP ; les étapes 1–4 auditaient les
   privilèges de tables. PostgreSQL accorde `EXECUTE` à `PUBLIC` par défaut à la
   création de **toute** fonction — un `SECURITY DEFINER` oublié y devient une
   porte ouverte contournant RLS.
2. **Les prédicats `WITH CHECK` des policies** n'étaient jamais lus. Une policy
   *existe* ne dit rien de ce qu'elle *autorise* : `score_history` avait une policy
   `SELECT` correcte et une policy `INSERT` à `true` sur la même table.
3. **Vérifier la cohérence `SELECT` ↔ `INSERT`/`UPDATE` d'une même table** doit
   devenir systématique : l'asymétrie est le signal.

---

## MÉTHODE (leçons acquises — à respecter)

- Une policy RLS (`pg_policies`) ne prouve **jamais** un `GRANT`/`REVOKE` : mécanismes indépendants.
- La présence d'un SQL dans l'éditeur ne prouve **jamais** son exécution.
- `postgres` ≠ `service_role` (le premier est propriétaire, privilèges implicites).
- « Success. No rows returned » n'est une preuve **que** si le bloc est instrumenté
  pour échouer bruyamment (`RAISE EXCEPTION` sur témoin divergent). Sinon, jamais.
- **L'éditeur SQL Supabase n'affiche pas les `RAISE NOTICE`** → restituer les bilans
  en lignes (`SELECT`) ou via une exception finale porteuse du bilan.
- **Il ne préserve pas l'état de session entre instructions** → pas de table
  temporaire ni de `BEGIN…ROLLBACK` multi-instructions ; tout dans une instruction unique.
- Il **tronque** les colonnes longues → restituer une définition ligne par ligne
  (`unnest(string_to_array(..., E'\n')) WITH ORDINALITY`).
- Un `0 échec` sans vérification du **dénominateur** est une preuve invalide.
- Un **compteur** de témoin ne détecte pas une modification à somme nulle → utiliser
  une **empreinte** (`md5(string_agg(... ORDER BY ...))`) pour les invariants critiques.
- `name[] = text[]` n'existe pas en PostgreSQL (les casts implicites ne se propagent
  pas aux tableaux) → comparer des scalaires typés.
- `pg_constraint.conkey` est indexé **base 1** ; `pg_index.indkey` (int2vector) **base 0**.
- `tgenabled` est de type `"char"` : `'O'` = enabled (lettre O, pas le chiffre 0).
- **Grants de colonnes** : ils vivent dans `pg_attribute.attacl`, **pas** dans
  `pg_class.relacl`. `has_table_privilege()` renvoie `true` dès qu'une seule colonne
  est concernée — un `REVOKE` de niveau table les efface tous.
- **`ALTER DEFAULT PRIVILEGES`** n'affecte que les objets **futurs** créés **par le
  rôle nommé**, et exige d'être membre de ce rôle.
- Un privilège hérité de `PUBLIC` n'est **pas** retiré par un `REVOKE … FROM anon`
  → toujours vérifier `grantee = 0` avant de conclure.
- **PostgREST embedding** (`.select('...catalog_products(...)')`) exige les privilèges
  sur la table imbriquée, qui n'apparaît dans aucun `.from()` → un `REVOKE` fondé sur
  un grep de `.from()` casse la production.
- 12 fichiers font `import { supabaseAdmin as supabase }` → un grep sur
  `supabase.from(...).update(` produit des **faux positifs massifs**. Toujours
  résoudre le binding fichier par fichier.
- Tout nouveau répertoire de test doit être ajouté à l'`include` de `vitest.config.ts`,
  sinon il passe en isolation mais n'est **jamais** collecté en CI.


---
---

# PHASE 0 — CARTOGRAPHIE GLOBALE (2026-08-25)

Commit de référence : `45a5861` · branche `fix/xss-jsonld` · working tree propre.
**Aucune correction faite.** Cette phase précède l'audit détaillé par sous-mode.

## Surface mesurée

**26 fichiers** lisent `dropship_type` · **5 répertoires de domaine** (`mode3/` 4
fichiers, `cj/` 7, `suppliers/` 6, `dropship/` 2, `fulfillment/` 12) · **11 routes**
(6 catalogue, 3 POD, 2 webhooks) · **491 tests** sur ces surfaces.

## Autorités de sous-mode — il n'y en a que DEUX

| Autorité | Fichier | Décide |
|---|---|---|
| `CATALOG_SUBTYPES` `{reseller, pod_custom}` | `agent-tools/toolCapabilities.ts` | quels sous-types ont les **outils** de catalogue |
| `suppliersForDropshipType` | `dropship/suppliers.ts` | quels **fournisseurs** un sous-type admet |

Tout le reste (`hasSupplierCatalog`, `CATALOG_SITE_MODES`) décide au niveau du
**mode**, pas du sous-type. **C'est la faiblesse structurelle du Mode 3 :
la granularité de l'admission est le mode ; la granularité du besoin est le
sous-type.**

## Matrice des sous-modes

| sous-type | outils catalogue | fournisseurs | guidance LLM | `CatalogSearch` | vitrine charge les sélections |
|---|---|---|---|---|---|
| `reseller` | oui | `cj` | RESELLER | monté | oui |
| `pod_brand` | **non** | `printful,gelato` | POD_BRAND | non | **non** |
| `pod_custom` | oui | `printful,gelato` | POD_CUSTOM | monté | oui |
| `null` / inconnu / `''` | **non** | **`cj`** (repli) | **AUCUNE** | **monté** | **non** |

## Défauts identifiés — aucun corrigé

| ID | Niveau | Titre |
|---|---|---|
| **M3-01** | 🟠 | `AuroraTheme` monte `CatalogSearch` sur `isShop`, pas sur `mode === 3` |
| **M3-02** | 🟠 | Trois couches en désaccord sur « ce site peut-il avoir des sélections catalogue ? » |
| **M3-03** | 🟡 | `dropship_type = NULL` sur **3 sites Mode 3 sur 8** : reseller pour 2 couches, rien pour 2 autres |
| **M3-04** | 🟡 | Repli `default → ['cj']` permissif, et un test en dépend |
| **M3-05** | 🟠 | `src/lib/mode3/**` : **0 test, non collecté** par vitest |
| **M3-06** | ⚪ | `admin/stats` `|| 'reseller'` — reporting seul |

Détail complet et preuves : `KNOWN_ISSUES.md`, `DEBT-048` → `DEBT-053`.

## Volumétrie production (lecture seule, 2026-08-25)

8 sites Mode 3 : 4 `reseller`… en fait **4 avec sous-type** (2 reseller nommés,
1 pod_brand, 1 pod_custom, 1 reseller) et **3 à `dropship_type = NULL`** ·
73 sélections dont **54 non approuvées** · 33 580 `catalog_products` ·
26 commandes toutes `fulfillment_domain = supplier`, 3 avec `cj_order_id` ·
0 `design_uploads` · **0 sélection pour un pod_brand** · **0 sélection pour un
sous-type NULL**.

Les deux défauts 🟠 ont donc **zéro occurrence matérialisée aujourd'hui**.

## Mutations de cartographie — 6/6 tuées

pod_brand ajouté à `CATALOG_SUBTYPES` · `CATALOG_SUBTYPES` vidé · reseller reçoit
les fournisseurs POD · pod_brand reçoit CJ · repli rendu permissif · repli rendu
fail-closed. **Les deux autorités de sous-mode sont solidement verrouillées.**

## Ordre d'audit recommandé — CONTESTÉ

Voir le rapport de phase : l'ordre `reseller → pod_brand → pod_custom` est
**écarté** au profit d'un **socle transversal d'abord**.
