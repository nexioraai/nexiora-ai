# AUDIT MODE 3 — ÉTAT

Standard exigé : **ELITE 2026 / A+** — aucun lot déclaré validé sans preuve réelle
(résultat SQL littéral, test exécuté, tsc/vitest réels). Distinction stricte :
**code terminé ≠ test effectué ≠ preuve validée**.

Dernière mise à jour : 2026-08-25 — **LOT 3 (`pod_brand`) RÉSOLU** (voir en fin de fichier).

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
| `null` / inconnu / `''` | non | **`[]`** *(LOT 1)* | AUCUNE | **non monté** *(LOT 1)* | non |

**Après le LOT 1, la ligne « sans sous-type » est cohérente de bout en bout :
elle ne peut plus être créée, et là où elle subsiste (3 sites historiques) elle
ne déclenche plus rien.**

## Défauts identifiés — aucun corrigé

| ID | Niveau | Titre |
|---|---|---|
| **M3-01** | 🟠 | `AuroraTheme` monte `CatalogSearch` sur `isShop`, pas sur `mode === 3` |
| **M3-02** | 🟠 | Trois couches en désaccord sur « ce site peut-il avoir des sélections catalogue ? » |
| **M3-03** | 🟡 | `dropship_type = NULL` sur **3 sites Mode 3 sur 8** : reseller pour 2 couches, rien pour 2 autres |
| **M3-04** | 🟡 | Repli `default → ['cj']` permissif, et un test en dépend |
| **M3-05** | 🟢 | `src/lib/mode3/**` : non collecté — **FERMÉ au LOT 0** |
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

## Progression des lots

| Lot | Objet | Statut |
|---|---|---|
| **0** | Collecte de `src/lib/mode3/**` | ✅ **TERMINÉ** — manque latent fermé, prouvé par sonde |
| **1** | Socle transversal (DEBT-050, DEBT-051, autorités de sous-mode) | ✅ **RÉSOLU** — 14/14 mutations tuées, 3088 tests |
| **2** | Frontières internes (DEBT-048, DEBT-049) | ✅ **RÉSOLU** — 19/19 mutations tuées, 3178 tests |
| **3** | **POD_BRAND** (+ DEBT-055/058/059, puis DEBT-062/063) | ✅ **RÉSOLU** — 23 mutations tuées, 3220 tests |
| 4 | RESELLER | à faire |
| 5 | POD_CUSTOM | à faire |
| 6 | Transversal final (+ **DEBT-054**, rattachée depuis le LOT 1) | à faire |

### Rattachement des deux découvertes du LOT 1 — sans réouverture

**DEBT-055 → lot `pod_brand`.** Elle vit dans un fichier transversal
(`api/chat/route.ts:835`, chemin de création) mais la question qu'elle pose —
*qui a le droit de curer ?* — est propre à un sous-mode : la route déclenche
l'auto-curation pour `pod_brand`, alors que `CATALOG_SUBTYPES` lui refuse les
outils de curation et que sa guidance dit « do NOT suggest catalog_curate ».
C'est le cas prévu par la règle « un problème cru transversal se révèle
spécifique à un sous-mode » : signalé avant tout déplacement de périmètre.

