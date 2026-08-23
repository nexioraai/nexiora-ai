# PLAN D'IMPLÉMENTATION — SÉPARATION MODE 2 / MODE 3

> **DOCUMENT DE RÉFÉRENCE OFFICIEL.** Source de vérité du chantier.
> Aucune décision d'architecture ne se prend hors de ce document.
> Toute découverte imposant de le modifier ⇒ **STOP + rapport + validation** (§13).

| | |
|---|---|
| SHA de référence à l'ouverture | `13bec0e` (branche `fix/xss-jsonld`, local, non poussé) |
| Base distante | `origin/main` = `0aed2c4` |
| État global | **PLAN — aucune phase démarrée** |
| Hors périmètre | M2-08 (modèle Stripe) · fournisseurs Mode 3 (reseller/CJ, pod_brand, pod_custom) |

---

## 1. OBJECTIF GLOBAL

Rendre **structurellement impossible** qu'une modification confinée à un mode altère
silencieusement l'autre.

Formulation opérationnelle, en deux propriétés :

- **P-A** — une modification Mode 2 ne peut pas modifier silencieusement Mode 3 ;
- **P-B** — une modification Mode 3 ne peut pas modifier silencieusement Mode 2 ;
- **P-C** — une modification d'une responsabilité **SHARED** est **explicitement détectable**.

« Silencieusement » est le mot décisif : on n'interdit pas de se tromper, on interdit
de se tromper **sans que rien ne le signale**.

### Classement des risques (objectif : A ou B, jamais C)

| Classe | Signification |
|---|---|
| **A** | structurellement impossible |
| **B** | possible à écrire, **impossible à fusionner** sans faire échouer un contrôle |
| **C** | possible silencieusement — **inacceptable** |

---

## 2. ARCHITECTURE CIBLE VALIDÉE

```
SHARED / CORE        (aucun branchement `mode`, aucune dépendance fournisseur,
                      aucune signature recevant un site ou une commande complète)
      ▲                                        ▲
      │ autorisé                               │ autorisé
┌─────┴───────────────┐          ┌─────────────┴──────────────────────┐
│ MODE 2  (à créer)   │          │ MODE 3  (existe — 27 fichiers)     │
│ checkoutPolicy      │          │ onOrderPaid → dispatch sous-type   │
│ shipping (forfait)  │          │ cj/ · suppliers/ · dropship/       │
│ onOrderPaid         │          │ fulfillment/ · catalog-stock       │
│ chargeModel         │          │                                    │
│ ⊘ cj/ suppliers/    │          │ ⊘ mode2/                           │
│ ⊘ dropship/ mode3/  │          │                                    │
└─────────────────────┘          └────────────────────────────────────┘
      ▲                                        ▲
      └──── AIGUILLAGE : switch(order.fulfillment_domain) ────┘
            handlePaidCheckout · checkout/route · cancel-order
            LOOKUP, jamais une décision
```

### Chaîne de vérité

```
sites.mode ──(lu UNE FOIS, au checkout)──▶ shop_orders.fulfillment_domain ──▶ aiguillage ──▶ domaine
   site                                          commande                        exécution
```

**Après création de la commande, le fulfillment n'a PLUS le droit de consulter
`sites.mode`.** Imposé par le test **A9** et par la suppression du chemin de secours
après le `SET NOT NULL`.

### Trois concepts, trois axes distincts

| | `sites.mode` | `fulfillment_domain` | `dropship_type` |
|---|---|---|---|
| Qualifie | un **site** | une **commande** | un **site** |
| Répond à | quelle identité ? | **qui exécute cette vente ?** | quel fournisseur, dans le domaine fournisseur ? |
| Valeurs | 1 / 2 / 3 | `merchant` / `supplier` | reseller / pod_brand / pod_custom / NULL |
| Lisible par | onboarding · UI · admin · **le checkout, une seule fois** | l'aiguillage et les gardes de domaine | **`mode3/` uniquement** |
| Après création | **interdit au fulfillment** | seule source de vérité | **jamais lu par une garde de domaine** |

> `fulfillment_domain = 'supplier'` **ne dit rien du contenu du panier**. Un site Mode 3
> vendant uniquement ses `shop_products` produit une commande `'supplier'` dont aucune
> ligne ne part chez un fournisseur — et c'est correct : le domaine qualifie le **chemin
> d'exécution**, pas la composition des lignes.

---

## 3. FRONTIÈRES MODE 2 / MODE 3

### Les cinq vecteurs de fusion (mesurés par graphe d'imports)

| # | Fichier | Preuve du couplage | Cible |
|---|---|---|---|
| **F1** | `src/lib/shop/handlePaidCheckout.ts` | importe `cj/fulfill` **et** `suppliers/pod-fulfill` (:3-4) | SHARED dépollué + aiguillage |
| **F2** | `src/app/api/shop/checkout/route.ts` | 7 branchements sur `mode` + `suppliersForDropshipType` (:12) | route mince + 2 politiques |
| **F3** | `src/lib/shop/quote/resolveShipping.ts` | importe `cj/client`, `cj/shipping-tiers`, `suppliers/registry` (:4-7) | SHARED (cache/hash) + `mode3/shipping` |
| **F4** | `src/app/api/shop/cancel-order/route.ts` | importe `cjCancelOrder` (:3) | SHARED + délégation `mode3/` |
| **F5** | `src/lib/catalog-stock.ts` | importe `suppliers/registry` (:3) | **MODE 3 en entier** |

### Domaine Mode 3 — déjà isolé, aucun déplacement

27 fichiers : `src/lib/cj/` · `src/lib/suppliers/` · `src/lib/dropship/` · `src/lib/fulfillment/`.
Imports sortants hors domaine, **mesurés exhaustivement** : `@/lib/anomaly`,
`@/lib/http/fetchWithTimeout`, `@/lib/supabase-admin`, `crypto`, `fs`, `path`.
**Zéro arête vers Mode 2.**

---

## 4. RESPONSABILITÉS SHARED

### Règle d'admission — R1 à R4

Un composant peut aller dans SHARED **si et seulement si** :

- **R1** — il ne branche sur aucun `mode` ni `dropship_type` ;
- **R2** — il n'importe aucun module fournisseur ;
- **R3** — sa signature ne reçoit **ni un site ni une commande complète** — primitives ou DTO étroits uniquement ;
- **R4** — son contrat peut être énoncé **sans prononcer** « mode », « fournisseur » ou un nom de sous-type.

> **R3 est la règle décisive** : un composant ne peut pas brancher sur une information
> qu'il ne reçoit jamais. La protection vient d'une **privation d'information**, pas d'une
> convention. Mesuré : aucun composant SHARED ne reçoit `site.mode` ni `dropship_type`.

### Classement des responsabilités

| Responsabilité | Classe | Reste SHARED ? | Canal corrélé au mode |
|---|---|---|---|
| Stock (`decrementStock`, `checkStock`) | **A — critique deux modes** | ✅ | `id` préfixé `catalog-` |
| Anomalies (`logAnomaly`) | **A** | ✅ | `type` (`cj_*` ⇒ Mode 3) |
| Paiement (`payments/stripe.ts`) | **A** | ✅ | `applicationFeeAmount` (0 en Mode 2) |
| Order state (`orderStatusMachine`) | **A** | ✅ | *aucun* |
| Pricing | **B — faible risque** | ✅ | `cj_margin_percent` (inerte en Mode 2) |
| E-mail acheteur | **B** | ✅ | *aucun* |
| Utilitaires (`basketHash`, `checkoutSignature`, `buyerNonce`) | **B** | ✅ | *aucun* |
| Persistance (`supabase-admin`, `supabase`) | **B** | ✅ | *aucun* |
| **Checkout** | **C — ne doit PAS être SHARED** | ❌ | *7 branchements = la fusion elle-même* |

### Les 5 canaux corrélés — surface exhaustive du risque résiduel

1. `decrementStock` / `checkStock` ← préfixe `catalog-`
2. `logAnomaly` ← `type`
3. `createCheckout` ← `applicationFeeAmount`
4. `sitePricing` ← `cj_margin_percent`
5. *(aucun autre — `orderStatusMachine`, `basketHash`, `checkoutSignature`, e-mail sont neutres)*

Chacun exige un **test de contrat à deux formes de données** (phase 7). Sans eux, ces
canaux sont en **classe C**.

### Dépendance implicite signalée, non masquée

`shop_orders` porte **4 colonnes CJ** (`cj_pay_status`, `cj_pay_attempts`,
`cj_pay_locked_at`, `cj_order_id`) dont une `NOT NULL DEFAULT 'pending'` : **toute**
commande de la plateforme naît inscrite dans la machine à états CJ. C'est pourquoi le
cron de réconciliation est un point d'entrée indépendant du checkout.
POD ne contamine rien (6 tables dédiées) — **le motif cible existe déjà dans le dépôt**.
**Dette nommée, hors périmètre de ce plan.**

---

## 5. INVARIANTS

| # | Invariant | Garantie |
|---|---|---|
| **I1** | Une commande `merchant` n'entre dans aucun workflow fournisseur | aiguillage + gardes (A6) |
| **I2** | Une commande `supplier` n'entre pas dans le fulfillment marchand | aiguillage (A6) |
| **I3** | `fulfillment_domain` est écrit **une seule fois**, à la création | INSERT unique + trigger DB |
| **I4** | `fulfillment_domain` est **immuable** | **trigger `BEFORE UPDATE OF`** — lie `service_role` |
| **I5** | Aucun moteur ne redétermine le domaine depuis `sites.mode` | A9 + suppression du secours |
| **I6** | `dropship_type` n'est lu que dans `mode3/` | A3 |
| **I7** | Le stock marchand n'est décrémenté que pour les lignes marchandes | `shop.ts:166` (déjà garanti) |
| **I8** | Aucune commission hors Mode 3 | `checkout:500-503` (déjà garanti, M2-01) |
| **I9** | Une commande encaissée est toujours exécutable par quelqu'un | garde d'admission au checkout |
| **I10** | Aucun SHARED ne reçoit ni ne branche sur le mode | A3 + A4 |

---

## 6. ORDRE DES PHASES

> **L'ordre est immuable.** Une phase ne démarre que si la précédente est VALIDÉE.

### PHASE 0 — Préparation / état initial
**Objectif** : figer l'état de départ et installer le filet **avant** toute modification.
**Modifié** : `src/lib/architecture/domainRegistry.ts` (entrées) · nouveaux fichiers de test · ce document.
**Strictement inchangé** : **tout le code produit**.
**Tests** : A1-A5, A9 + **A10** (fixtures propre/violante).
**Preuve de sortie** : suite complète verte ; A10 démontre que chaque règle détecte réellement son motif ; delta de comptage de tests conforme.
**Risque Mode 3** : nul. **Risque Mode 2** : nul.

### PHASE 1 — Fondation de la séparation
**Objectif** : créer le module de décision de domaine (`mode` seul, **jamais** `dropship_type`).
**Modifié** : `src/lib/order-domain/` (neuf).
**Inchangé** : tout le reste.
**Preuve** : tests unitaires du résolveur ; A3 vert.

### PHASE 2 — `fulfillment_domain`
**Objectif** : capturer le domaine sur la commande, de façon immuable.
**Séquence expand/contract, en 4 temps** :
1. colonne **nullable**, sans défaut ;
2. le checkout l'écrit à chaque création ;
3. **backfill** — *conditionné au résultat de la mesure §12* ;
4. `SET NOT NULL` + `CHECK IN ('merchant','supplier')` + **trigger d'immutabilité**.

**Fenêtre (1→3)** : `NULL` ⇒ secours depuis `sites.mode` **+ anomalie `order_domain_missing`**. Jamais silencieux. **Ce chemin est SUPPRIMÉ à l'étape 4** — sa persistance rouvrirait le recalcul.
**Preuve** : A8, A11 ; `AMBIGU = 0` avant l'étape 4.
**Risque Mode 3** : faible (colonne additive). **Bloquant** : mesure §12.

### PHASE 3 — Séparation et protection du fulfillment
**Objectif** : fermer les fuites mesurées.
**Modifié** : garde de domaine en tête de `cj/fulfill.ts` et `suppliers/pod-fulfill.ts` ; aiguillage dans `handlePaidCheckout` (F1).
**Inchangé** : **toute la logique interne Mode 3** — `suppliers.ts`, adaptateurs, granularité Printful/Gelato, retries, réconciliation, crons.
**Preuve** : Mode 2 → 0 appel CJ / Printful / Gelato ; **7 cas Mode 3 inchangés** ; **hash du corps de chaque fonction déplacée identique avant/après**.

### PHASE 4 — Traitement Mode 2
**Objectif** : créer le domaine Mode 2 (code neuf) et scinder F2.
**Modifié** : `src/lib/mode2/*` (neuf) · `checkout/route.ts` (F2) · politiques de domaine.
**Inchangé** : mécanisme Stripe, écriture de commande, machine à états.
**Preuve** *(critère clarifié avant le démarrage de la phase — voir journal)* :
**`checkout/route.ts` ne doit contenir AUCUN branchement métier basé directement sur
`site.mode`.** Une seule conversion `site.mode → fulfillment_domain` reste autorisée, au
point établi en phase 2. Vérifiable : `grep "site.mode === "` → **0** ;
`grep "site.mode"` → uniquement les lignes de la conversion.
Plus : **caractérisation checkout inchangée** (37 + 59 tests).

### PHASE 5 — Protection des responsabilités SHARED
**Objectif** : scinder F3, F4, F5 ; verrouiller R1-R4.
**Modifié** : `resolveShipping` · `cancel-order` · `catalog-stock`.
**Inchangé** : cache de devis, hash de panier, budget d'appels, transition atomique d'annulation, remboursement.
**Preuve** : A1, A2, A4 verts ; devis Mode 3 identiques.

### PHASE 6 — Tests de frontière Mode 2 / Mode 3
**Objectif** : A6, A7 — contrats comportementaux.
**Preuve** : commande `merchant` → aucun adaptateur appelé ; les 7 cas Mode 3 identiques au banc de référence.

### PHASE 7 — Surveillance et non-régression SHARED
**Objectif** : tests de contrat à **deux formes de données** sur les **5 canaux** (§4).
**Preuve** : chaque canal exercé sous forme Mode 2 **et** Mode 3. **Fait passer le dernier vecteur de classe C à B.**

### PHASE 8 — Validation finale Mode 2
Parcours complet : checkout → Stripe → webhook → commande → post-paiement → stock → livraison → annulation/remboursement. Aucune dépendance fournisseur sur aucun maillon.

### PHASE 9 — Validation de non-régression Mode 3
Rejeu du banc 12 cas × comparaison à `origin/main`. Les 7 comportements protégés (§10) strictement identiques.

---

## 7. SURVEILLANCE — MÉCANISMES EXISTANTS

> **Aucun système parallèle n'est créé.** Tout s'appuie sur l'existant.