**Le LOT 1 ne l'a ni créée ni aggravée**, mesuré sur le diff `f0740f9..244267d` :
la garde est passée de `finalMode === 3 && dropshipType` à
`finalMode === 3 && persistedDropshipType` — pour un `pod_brand`, les deux
expressions sont vraies. Le comportement `pod_brand` est **strictement
inchangé** par le LOT 1 (fournisseurs POD inchangés ; `showsVisitorCatalogSearch('pod_brand')`
rend `false`, exactement comme la négation qu'elle remplace).

**DEBT-054 → lot transversal final.** Elle ne porte sur aucun sous-mode : elle
porte sur le **dénominateur d'un cliquet**. Elle doit être *connue* pendant les
lots 2 à 5 — toute garantie du type « cette surface est déclarée donc visible »
y est plus faible qu'annoncée — mais elle ne doit pas y être traitée, sous
peine de mêler une correction d'architecture à un lot de sous-mode.

**Aucun lot fermé n'est rouvert.** Ces deux dettes préexistaient au LOT 1 ;
elles ont été *découvertes*, pas introduites. Mode 1, Mode 2, LOT 0 et LOT 1
restent fermés.

## Ordre d'audit — VALIDÉ

Voir le rapport de phase : l'ordre `reseller → pod_brand → pod_custom` est
**écarté** au profit d'un **socle transversal d'abord**.


---

# LOT 1 — SOCLE TRANSVERSAL — RÉSOLU (2026-08-25)

## Ce que le diagnostic avait changé au modèle

Il n'y avait pas **deux** autorités de sous-type mais **trois** — la troisième,
`isValidDropshipType`, vivant dans `api/chat/route.ts`, décidait de ce qui est
**persistable**. Et le défaut n'était dans **aucune** des trois : elles sont
solides (6/6 mutations en phase 0, 5/6 sur les appelants). Il était dans le
**chemin d'écriture** et dans les **replis des couches appelantes**.

Aucune des trois n'a été refondue. Une **quatrième question**, que personne ne
posait, a reçu son autorité : *ce COUPLE (mode, sous-type) est-il écrivable ?*

## Les cinq problèmes

| ID | Niveau | Statut | Preuve |
|---|---|---|---|
| L1-01 | 🟠 | ✅ résolu | `subtypeAdmission.ts` + refus 400 au point d'écriture + `need_dropship_type` à l'onboarding — M1–M6 tuées |
| L1-02 | 🟠 | ✅ résolu | 4 replis supprimés, allowlist positive unique — M8–M13 tuées, dont **M11 = l'ancienne survivante C5** |
| L1-03 | 🟡 | ✅ résolu | `default → []`, banc A7 réécrit délibérément — M7, M14 tuées |
| L1-04 | 🟡 | ✅ résolu | `NULL` est fail-closed dans **toutes** les couches mesurées (voir matrice) |
| L1-05 | ⚪ | ✅ résolu | 115 tests neufs sur le couple (mode 3, absent), 4 fichiers **prouvés collectés** (181 → 185) |

## Matrice après correction — plus aucune divergence sur `NULL`

| Couche | avant | après |
|---|---|---|
| écriture (`chat/route.ts`) | **fail-open** — `null` accepté | **refus 400** |
| `onboarding` | **fail-open** — `null` produit | **réclame le sous-type** |
| `suppliersForDropshipType` | **fail-open** — `['cj']` | **`[]`** |
| `CatalogSearch` (défaut param.) | **fail-open** — `'reseller'` | **aucun défaut** |
| montage vitrine ×3 | **fail-open** — négation | **allowlist positive** |
| `CATALOG_SUBTYPES`, `modeGuidance`, `shared.tsx`, éditeur, mockups, `pod-fulfill`, checkout/design | fail-closed | inchangé |

## Frontières — non rouvertes, et c'est mesuré

- **Mode 1 / Mode 2** : `resolvePersistedSubtype` rend toujours `{ok, null}` pour
  eux ; leur création est testée intacte (`onboarding`, modes 1 et 2).
- **Mode 2 ↔ Mode 3** : toutes les corrections vont dans le sens **restrictif**.
  `suppliersForDropshipType` n'est atteignable que sous `hasSupplierCatalog`
  (`{3}`) ; lui faire rendre `[]` ne peut rien ouvrir vers le Mode 2.
- **DEBT-048 tenue ouverte volontairement** : `showsVisitorCatalogSearch` ne
  connaît **pas** le mode, précisément pour qu'`AuroraTheme` conserve sa garde
  manquante. Un test la verrouille comme **constat** et échouera le jour où le
  LOT 2 la traitera.

## Production — lecture seule, après correction

Les 3 sites sans sous-type sont **inchangés** : `updated_at` de juillet
(`techflow-electronics` 07-05, `athletehub` 07-16, `tiny-threads-global` 07-16).
Aucune écriture n'a été faite. **Leur attribution d'un sous-type reste une
décision produit ouverte.**

⚠️ **Conséquence assumée sur `techflow-electronics` (publié)** : sa barre de
recherche n'est plus montée et le checkout d'un produit catalogue est refusé.
Le site avait déjà 0 sélection et 0 produit ; il vendait, via la recherche, du
CJ qu'aucune décision produit n'avait choisi.

## Découvertes nouvelles — consignées, non corrigées

`DEBT-054` 🟠 le cliquet d'exhaustivité est aveugle au camelCase (`finalMode`) —
transversal · `DEBT-055` 🟠 l'auto-curation se déclenche aussi pour `pod_brand` —
**appartient au sous-mode `pod_brand`** · `DEBT-056` ⚪ branche client
`choose_mode` morte.

Deux constats intégrés aux corrections : `api/onboarding/**` n'était **pas
collecté** par vitest (préfixe ajouté, même piège qu'au LOT 0), et les fixtures
Mode 3 du checkout **ne portaient aucun sous-type** — le banc de test
reproduisait exactement l'état des 3 sites défectueux.


---

# LOT 2 — FRONTIÈRES INTERNES MODE 3 — RÉSOLU (2026-08-25)

## La thèse initiale était fausse, et c'est ce qui a permis de trouver la bonne

Le premier diagnostic du LOT 2 concluait qu'il fallait vider
`suppliersForDropshipType('pod_brand')`. **La contre-vérification l'a réfutée**,
et le dépôt lui-même l'a tuée : 6 tests, dont le banc protégé A7
« 3 · pod_brand → POD ». Trois mesures indépendantes :

- `mockupsToProducts` émet `catalog-${catalog_product_id}::${variant_id}` ;
- `pod-fulfill` n'exécute **que** des lignes `catalog-*` ;
- production : **0 `shop_products` sur l'ensemble des sites Mode 3**.

Les produits `pod_brand` **sont** des produits catalogue Printful. Vider ses
fournisseurs aurait refusé 100 % de ses ventes au checkout.

## La vraie frontière : la SOURCE de la sélection

| | source des produits | mécanisme |
|---|---|---|
| `reseller`, `pod_custom` | `site_catalog_selections` | curation / approbation |
| `pod_brand` | `sites.pod_designs[].mockups` | supports POD + mockups |

Les deux aboutissent à `catalog_products` et à des ids `catalog-*`. **Confondre
« produit catalogue » et « sélection catalogue » était la cause racine de toute
la divergence.**

## L'autorité : `usesCatalogSelections(mode, subtype)`

Posée dans **`catalogAdmission.ts`**, qui portait déjà `hasSupplierCatalog`.
Ce n'est pas une cinquième autorité : c'est **la même question, une granularité
plus bas**. Elle appelle `hasSupplierCatalog` — imbriquée, jamais parallèle.

**Sept couches la consomment** : `curate` · `enhance` · `selections` (4 verbes) ·
`search` · `image-search` · `fetchProduct` · `sitemap`.
**`pod/catalog`** reçoit la garde de son jumeau `generate-mockups` (`pod_brand`
seul) — les deux surfaces du mécanisme des supports portent enfin la même règle.

## Ce qui n'a PAS bougé, délibérément

`suppliersForDropshipType` (inchangée — elle protège `pod_brand` contre un
`catalog_product_id` CJ forgé dans `pod_designs`) · `CATALOG_SUBTYPES` ·
`shared.tsx:358` · `showsVisitorCatalogSearch` (volontairement aveugle au mode).

## Mutations — 19 lancées, **19 tuées**

Autorité (4) · routes catalogue (3) · `fetchProduct` (4, dont l'isolation
inter-locataires) · sitemap (2) · Aurora (1) · `mockupsToProducts` (1) ·
`pod/catalog` (1) · éligibilité fournisseur (1) · **thèse réfutée `pod_brand → []`
(1)** · UI `pod_custom` (1).

**Aucune mutation comptée sur un crash de harnais.** C19 a d'abord survécu ;
elle a été tuée en verrouillant la condition de rendu réelle, pas par un test
de façade. Une mutation restée appliquée après un dépassement de délai
(`pod/catalog`) a été détectée par la suite et restaurée.

## Impact production — mesuré, lecture seule

**Nul.** Les 73 sélections existantes sont **toutes** sur des sites `reseller`
(19 approuvées, 54 non approuvées) : aucun site ne perd une URL de sitemap ni
une fiche produit. Les 3 sites sans sous-type sont **intacts** (`updated_at` de
juillet).

## Découvertes nouvelles — consignées, non corrigées

**DEBT-057** 🟠 `/api/catalog/variants` : aucune admission d'aucune sorte, proxy
non authentifié vers l'API fournisseur avec nos identifiants — **DÉCISION
REQUISE**, LOT 2 s'est arrêté là volontairement.
**DEBT-058** 🟡 les cartes produit `pod_brand` pointent vers une page qui répond
404 → **LOT 3**.
**DEBT-059** 🟡 `pod_designs` est écrivable par le marchand via PostgREST ;
trois gardes tiennent et sont désormais testées → **LOT 3**.

DEBT-055 reste **LOT 3**, DEBT-054 reste **LOT 6** : ni l'un ni l'autre n'a été
touché. `chat/route.ts` n'a pas été modifié — l'auto-curation d'un `pod_brand`
reçoit désormais un 400 non bloquant, exactement comme la contre-vérification
l'avait prédit.


---

# LOT 3 — `pod_brand` — RÉSOLU (2026-08-25)

## La reconstruction a précédé le code, et elle a tout décidé

Trois faits, tous mesurés au code avant la moindre modification :

1. **L'identité d'un design existe déjà : `design_url`.** Elle est capturée à la
   création de la tâche (`pending_task_keys`), portée par chaque maquette,
   résolue au checkout et transmise au fournisseur. Aucune autorité à créer.
2. **L'index 0 est un accident, pas une intention.** `mockups` et
   `selected_products` sont stockés **sur chaque design**, et la vitrine les
   parcourt tous. Seuls la génération et le checkout s'y étaient repliés.
3. **La variante normative est `catalog_products.id`.** `printful-adapter`
   envoie `Number(order.supplier_product_id)` et **n'utilise jamais**
   `order.variant_id` ; `gelato-adapter` envoie `productUid`. Seul CJ consomme
   `variant_id` — d'où l'existence d'un suffixe qui appartient au monde
   `reseller`.

## Les défauts, et ce qui les ferme

| ID | Sév. | Fermé par | Mutations |
|---|---|---|---|
| **L3-01** variante du visiteur ignorée *(DEBT-060)* | 🔴 | id sans suffixe + retrait du sélecteur impossible à honorer | Q1, Q2 |
| **L3-02/03/07** convention `pod_designs[0]` *(DEBT-061)* | 🟠 | checkout parcourt tous les designs · vitrine déduplique · design actif explicite | Q3, Q9 |
| **L3-04** design non lié au locataire | 🟠 | `design_url` doit être sous `pod-designs/<slug>/`, sinon aucun design + anomalie | Q12 |
| **L3-05** prix affiché ≠ prix vendu | 🟡 | `loadPodBrandCatalogPrices` relit prix/devise en base | Q4, Q6 |
| **L3-06** filtre fournisseur de `pod-fulfill` | 🟡 | harnais rendu fidèle + 3 tests | Q10 |
| **DEBT-055** | 🟡 | `usesCatalogSelections` (autorité LOT 2) | Q11 |
| **DEBT-058** | 🟡 | plus de `href` vers un 404, prouvé au rendu | Q7, Q8 |

**12 mutations lancées, 12 tuées. Aucune sur un crash de harnais.** Q8 a
d'abord survécu : elle a été tuée par un **rendu réel**, jamais masquée.

## Ce qui n'a pas bougé, délibérément

`suppliersForDropshipType` (`pod_brand` garde Printful + Gelato — la thèse
inverse du LOT 2 était fausse) · `CATALOG_SUBTYPES` · `usesCatalogSelections`
(consommée, jamais dupliquée) · `shared.tsx:358` · le filtre fournisseur de
`pod-fulfill`, qui répond à « quels fournisseurs ce **moteur** sait exécuter »
— d'où `printify`, absent de l'autre liste. Deux questions, deux listes.

## Production — lecture seule, aucune écriture

Simulation de la chaîne corrigée sur les données réelles : les 3 produits
gardent leur identité, **les prix sont identiques** (le JSON concordait avec la
base — aucune falsification en production), la variante livrée devient celle du
catalogue, et le `design_url` réel **respecte** le préfixe du site. `updated_at`
inchangé (juillet). 0 commande.

**Changement visible assumé** : le sélecteur de taille disparaît de ce site.
Ce n'est pas une perte de capacité — c'est le retrait d'un choix que la chaîne
ne pouvait pas honorer.

## Risques résiduels — documentés, non masqués

1. Une maquette pointant un produit **CJ** s'affiche encore : `shared.tsx` est
   dans le bundle client (`NoirTheme`, `StorefrontDense` portent `'use client'`)
   et ne peut ni importer `suppliersForDropshipType` (`server-only`) ni en
   recopier la liste. Elle reste **inachetable** — 409 au checkout, garde testée.
2. Une table équivalente à `design_uploads` pour `pod_brand` (liaison forte,
   usage unique) exige du **DDL** : décision d'architecture distincte.
3. La politique d'**écriture** du bucket `pod-designs` n'est pas versionnée et
   n'a pas été sondée — la sonder exigerait une écriture en production.

## Hors périmètre — non traité

**DEBT-057** (`/api/catalog/variants` sans admission) reste **LOT 2**, non
rouvert : `pod_brand` ne l'atteint pas (`mockupsToProducts` ne renseigne ni
`supplierId` ni `supplierProductId`, donc `MerchantProductModal` ne l'appelle
jamais pour lui). **DEBT-054** reste **LOT 6**. Aucune découverte n'appartenait
à `reseller` ni à `pod_custom`.


---

# LOT 3 — SECONDE PASSE, APRÈS CONTRE-VÉRIFICATION (2026-08-25)

La contre-vérification adversariale a **falsifié le verdict 🟢** de la première
passe. Deux anomalies, toutes deux dans la chaîne `pod_brand`, corrigées en une
seule passe.

## DEBT-062 🔴 — vitrine ≠ checkout, encore

La première passe avait aligné l'**ordre** de parcours des designs. Ce n'était
pas l'ordre : ce sont les **filtres**. La vitrine en applique deux que le
checkout n'avait pas.

**Démontré par exécution du module réel**, pas par lecture :

```
designs[0] : maquette de cp-X, design_url = ANCIENNE  (périmée)
designs[1] : maquette de cp-X, design_url = celle du design (fraîche)

vitrine  -> https://img/b.png          (design B)
checkout -> .../pod-designs/…/ANCIEN.png   (design A)
```

**Cause profonde : deux implémentations de la même règle métier.** Corriger
l'une sans l'autre reproduit le défaut — c'est littéralement ce qui venait
d'arriver. La règle est donc **écrite une fois**, dans
`src/lib/mode3/podBrandMockups.ts`, et consommée par les deux couches.
Alignement **par construction**.

Ce n'est pas une autorité nouvelle : ni `subtypeAdmission`, ni
`CATALOG_SUBTYPES`, ni `suppliersForDropshipType`, ni `usesCatalogSelections`,
ni `showsVisitorCatalogSearch` ne répond à « quelle maquette est vendable ».

## DEBT-063 🟠 — la liaison locataire n'était posée qu'au point de vente

`generate-mockups` envoie `designs[0].url` — écrit par le marchand en PostgREST
— comme `image_url` d'un `create-task` Printful **facturé**. La garde y est
désormais posée **avant toute dépense**, avec la **même unique** définition du
format. Le design actif est **nommé** : `index` est un index de **produit**,
jamais de design — vérifié dans le contrat de l'appelant avant modification.

## Mutations — 11 lancées, 11 tuées

R1–R4 (les trois filtres + l'ordre) · R5 (le checkout reprend sa propre
sélection) · R6–R7 (la règle de préfixe) · R8–R10 (les deux gardes locataires)
· **R11 (quel design la route génère)**, qui avait d'abord **survécu** et n'a
pas été masquée : elle est tuée par une observable réelle — la route ne se
rabat jamais sur un autre design.

## Contre-vérification indépendante

Sonde exécutée **hors dépôt**, important les modules réels : scénario
falsificateur + 4 variantes (périmé en `[0]`, périmé en `[1]`, tout périmé,
trois designs en correspondance 1:1, maquette sans `catalog_product_id`) —
vitrine et checkout concordent dans tous les cas.

## Production — aucune écriture

Empreinte `pod_designs` **identique** avant/après (`2cc8f941c571615d`),
`updated_at` inchangé. Design et 3 maquettes **conformes au préfixe** : la
nouvelle garde ne casse pas le seul site réel.