| Mécanisme | Emplacement | État |
|---|---|---|
| Anomalies runtime | `src/lib/anomaly.ts` → table `checkout_anomalies` (insertion **inconditionnelle**, :60-66) | ✅ existe |
| E-mail d'alerte | `anomaly.ts:88-101` (Resend) ; anti-spam 1 h ; `ALWAYS_EMAIL_TYPES` le contourne | ✅ existe |
| Admin — anomalies | `/api/admin/stats:34` (`select('*') limit 100`) | ✅ existe |
| **Frontières de domaine** | `domainRegistry.ts` + `checkDomainBoundaries.ts` + `domainBoundaries.test.ts` (`describe.each`) | ✅ existe, **générique** |
| **Test des tests** | `extensibilityProof.test.ts` + fixtures `fakeDomainClean` / `fakeDomainViolating` | ✅ existe, **éprouvé** |
| **Santé système par domaine** | `systemHealth/buildHealthReport.ts` — attribue un échec à un domaine via le gabarit `Frontière de domaine : '<id>'`. **Tout domaine enregistré y apparaît automatiquement** | ✅ existe |
| État global | `computeGlobalState.ts` → `ok` / `warning` / `problem` (+ détection de péremption) | ✅ existe |
| Publication | `postHealthReport.ts` → `system_health_checks` | ✅ existe |
| CI → Admin | `.github/workflows/ci.yml:93` → `scripts/report-system-health.ts` | ✅ **déjà câblé** |
| Admin — santé | `/admin/system-health` + `/api/admin/system-health` | ✅ existe |
| Suivi des crons | `cron-tracker.ts` (`startCronRun` / `finishCronRun`) | ✅ existe |

### Conséquence

**Déclarer `mode-2`, `mode-3` et `shared` comme domaines dans `DOMAIN_REGISTRY` suffit
à obtenir automatiquement** : les tests de frontière, l'attribution par domaine dans le
rapport de santé, et l'affichage dans `/admin/system-health`. **Aucun code de monitoring
à écrire.**

### Écarts à combler — signalés comme « À IMPLÉMENTER »

| # | Écart | Solution minimale |
|---|---|---|
| **M-1** | Une violation de frontière (CI) est **visible dans l'admin mais n'envoie pas d'e-mail** | émettre un `logAnomaly` depuis `report-system-health.ts` quand `domains[].status === 'failure'` — réutilise le canal e-mail existant, **aucun système nouveau** |
| **M-2** | `logAnomaly` **n'a pas de champ domaine** — une anomalie runtime n'est pas attribuable à MODE 2 / MODE 3 / SHARED | ajouter `domain` dans le `details` **jsonb déjà existant** — **zéro migration**, exploitable immédiatement par `/api/admin/stats` |
| **M-3** | Aucune anomalie sur le chemin fail-closed de la garde (échec de lecture, site introuvable) | `logAnomaly` `severity: 'info'`, aligné sur `cj_freight_unavailable` (`fulfill.ts:651-656`) |

---

## 8. MATRICE DE SURVEILLANCE

| Domaine | Contrôle | Détection | Admin | Email | Test | Criticité |
|---|---|---|---|---|---|---|
| **Mode 2** | aucun fulfillment fournisseur | A6 (contrat) | `/admin/system-health` | M-1 *(à impl.)* | A6 | **critique** |
| Mode 2 | domaine de la commande correct | A8 + `CHECK` | stats | M-2 *(à impl.)* | A8 | critique |
| Mode 2 | paiement — `application_fee = 0` | tests checkout | — | — | existant | critique |
| Mode 2 | état de commande | trigger `trg_enforce_shop_order_status_transition` | — | — | existant (6) | critique |
| Mode 2 | aucun fournisseur résolu | A1 (imports) | system-health | M-1 | A1 | **critique** |
| **Mode 3** | fulfillment inchangé (7 cas) | A7 (contrat) | system-health | M-1 | A7 | **critique** |
| Mode 3 | résolution fournisseur | tests existants (68+20) | — | `ALWAYS_EMAIL_TYPES` | existant | critique |
| Mode 3 | sous-types | tests existants (17+20) | — | — | existant | élevée |
| Mode 3 | checkout | caractérisation (37+53) | — | — | existant | critique |
| Mode 3 | commande / réconciliation | crons + `cron-tracker` | stats | oui | existant | critique |
| **SHARED** | R1 — aucun branchement `mode` | A3 | system-health | M-1 | A3 | **critique** |
| **SHARED** | R3 — aucune signature large | A4 | system-health | M-1 | A4 | **critique** |
| **SHARED** | 5 canaux corrélés | tests de contrat 2 formes | system-health | M-1 | **phase 7** | **critique** |
| **SHARED** | anti-rechute `sites.mode` | **A9** | system-health | M-1 | A9 | **critique** |
| **SHARED** | les tests détectent réellement | **A10** | system-health | M-1 | A10 | **critique** |
| **SHARED** | immutabilité du domaine | trigger DB + A11 | — | — | A11 | **critique** |

---

## 9. TESTS D'ARCHITECTURE

| # | Violation détectée | Échoue comment | Où |
|---|---|---|---|
| **A1** | `mode2/` importe `cj/`, `suppliers/`, `dropship/`, `mode3/` | violation fichier:ligne:raison | CI |
| **A2** | `mode3/` importe `mode2/` | idem | CI |
| **A3** | un SHARED contient `site.mode` / `dropship_type` | idem | CI |
| **A4** | une signature SHARED accepte un site ou une commande complète | idem | CI |
| **A5** | un fichier autre que l'aiguillage importe un module de domaine | idem | CI |
| **A6** | commande `merchant` atteint un adaptateur fournisseur | mock appelé → assertion | contrat |
| **A7** | un des 7 cas Mode 3 change | comparaison vids / statuts / anomalies | contrat |
| **A8** | commande sans domaine acceptée en silence | absence de `order_domain_missing` | contrat |
| **A9** | un moteur relit `sites.mode` | motif `select(...mode...)` | CI — **anti-rechute** |
| **A10** | A1-A5 / A9 ne détectent plus rien | fixture violante non détectée | CI — **teste les tests** |
| **A11** | un `UPDATE` touche `fulfillment_domain` | exception DB + assertion | contrat |

> **Quel test détecte une rechute du problème corrigé ?**
> **A9** (cause racine : un moteur qui redécide depuis `sites.mode`) ·
> **A3** (variante déjà commise : une garde consultant `dropship_type`) ·
> **A5/A6** (manifestation : un appel fournisseur atteint depuis `merchant`).
> **A10** garantit que ces trois-là ne deviennent jamais verts à tort.

---

## 10. ZONE PROTÉGÉE — MODE 3

Comportements dont l'invariance doit être **prouvée** à chaque phase :

| # | Comportement | Tests existants |
|---|---|---|
| 1 | reseller → CJ, produits et statut | 68 (`cj/fulfill`) |
| 2 | **`dropship_type = NULL` → CJ** (3 sites, 12 des 26 commandes, `cj_order_id` réels) | mesuré |
| 3 | pod_brand → POD, design marchand imposé | 20 + 17 |
| 4 | pod_custom → POD, design visiteur validé | 20 + 17 |
| 5 | Commande **mixte** : seule la ligne mappée part chez CJ, stock marchand décrémenté | mesuré |
| 6 | Verrou, retries, réconciliation, réentrée terminale | 68 + 10 + 20 |
| 7 | Curation, devis obligatoire, commission | 53 + 37 + 16 |

**Preuve formelle de non-régression** : soit `G ≡ (fulfillment_domain === 'supplier')`.
Pour toute commande Mode 3, `G` est vraie **par construction de la donnée** ; une garde
`if (!G) sortir` laisse le chemin Mode 3 **strictement identique**.
**Empirique : 7 cas sur 7 inchangés.**

**Contre-exemple à ne jamais répéter** :
`mode === 3 && suppliersForDropshipType(...).includes('cj')` casse `pod_brand` et
`pod_custom` — **mesuré**. Ce n'est pas une garde de domaine : elle consulte le sous-type.
**Aucune garde de ce plan ne lit `dropship_type`.**

---

## 11. FAIL-SAFE

| Situation | Comportement | Fail |
|---|---|---|
| Domaine absent (fenêtre de migration) | secours `sites.mode` + **anomalie** | fail-safe **observable** |
| Domaine absent (après contrainte) | impossible | — |
| Domaine invalide | aucun appel fournisseur, aucun état terminal, **anomalie** | fail-closed **observable** |
| Site introuvable | aucune écriture, **anomalie** | fail-closed **observable** |
| Lecture DB échouée | aucune écriture, commande reste `pending`, cron reprend, **anomalie `info`** | fail-closed **observable** |
| Fournisseur inconnu | `getSupplier` → `undefined`, aucun appel | fail-closed |
| Admission checkout, domaine indéterminable | **refus** | fail-closed |

### Fail-safe de la surveillance elle-même

| Panne | Conséquence | Perte d'alerte ? |
|---|---|---|
| `logAnomaly` — insert échoue | `catch` + `console.error` (`anomaly.ts:67-69`) | ⚠️ **oui** — trace serveur uniquement |
| E-mail échoue | `catch` (`:105-107`) — **la ligne est déjà insérée** (insert **avant** l'e-mail) | ❌ non — visible en admin |
| Admin ne peut pas afficher | la ligne existe en base | ❌ non |
| `report-system-health` échoue | CI reste **rouge** (la suite a déjà échoué) | ❌ non — le signal primaire est l'échec CI |
| `system_health_checks` absente | `computeGlobalState` → `warning` (`tableMissing`) | ❌ non |
| Rapport périmé | `computeGlobalState` → `warning` (`isStale`) | ❌ non |

> **Seul trou identifié** : un échec d'insertion de `logAnomaly` est avalé. C'est le
> comportement voulu (ne jamais casser un checkout pour un problème de télémétrie), et il
> laisse une trace serveur. **Signalé, non corrigé — hors périmètre.**

---

## 12. MESURE BLOQUANTE — commandes historiques

**PHASE 2 étape 3 ne peut pas démarrer sans ce résultat.** À exécuter dans Supabase.

```sql
select
  (select count(*) from shop_orders)                                        as total_DENOMINATEUR,
  count(*) filter (where preuve = 'intrinseque_supplier')                   as certain_supplier_par_preuve_propre,
  count(*) filter (where preuve = 'derive_site_mode3')                      as derive_du_site_mode3,
  count(*) filter (where preuve = 'derive_site_hors_mode3')                 as derive_du_site_hors_mode3,
  count(*) filter (where preuve = 'AMBIGU')                                 as AMBIGU_a_refuser,
  coalesce(string_agg(distinct statut, ', ') filter (where preuve <> 'intrinseque_supplier'), '-')
                                                                            as statuts_des_commandes_derivees
from (
  select
    o.id,
    o.status || '/' || o.cj_pay_status as statut,
    case
      when o.cj_order_id is not null then 'intrinseque_supplier'
      when exists (select 1 from provider_submissions ps where ps.order_id = o.id) then 'intrinseque_supplier'
      when exists (select 1 from shop_order_items i
                    where i.order_id = o.id and i.product_id like 'catalog-%') then 'intrinseque_supplier'
      when s.id is null then 'AMBIGU'
      when s.mode = 3 then 'derive_site_mode3'
      else 'derive_site_hors_mode3'
    end as preuve
  from shop_orders o
  left join sites s on s.id = o.site_id
) t;
```

**Règle de lecture, fixée à l'avance** :
- `AMBIGU_a_refuser > 0` ⇒ ces lignes restent `NULL`, `SET NOT NULL` **repoussé**, arbitrage manuel.
- Une commande **dérivée** dans un état **non terminal** ⇒ revue individuelle, **jamais** de dérivation.
- **Jamais de règle « si doute → merchant/supplier ».**

> ⚠️ La dérivation depuis `sites.mode` n'est fiable que si le mode du site n'a jamais
> changé. Les protections qui le garantissent (denylist + retrait du GRANT) sont
> **récentes (LOT G)** : une commande antérieure y échappe.
> **🔵 INFÉRÉ, non prouvable rétrospectivement — la base ne conserve aucun historique de `sites.mode`.**

---

## 13. RÈGLES DE CONDUITE

### Checkpoint obligatoire après CHAQUE phase
1. tests · 2. `tsc --noEmit` · 3. `next build` si pertinent · 4. vérification des imports ·
5. vérification des frontières (A1-A5, A9, A10) · 6. vérification Mode 2 · 7. vérification Mode 3 ·
8. vérification SHARED si concerné · 9. vérification monitoring · 10. **mise à jour de ce document**.

Puis seulement : `PHASE N — VALIDÉE`.

### Critère d'arrêt
Si une phase échoue : **STOP**. Ne pas passer à la suivante. Ne pas contourner.
Ne jamais supprimer une assertion ni modifier une fixture pour faire passer la suite.

### Découverte imposant un changement de plan
1. **STOP** de la phase · 2. documenter · 3. expliquer l'impact · 4. proposer la
modification · 5. **attendre validation**. **Aucune improvisation d'architecture en cours
d'implémentation.**

### Non-régression — à établir avant chaque modification importante
- **MODE 2** → ce qui peut changer
- **MODE 3** → ce qui ne doit pas changer *(§10)*
- **SHARED** → ce qui peut changer
- **SHARED** → ce qui ne doit absolument pas changer *(R1-R4, les 5 canaux)*

Après modification : **PROUVER**, jamais affirmer. Outils : hash des corps de fonctions
déplacées · banc 12 cas avant/après · comptage de tests.

---

## 14. ÉTAT D'AVANCEMENT

| Phase | État | SHA | Fichiers | Tests | Résultat | Prochaine |
|---|---|---|---|---|---|---|
| 0 — Préparation | ✅ **VALIDÉE** | `13bec0e` (non committé) | `domainRegistry.ts` (+161, **0 suppression**) · `__tests__/mode2Mode3Boundaries.test.ts` (neuf) · `__tests__/fixtures/mode2Mode3Violating.ts` (neuf) | **1112 → 1129** (+17) · 110 fichiers · `tsc` 0 · `next build` 0 · `diff --check` clean | 2 domaines déclarés · 7 règles · 5 mutations sur 6 attrapées | **Phase 1** |
| 1 — Fondation | ✅ **VALIDÉE** | `8665dc8` → *(checkpoint phase 1)* | `order-domain/resolve.ts` (neuf) · `order-domain/__tests__/resolve.test.ts` (neuf) · `domainRegistry.ts` (+1 domaine) · `vitest.config.ts` (+1 ligne d'inclusion) | **1129 → 1159** (+30) · 111 fichiers · `tsc` 0 · `next build` 0 · `diff --check` clean | résolveur total, fail-closed, 2 mutations sur 2 attrapées | **Phase 2** |
| 2 — `fulfillment_domain` | ✅ **VALIDÉE** — 4 étapes exécutées et vérifiées en production | `d63e885` → *(checkpoint phase 2)* | 3 fichiers SQL (`step1_add_column`, `step2_backfill`, `step3_not_null_and_immutability`) · `checkout/route.ts` (+capture) · `checkout/__tests__/route.test.ts` (+8 tests) | **1159 → 1167** (+8) · 111 fichiers · `tsc` 0 · `next build` 0 · `diff --check` clean | mutation sur l'écriture → 4 tests en échec ✓ · **immutabilité prouvée en base** ✓ | **Phase 3** |
| 3 — Fulfillment | ✅ **VALIDÉE** | `909a746` → *(checkpoint phase 3)* | `cj/fulfill.ts` · `suppliers/pod-fulfill.ts` · `shop/handlePaidCheckout.ts` · `domainRegistry.ts` (A5+A9) · 4 fichiers de tests · 1 fixture | **1167 → 1183** (+16) · 111 fichiers · `tsc` 0 · `next build` 0 · `diff --check` clean | **5 mutations / 5 attrapées** · **7 cas Mode 3 identiques à la production** | **Phase 4** |
| 4 — Mode 2 | ✅ **VALIDÉE** | *(checkpoint phase 4)* | `order-domain/checkoutPolicy.ts` · `mode2/checkoutPolicy.ts` · `mode3/checkoutPolicy.ts` · `order-domain/__tests__/checkoutPolicy.test.ts` (neufs) · `checkout/route.ts` · `checkout/__tests__/route.test.ts` · `domainRegistry.ts` (**A1** + 2 cliquets) · `mode2Mode3Boundaries.test.ts` · `fixtures/mode2Mode3Violating.ts` | **1183 → 1279** (+96) · 112 fichiers · `tsc` 0 · `next build` 0 · `diff --check` clean | **16 mutations / 16 attrapées** · **0 branchement métier sur `site.mode`** · 6/6 domaines en contrôle positif **et** négatif · 4/4 exhaustivités gardées | **Phase 5** |
| 5 — SHARED | ⏳ EN ATTENTE | — | — | — | — | — |
| 6 — Tests de frontière | ⏳ EN ATTENTE | — | — | — | — | — |
| 7 — Contrats SHARED | ⏳ EN ATTENTE | — | — | — | — | — |
| 8 — Validation Mode 2 | ⏳ EN ATTENTE | — | — | — | — | — |
| 9 — Non-régression Mode 3 | ⏳ EN ATTENTE | — | — | — | — | — |

**Décisions verrouillées** : **D1 = 0-9** · **D2 = NON** (Mode 2 ne vend aucun produit du
catalogue fournisseur) · **D3 = B** (garde générique de domaine, aucun nom de fournisseur) ·
**D4 = ouvert, non bloquant** · **M-1 et M-2 validés**.

**Décision en attente** : **mesure §12** (classification des 26 commandes) — bloque la
**phase 2 étape 3** uniquement.

---

## 15. JOURNAL DE PHASE

### PHASE 0 — VALIDÉE

**Ce qui a été fait** : deux domaines déclarés dans `DOMAIN_REGISTRY` —
`shared-commerce-core` (11 fichiers, 7 règles) et `mode-3-supplier-domain`
(27 fichiers, 1 règle d'acyclicité) — plus les contrôles positifs et un test
d'exhaustivité. **`checkDomainBoundaries.ts` n'a pas été touché.** Aucun fichier de code
produit modifié : `domainRegistry.ts` est un registre déclaratif, et la modification est
**purement additive** (161 insertions, 0 suppression).

**Découverte n°1 — un trou réel dans ma propre règle, trouvé par contrôle de mutation.**
Le premier motif écrit était `/\bsite\.mode\b/`. Une mutation insérée dans `pricing.ts`
(`const _a = (s: any) => s.mode === 3`) **n'a pas été détectée** : le motif exigeait le nom
de variable littéral `site`. Règle réécrite autour de l'**accès** et des **voies
d'obtention**, portant les règles SHARED de 4 à 7. Résultat mesuré :

| Forme de violation | Détectée |
|---|---|
| `s.mode === 3` | ✅ |
| `q.eq('mode', 3)` | ✅ |
| `x.dropship_type` | ✅ |
| `function _e(qte: number, mode: number)` | ✅ |
| `(mode: number) => mode === 2` | ✅ |
| `(m: number) => m === 2` *(paramètre délibérément renommé)* | ❌ |

**Limite assumée et documentée** : un paramètre renommé échappe à une regex. Ce n'est pas
un vecteur d'erreur *accidentelle* — obtenir le mode exige d'abord une lecture, et **toutes
les voies de lecture non renommées sont couvertes**.

**Découverte n°2 — `ownedFiles` est une liste explicite, jamais un glob** (choix du moteur,
documenté dans son en-tête). Un fichier ajouté demain dans `src/lib/cj/` ne serait couvert
par **aucune** règle : trou silencieux. **Ajout non prévu au plan initial** : un test
d'exhaustivité compare les fichiers déclarés au contenu réel des répertoires et échoue tant
qu'un nouveau fichier n'est pas déclaré. Le moteur reste intact.

**Précision de plan — calendrier d'activation des règles.** Trois règles prévues en phase 0
ne sont **pas installables sur le SHA de départ**, pour des raisons factuelles :

| Règle | Pourquoi pas maintenant | Phase d'activation |
|---|---|---|
| **A1** — `mode2/ ↛ fournisseurs` | `mode2/` n'existe pas ; le moteur exige ≥ 1 fichier possédé | **4** |
| **A5** — seul l'aiguillage importe un domaine | l'aiguillage n'existe pas | **3** |
| **A9** — aucun moteur ne relit `sites.mode` | **`cj/fulfill.ts:321` le fait aujourd'hui** — c'est la garde M2-07 de `13bec0e`, que D3 remplace | **3** |

**Principe du cliquet, adopté en conséquence** : `ownedFiles` ne contient que les fichiers
**déjà conformes**. Chaque phase y ajoute le fichier qu'elle vient d'assainir — `handlePaidCheckout`
en phase 3, `resolveShipping` et `catalog-stock` en phase 5. Un fichier admis ne peut plus
régresser. Le registre devient ainsi la mémoire de progression du chantier.

**Décision actée** : `13bec0e` contient la garde M2-07 dans sa forme **rejetée par D3**.
Elle **n'est pas annulée** et son contenu **n'est pas modifié hors phase** ; la **phase 3**
la remplace par la garde de domaine, conformément à D3.

---

### PHASE 1 — VALIDÉE

**Ce qui a été fait** : création de `src/lib/order-domain/resolve.ts`, point de décision
unique de la frontière. Deux exports : `resolveFulfillmentDomain(siteMode: unknown)` —
**total**, ne lève jamais, `'supplier'` **si et seulement si** le mode vaut exactement 3 ;
et `isRecognisedSiteMode` — prédicat d'observabilité séparé, pour que l'appelant puisse
tracer une valeur inattendue sans que le résolveur décide à sa place d'émettre une anomalie.
**Le module n'importe rien** et ne mentionne ni sous-type, ni fournisseur.

**Aucun fichier produit existant modifié** hors les deux ajouts d'infrastructure ci-dessous.

**Ajout d'infrastructure nécessaire** : `vitest.config.ts` + 1 ligne d'inclusion pour
`src/lib/order-domain/`. Sans elle, le test passe en isolation mais **n'est jamais
collecté** — le piège explicitement documenté dans ce fichier. Preuve que la ligne opère :
le comptage passe de **1129 à 1159**.

**Cliquet appliqué** : nouvelle entrée `order-domain-frontier` dans `DOMAIN_REGISTRY`.
Le module est le **seul** autorisé à lire le mode pour en déduire un domaine ; en
contrepartie, deux règles lui interdisent le sous-type et toute dépendance de domaine ou
de fournisseur. **2 mutations sur 2 attrapées.**

**Trois échecs pendant la phase, tous de mon fait, tous rattrapés avant validation :**

| Échec | Attrapé par | Correction |
|---|---|---|
| Littéral BigInt dans un test | `tsc` | retiré |
| Le commentaire d'en-tête écrivait le nom du champ de sous-type | **la règle que je venais d'écrire** | reformulé — le nom exact vit dans le `reason` du registre |
| Le commentaire nommait l'identifiant de création de commande fournisseur | **`singleCreationPath.test.ts`**, garde préexistante | reformulé — **le fichier n'a PAS été ajouté à son allowlist** : affaiblir une protection existante pour un commentaire aurait été inacceptable |

**Enseignement conservé** : une règle structurelle s'applique aux lignes brutes,
commentaires compris. Documenter une interdiction en la nommant la déclenche. Le nom exact
appartient au registre ; le module dit « le sous-type », pas le champ.

---

### PHASE 2 — EN COURS (étapes 1-2 faites · étape 3 BLOQUÉE)

**Étape 1 — ✅ EXÉCUTÉE ET VÉRIFIÉE EN PRODUCTION.**
`supabase/sql/shop_orders_fulfillment_domain_step1_add_column.sql` : colonne **nullable**
+ contrainte `CHECK` tolérant le NULL.
Vérification en base par l'utilisateur : `fulfillment_domain | text | YES` — **1 ligne**.
Les 26 commandes existantes restent à `NULL`, aucune n'a été touchée.
*(Omission de ma part corrigée en cours de route : j'avais écrit le fichier sans jamais
coller son contenu à exécuter — une première vérification avait donc renvoyé 0 ligne.)*
*Refinement assumé* : le plan prévoyait le `CHECK` en étape 4. L'ajouter dès maintenant ne
coûte rien, tolère le NULL requis pendant la fenêtre, et rend une valeur invalide
impossible dès le premier jour. L'étape 4 n'aura qu'à ajouter `SET NOT NULL`.

> ⚠️ **ORDRE D'APPLICATION IMPÉRATIF** : le SQL doit être exécuté **avant** tout déploiement
> du code de l'étape 2. Sinon chaque `INSERT` de commande échoue — donc chaque checkout.
> L'échec serait immédiat et bruyant, jamais silencieux, mais total. **Rien n'est poussé :
> aucun risque en l'état.**

**Étape 2 — capture au checkout.** `checkout/route.ts` convertit `site.mode` en domaine via
le résolveur de la phase 1, puis l'écrit dans l'`INSERT`. **Aucune lecture supplémentaire**
n'est introduite : `site.mode` était déjà lu ligne 43 et déjà utilisé pour la livraison, le
coût fournisseur et la commission.

**Fail-closed observable** : un mode hors `{1,2,3}` se replie sur `merchant` — donc aucun
appel fournisseur — **et émet `site_mode_unrecognised`** (`severity: 'warning'`,
`details.domain: 'UNKNOWN'`, convention **M-2**). Un repli muet aurait été pire que le
problème : un site fournisseur au mode corrompu cesserait d'être livré en silence.

**8 tests ajoutés**, dont la propriété centrale : *le domaine ne dépend QUE du mode*.
Un test Mode 2 portant un `dropship_type` incohérent reste `merchant` — c'est exactement
l'erreur de `13bec0e` que ce test rend impossible à réintroduire.

**Limite de couverture, assumée et documentée** : les sous-types POD ne sont pas exercés au
niveau du checkout. Le repli `shipping_cache` de `resolveShipping` est **propre à CJ**
(`groups['cj']`, [:448](src/lib/shop/quote/resolveShipping.ts#L448)) ; un item POD ne résout
aucun devis et le Mode 3 refuse en 409 — **comportement Mode 3 existant, correct, hors
périmètre**. L'indépendance du domaine vis-à-vis du sous-type POD est prouvée là où elle est
décidable : le résolveur ne reçoit jamais le sous-type, et la règle `order-domain-frontier`
lui interdit structurellement de le lire.

**Un fixture incohérent corrigé en cours de route** : mon premier test envoyait un produit
CJ à une boutique `pod_brand`. Le checkout a répondu **409** — la garde d'éligibilité
fournisseur (N1) fonctionnant exactement comme prévu. Le fixture était faux, pas le code.

**Étape 3 — ✅ BACKFILL EXÉCUTÉ, après levée d'un blocage assumé.**

Mesure §12 : 26 commandes — **6** à preuve intrinsèque, **20** dérivées d'un site Mode 3,
**0** hors Mode 3, **0** ambiguë. Détail des 20 : 9 terminales, 11 non terminales,
**1 seule réellement éligible au cron CJ**, **0** preuve intrinsèque contredisant Mode 3,
**18 antérieures aux gardes Mode 3**.

**Mon propre critère d'arrêt s'est déclenché** (« 18 antérieures > 0 → STOP »). Je l'ai
honoré, puis levé — **non par assouplissement, mais parce que deux preuves l'ont rendu
caduc** :

1. **Preuve code** — aucun chemin applicatif n'a **jamais** pu écrire `sites.mode` hors de
   la création : un seul `INSERT` sur `sites` dans tout le dépôt ; `sites/[slug]` PATCH
   filtre par `FIELD_MAP`, **allowlist explicite de 19 champs où `mode` n'a figuré à aucun
   commit** ; `updateOwnedSite` supprime `mode` du payload ; `shop/shipping` n'écrit que
   `shipping_flat`, `agent/apply` que `cj_margin_percent` ; sur toute l'histoire git,
   **aucune ligne n'a jamais fait `update`/`upsert` de `mode`**, aucune migration ne le
   touche.
2. **Confirmation d'exploitation** — l'opérateur a confirmé n'avoir jamais modifié un mode
   manuellement. C'était le seul vecteur que le code ne pouvait pas exclure.

**Résultat** : 26 lignes en `'supplier'`, aucune restée `NULL`. Valeur **dérivée** par
jointure, jamais devinée. Aucune règle « en cas de doute → X » n'a été créée.

*Propriété qui a cadré la décision* : écrire `'supplier'` **préserve exactement le
comportement existant** — sans colonne ni garde, ces commandes étaient déjà toutes
éligibles au fulfillment fournisseur. C'est `'merchant'` qui aurait retiré une autorisation.

**Étape 4 — ✅ `NOT NULL` + IMMUTABILITÉ, PROUVÉE EN BASE.**

Vérifications préalables avant de toucher au schéma : **1 seul `INSERT`** sur `shop_orders`
dans tout le dépôt (et il écrit déjà la colonne) ; les **23 `UPDATE`** portent tous des
payloads explicites ; le seul payload dynamique (`orders` PATCH) est construit côté serveur
avec exactement deux clés (`status`, `tracking_number`) ; **aucun spread `{...order}` nulle
part** ; aucun `INSERT` côté RPC. Le trigger ne pouvait donc casser aucun chemin existant.

**Preuve comportementale, exécutée en production dans l'éditeur SQL Supabase — donc sous un
rôle privilégié, propriétaire de la table :**

```
UPDATE shop_orders SET fulfillment_domain = 'merchant' WHERE fulfillment_domain = 'supplier';
→ ERROR P0001: FULFILLMENT_DOMAIN_IMMUTABLE: supplier -> merchant
             (order_id=80f06737-e406-4c75-b17e-090e80d9c4fd)
```

*(exécuté dans `begin; … rollback;` — aucune donnée modifiée)*

Et le round-trip reste autorisé (`set fulfillment_domain = fulfillment_domain` → `UPDATE 1`,
aucune erreur) : le trigger ne produit pas de faux positif sur un futur code qui inclurait
la colonne sans vouloir la changer.

> **L'invariant I3/I4 du plan n'est plus une intention : il est vérifié en base, contre un
> rôle privilégié.** Limite nommée, identique à celle déjà acceptée pour `status` : un
> superuser peut désactiver un trigger — PostgreSQL n'offre pas mieux.

---

### PHASE 3 — VALIDÉE

**Trois gardes posées** : `cj/fulfill.ts` et `suppliers/pod-fulfill.ts` refusent tout
domaine ≠ `'supplier'` ; `handlePaidCheckout` devient un **aiguillage sans décision**.

**Ancienne protection remplacée** : la garde M2-07 de `13bec0e` lisait
`sites(mode, dropship_type)`. Elle est **entièrement supprimée**, conformément à **D3**.
`cj/fulfill.ts` ne contient plus **aucune** occurrence du sous-type ni de
`suppliersForDropshipType` — il n'existe plus qu'une seule logique de décision, et elle vit
hors de ce fichier.

**A5 et A9 activées** — `order-dispatch` (l'aiguillage ne peut ni brancher sur le mode, ni
lire le sous-type, ni importer un fournisseur) et A9 sur `mode-3-supplier-domain` (aucun
moteur ne relit `sites.mode`). **A9 est le test anti-rechute.**

**Preuve B — les 7 comportements Mode 3 sont IDENTIQUES à la production** *(banc comparatif
contre `origin/main` 0aed2c4, 12 cas)* : reseller, NULL, **pod_brand**, **pod_custom**,
mixte, catalogue CJ, réentrée terminale. Mêmes `vid`, mêmes produits transmis, mêmes
statuts, mêmes anomalies. **`pod_brand` et `pod_custom` — que la garde rejetée de `13bec0e`
MODIFIAIT — reviennent au comportement de production. La décision D3 est validée par la
mesure.** Les 5 cas Mode 2 changent : c'est la correction.

**Fichiers Mode 3 protégés : empreintes inchangées** — `suppliers.ts`, `registry.ts`,
`reconcile.ts`, les 3 adaptateurs, les 2 crons de réconciliation n'apparaissent même pas au
diff.

**Le contrôle de mutation a trouvé deux trous de couverture réels.** Retirer la garde POD
ou rendre l'aiguillage inconditionnel ne faisait échouer **aucun** test. Les tests
manquants ont été écrits, puis les 5 mutations re-contrôlées : **5 sur 5 attrapées**.

**⚠️ ÉCART À VALIDER — assertions disparues.** Le bloc de tests de la garde M2-07 portait
5 assertions qui décrivaient un comportement que **D3 supprime** :

| Assertion supprimée | Pourquoi elle n'a plus d'objet |
|---|---|
| `pod_brand` → `not_applicable` | D3 : la garde ne lit plus le sous-type. Un ordre `pod_brand` est `'supplier'` et entre dans le fulfillment — **comportement de production restauré** |
| `pod_custom` → `not_applicable` | idem |
| `dropship_type NULL` → éligible | le sous-type n'est plus lu du tout ; couvert par « domaine supplier → inchangé » |
| site introuvable → fail-closed | **le moteur ne lit plus `sites`** — le cas ne peut plus exister |
| erreur de lecture du site → fail-closed | idem |

Aucune de ces assertions n'a été supprimée **pour faire passer la suite** : chacune décrit un
chemin que la décision D3 a supprimé. Les propriétés qui subsistent ont toutes été
reportées.

**ARBITRAGE ACTÉ** : les 5 anciennes assertions **ne doivent pas être réintroduites** — elles
décrivent des comportements supprimés par D3. Les invariants de remplacement constituent
désormais la protection correcte.

**Preuve structurelle pour « site introuvable » et « erreur de lecture du site »** — ces deux
modes de défaillance avaient été *créés* par l'existence d'une seconde requête. Supprimer la
requête supprime le mode de défaillance : `cj/fulfill.ts` ne contient **zéro** occurrence de
`from('sites')`, la décision se lit sur une colonne **déjà chargée** par la requête unique de
la commande, et la règle A9 l'impose en CI. On ne peut pas échouer à lire ce qu'on ne lit pas.

**Deux formulations de mon rapport de phase corrigées, sans changement de fond** :
« CJ créé » désignait la colonne **AVANT** (le défaut), pas l'état après ; et « appel réel »
signifiait *le code de production a atteint la frontière fournisseur avec un payload valide*,
cette frontière étant substituée par un mock — **aucun appel HTTP n'a jamais eu lieu**. Les
données brutes du banc confirment les deux points ligne à ligne.

**M-1 reste hors phase 3** et ne doit pas y être rattachée rétroactivement.

---

### PHASE 4 — clarification du critère de sortie *(avant démarrage)*

Le plan se contredisait : le critère de sortie de la phase 4 exigeait **« 0 occurrence de
`site.mode` dans la route »**, alors que l'architecture (§2, chaîne de vérité) et la matrice
des droits de lecture autorisent explicitement **une** lecture au checkout — celle qui
convertit le mode en domaine, construite en phases 1-2 et validée au checkpoint `909a746`.

Appliquer le critère à la lettre aurait imposé de **détruire le point de décision unique**.
Critère corrigé ci-dessus. **Clarification, pas changement d'architecture ni d'ordre.**

Classification des 11 occurrences de `site.mode` dans la route :
**7 branchements métier** (81 · 98 · 140 · 356 · 503 · 506 · 535) → à déplacer vers les
politiques de domaine · **3 lignes de conversion** (707 · 716 · 724) → **doivent rester** ·
**1 champ de télémétrie** (524) → voir ci-dessous.

**Huitième point, hors des 7** : l'admission produit (ligne 182) décide via
`suppliersForDropshipType(site.dropship_type)` **sans jamais lire `mode`**. Or **D2 = NON**.
Cette garde relève donc de la phase 4, bien que le plan la range dans F2 sans la compter
parmi les 7.

**Q2 — `details.mode` de `zero_amount_checkout` (ligne 524) : INCHANGÉ, décision actée.**
Inventaire des consommateurs : aucun. `negative_merchant_profit` — que j'avais désigné à
tort — **ne porte pas ce champ**. Le champ appartient à un garde-fou **multi-mode**
(DEBT-029b) où `mode` est réellement discriminant, et conserve la **valeur brute** : un mode
corrompu y serait visible, là où `domain` afficherait `merchant` et masquerait la
corruption. Ce n'est pas un branchement — il ne décide rien.

**Trois catégories d'usage de `site.mode`, distinction maintenue pour toute la phase 4** :
décision métier → **doit disparaître** · conversion unique vers le domaine → **autorisée** ·
diagnostic / télémétrie → **autorisée tant qu'elle n'influence aucune décision**.

---

### PHASE 4 — VALIDÉE

**Trois fichiers neufs.** `order-domain/checkoutPolicy.ts` déclare le **contrat**
d'admission — il ne décide rien, ne connaît ni fournisseur ni sous-type ni valeur de mode.
`mode2/checkoutPolicy.ts` et `mode3/checkoutPolicy.ts` y répondent, **chacun chez soi**.

**Les 7 branchements métier ont disparu** : `grep "site.mode === "` dans la route → **0**.
Les occurrences restantes sont la conversion unique (74, 85, 93), la télémétrie validée
(571) et un commentaire. **La route ne sait plus quelle règle s'applique — seulement quelle
question poser.**

**Conversion unique préservée et REMONTÉE**, non supprimée ni dupliquée : elle doit précéder
la première décision, puisqu'elle sélectionne la politique. Toujours un seul point.

**D2 appliquée** : le domaine marchand refuse **tout** produit du catalogue fournisseur,
quel que soit le fournisseur et quel que soit le sous-type — y compris incohérent.

**A1 activée** — `mode-2-merchant-domain` interdit à `mode2/` d'importer `cj/`,
`suppliers/`, `dropship/`, `mode3/`, et d'y lire le sous-type. **Cliquet appliqué** aux
trois fichiers neufs : le contrat rejoint `order-domain-frontier`, la politique fournisseur
rejoint `mode-3-supplier-domain`, et `src/lib/mode3` entre dans les répertoires soumis au
test d'exhaustivité.

**Deux obstacles rencontrés, tous deux arbitrés avant modification :**

| Obstacle | Résolution |
|---|---|
| Le plan exigeait « 0 occurrence de `site.mode` », l'architecture en autorise une | **STOP** → critère clarifié (Q1) |
| Option A (mock configurable par test) **techniquement impossible** : `SHIPPING_SUPPLIERS` est un `const` de niveau module dans `resolveShipping.ts`, évalué à l'import, donc avant tout `beforeEach` | **STOP** → **A′** : mock fixe ciblé `printful`, **aucun fichier de production touché**. Rayon d'action nul sur l'existant, prouvé par la boucle : `SHIPPING_SUPPLIERS.get('cj')` → `undefined` → `continue`, le repli `shipping_cache` reste le seul chemin CJ |

**Requalification D2 des fixtures — 4 causes mécaniques identifiées successivement**, aucune
assertion touchée : sites Mode 2 portant un sous-type Mode 3 → `SITE_MODE3` · absence de
`countryCode` → complété · `catalog_products` sans `id` ni `supplier_product_id` →
complétés · fixtures en **objet** au lieu de **tableau** — `buildSupplierGroups` fait
`for (const cp of catProds)`, un objet n'est pas itérable, l'exception était avalée par le
`catch` de la route et le Mode 3 rejetait. Enfin, `shipping_cache` ajouté là où le Mode 3
exige un devis confirmé.

**Le test que D2 visait explicitement** — *« site reseller + produit CJ (cas légitime) »* —
**conserve son assertion** (`200`) : seul son fixture est passé d'un site Mode 2 incohérent
à un vrai site Mode 3.

**Registre transversal** *(signalé, hors périmètre)* : `fulfill.ts:443-445` sans filtre
`supplier_id` · annulation POD absente de `cancel-order` · 4 colonnes CJ sur `shop_orders` ·
allowlist `pod_brand` incluant Gelato alors qu'aucune voie de vente ne l'expose ·
échec d'insertion `logAnomaly` avalé.

---

### PHASE 4 — AUDIT DE FERMETURE : les acquis n'étaient pas verrouillés

Trois audits architecturaux successifs, demandés avant validation, ont montré que la
livraison initiale de la phase était **juste mais non tenue**. Les défauts trouvés étaient
tous dans le travail de cette phase, et tous de la même famille.

**Ce que les phases 0 à 3 faisaient et que la phase 4 avait omis** : chacune avait verrouillé
son propre acquis par une règle de registre. La phase 4 ne l'avait pas fait. Cette régularité
n'était écrite nulle part — elle l'est maintenant : **une phase qui n'installe pas le cliquet
de sa propre propriété ne l'a pas acquise, elle l'a seulement obtenue.**

**Quatre défauts mesurés, quatre corrigés :**

| Défaut | Pourquoi il comptait |
|---|---|
| `checkout/route.ts` n'appartenait à **aucun domaine** | l'acquis central — zéro branchement métier — n'était prouvé que par un `grep` manuel. Un branchement qui **reproduit** le comportement actuel ne fait échouer aucun test de caractérisation, par construction |
| `mode-2-merchant-domain` déclarait **un seul fichier explicite** | `ownedFiles` n'est jamais un glob. Un `src/lib/mode2/pricing.ts` n'aurait été couvert par aucune règle : A1 était vraie par coïncidence de contenu, pas tenue par un garde |
| `order-domain-frontier` et `checkout-domain-selection` : même défaut | le second était le plus probable — extraire un `checkout/policyHelpers.ts` est le refactor le plus naturel sur une route de neuf cents lignes, et il aurait accueilli la décision hors de portée du cliquet |
| A10 incomplet sur **trois domaines** | `mode-2-merchant-domain`, `order-domain-frontier` : règles déclarées, **jamais prouvées non muettes**. `order-dispatch` : sans contrôle négatif |

**Deux cliquets et deux exhaustivités installés** — `checkout-domain-selection` (6 règles :
comparaison, aiguillage, appartenance, véracité, acquisition, alias du site) et les
constantes `MODE_2_`, `ORDER_DOMAIN_`, `CHECKOUT_OWNED_DIRECTORIES`, sur le mécanisme
`*_OWNED_DIRECTORIES` déjà éprouvé pour le Mode 3. **Aucun mécanisme nouveau.**

**Une évasion réputée indétectable a été fermée.** La phase 0 avait mesuré et documenté
`const m = site.mode` puis `if (m === 3)` comme hors de portée d'une regex. Elle l'était pour
un motif ancré sur la **lecture**. En interdisant l'**acquisition** — affectation,
destructuration, accès par crochets, alias de l'objet entier — la dérivation est fermée en
amont plutôt que poursuivie dans ses formes.

**Une dérogation assumée** : `checkout-domain-selection` est le seul domaine à exclure du
scan les lignes débutant par un marqueur de commentaire. La route doit pouvoir **expliquer en
prose** la règle qu'elle n'applique plus, et un branchement mis en commentaire n'est pas un
branchement. Aucun code exécutable ne peut s'y cacher : une ligne de code suivie d'un
commentaire reste scannée intégralement.

**16 mutations, 16 conformes.** 5 pour la phase · 5 pour les deux premiers verrous · 6 pour
la fermeture. Trois méritent d'être retenues : le helper voisin de la route est attrapé
**non déclaré** par l'exhaustivité *puis* **déclaré** par les règles du cliquet — il n'existe
plus de position où l'écrire ; `order-domain-frontier` et `order-dispatch` sont désormais
prouvés contre une **rechute réelle dans le fichier réellement gardé**, non plus seulement
contre une fixture ; et une contre-épreuve vérifie qu'un helper *propre et déclaré* reste
vert — l'exhaustivité signifie « déclarez et conformez-vous », jamais « n'ajoutez rien ».

**Résultat mesuré : 6/6 domaines du chantier en contrôle positif ET négatif, 4/4 domaines
en forme de répertoire gardés par exhaustivité.** Les deux restants ne sont pas des trous :
`order-dispatch` possède un fichier dans `src/lib/shop/`, répertoire mixte à trois domaines,
où l'exhaustivité par répertoire serait fausse et non manquante.

**Dettes reportées, signalées pendant la phase 4 et NON rattachées à son périmètre** —
à arbitrer, aucune n'ayant d'effet sur le comportement livré :

🟡 le mécanisme d'exhaustivité n'a pas lui-même d'exhaustivité : les quatre constantes
`*_OWNED_DIRECTORIES` sont une liste manuelle, et rien ne détecte l'oubli d'un cinquième
domaine. La règle décidable qui le fermerait signalerait à tort les répertoires légitimement
mixtes (`src/lib/shop/`, `src/lib/payments/`) et exigerait donc une nouvelle liste manuelle.
🟡 A2 (acyclicité `mode3` ↛ `mode2`) a un contrôle positif mais n'a **jamais été mutée** :
elle détecte la fixture, rien ne prouve encore qu'elle protège.
🟡 `shared-commerce-core` est le seul domaine sans dénominateur possible — « SHARED » est une
catégorie sémantique, pas un répertoire. Rien ne signale l'apparition d'un fichier partagé.
🟡 `checkout/route.ts` conserve les branches `dropship_type === 'pod_brand' / 'pod_custom'`
(résolution des designs). Décisions de **sous-type**, jamais de domaine : l'invariant tient.
Mais ce sont des connaissances internes au Mode 3 dans un fichier partagé, et **le plan ne
prévoit pas leur traitement** — la phase 5 nomme F3/F4/F5, pas ce bloc.
🟡 le tunnel catalogue n'est pas aligné sur D2 : `catalog/curate` et `catalog/image-search`
ferment au Mode 2, `catalog/selections` et `catalog/search` ne filtrent que par sous-type, et
`suppliersForDropshipType(null)` retombe sur `['cj']`. L'amont admettrait ce que le checkout
refuse. *(Absence de garde constatée ; atteignabilité de bout en bout non mesurée.)*
🟡 les politiques portent le **prédicat**, pas le **comportement** : la route sait encore en
quoi consiste chaque règle. Une sixième contrainte de domaine rouvrirait `checkout/route.ts`.
🟡 le mock Supabase accepte un objet **et** un tableau avec des sémantiques différentes ;
l'exception est avalée par le `catch` de la route. **Une fixture mal formée et un refus métier
légitime produisent la même réponse observable** — un test peut donc être vert pour la
mauvaise raison. C'est la cause du diagnostic en quatre temps décrit plus haut.

🔵 consolidation possible : porter `ownedDirectories?: string[]` sur `DomainDefinition`
ramènerait les trois blocs d'exhaustivité à un seul et le 🟡 ci-dessus de deux endroits à un.
Non fait : cela aurait supprimé des assertions existantes.
🔵 `siteSubtype` figure dans le contrat partagé alors que `mode2` l'ignore entièrement.
🔵 `src/app/api/shop/checkout/route.ts.backup` — copie pré-phase 4, gitignorée, trompeuse.
⚪ `policy.domain` n'est lu par aucun code de production : membre de contrat test-only.
