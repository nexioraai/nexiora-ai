# AUDIT MODE 2 — ÉTAT

Standard exigé : **ELITE 2026 / A+** — aucun problème déclaré résolu sans preuve
réelle (test exécuté, mutation tuée, mesure en base). Distinction stricte :
**code terminé ≠ test effectué ≠ preuve validée**.

Dernière mise à jour : 2026-08-25 — audit livré, **résolution en cours**.

| | |
|---|---|
| Commit de référence à l'ouverture | `11b3b52` (clôture Mode 1) |
| Branche | `fix/xss-jsonld` |
| Baseline à l'ouverture | **175 fichiers, 2871 tests, 0 échec** |
| Mode 1 | **FERMÉ** le 2026-08-25 — ne pas rouvrir |

---

## 1. OBJECTIF

Démontrer que le **Mode 2 (boutique vendant son propre stock)** est cohérent,
sûr et complet : frontières exécutoires avec Mode 1 et Mode 3, capacités
conformes, chemins de lecture/écriture corrects, rendu public juste.

## 2. DÉFINITION OPÉRATIONNELLE, MESURÉE

| Autorité | Mode 2 |
|---|---|
| `canTransact` | ✅ (`[2,3]`) |
| `resolveFulfillmentDomain` | `merchant` |
| `hasSupplierCatalog` | ❌ (`[3]`) |
| `FLAT_SHIPPING_MODES` | ✅ **exclusif au Mode 2** |
| `CATALOG_BEFORE_OWN_PRODUCTS` | ❌ → `hasShop` exige un produit |
| `MODE2_CHECKOUT_POLICY` | commission **0**, fee **0** |

**26 outils agent** : `UNIVERSAL`(5) + `CONTENT`(15) + `PROMO`(2) +
`INVENTORY`(1) + `PRODUCT_FIELD`(3). `MANUAL_PRODUCT` **retiré**.

## 3. PROBLÈMES — 10 identifiés, 8 nouvellement découverts

| ID | Niveau | Titre | Statut |
|---|---|---|---|
| M2-01 | 🟢 | La fiche produit Mode 2 renvoie 500 | **RÉSOLU** `d2244ea` |
| M2-02 | 🟢 | La guidance Mode 2 contredit ses outils | **RÉSOLU** |
| M2-03 | 🟢 | Le pied du panier est à moitié traduit | **RÉSOLU** |
| M2-04 | 🟢 | `PromoBanner` : langue **et devise** en dur | **RÉSOLU** |
| M2-05 | 🟢 | Le test de la fiche produit masque M2-01 | **RÉSOLU** `d2244ea` |
| M2-06 | 🟡 | `shipping_flat` : borne unique, bypassable **et non testée** | à traiter (critère de fermeture) |
| M2-07 | 🟡 | 1,1 s de latence par checkout Mode 2, quota fournisseur inutilisé | à traiter (critère de fermeture) |
| M2-08 | ⚪ | `buildSupplierGroups` interrogé sur le chemin Mode 2 | lié à M2-07 |
| M2-09 | 🟡 | `consume_promo_code` sans script versionné | à traiter (critère de fermeture) |
| M2-10 | ⚪ | `handlePaidCheckout` importe le fulfillment fournisseur | dette, aiguillage correct |

Détail complet et preuves : `KNOWN_ISSUES.md`, entrées `DEBT-038` → `DEBT-047`.

## 4. FRONTIÈRES — vérifiées EXÉCUTOIRES, pas déclaratives

**Mode 1 ↔ Mode 2** 🟢 — `canTransact` sépare à la racine ; `sites.mode` est
immuable ; `/apply` applique la frontière à l'écriture ; Mode 2 a perdu
`MANUAL_PRODUCT_TOOLS`. **Aucune voie d'escalade trouvée.**

**Mode 2 ↔ Mode 3** 🟢 — Le seul vecteur plausible serait qu'un produit Mode 2
acquière un `cj_vid` (`buildSupplierGroups` basculerait alors sa livraison sur
CJ). Fermé à **trois couches** : exclu de l'allowlist `POST`, exclu de
l'allowlist `PATCH`, et `shop_products` sans aucun GRANT PostgREST.
**Aucune escalade trouvée.**

**Preuve** : 8 mutations adversariales sur les gardes de frontière — **7 tuées**,
la seule survivante étant la borne `shipping_flat` (M2-06), qui n'est pas une
frontière de mode.

## 5. SURFACES 🟢 — mesurées cette passe

Aucune server action · **19/19 fonctions SQL versionnées portent un `REVOKE`
explicite** · `consume_promo_code` et `decrement_shop_stock_batch` → `42501`
pour anon · `promo_codes`, `shop_orders`, `messages`, `design_uploads`,
`checkout_anomalies`, `cron_runs` → `42501` · `sites`, `shop_products`,
`score_history` → 200 mais **0 ligne** (RLS effective) ·
`site_catalog_selections` → RLS filtre, **0 non approuvée visible** ·
isolation locataire des commandes (`requireSiteOwner` + `.eq('site_id')`) ·
aiguillage du fulfillment sur `fulfillment_domain`, jamais `sites.mode`.

## 6. HORS PÉRIMÈTRE MODE 2 — consigné

- `'Pays de livraison'` en dur (`CartDrawer:492`) — sous `requiresShippingQuote`,
  donc **Mode 3 seul**.
- Mode 1 : DEBT-036 ⚪, DEBT-037 🟡 inchangés, **non rouverts**. L'incertitude
  sur les privilèges PostgREST de `promo_codes` est **mesurée résolue pour
  `anon`** (`42501`) — information transmise, sans réouverture.

## 7. LIMITES DE L'AUDIT

- **Rôle `authenticated`** : aucun JWT utilisateur, aucun créé en production.
  Tout ce qui distingue `authenticated` d'`anon` reste **non mesuré**.
- **Catalogues pg** (`pg_policies`, `information_schema`) non exposés par
  PostgREST — limite connue (DEBT-004).
- **Comportement réel du LLM** face à M2-02 : non mesuré.
- Aucun site Mode 2 ne publiant de produit (**mesuré : 0**), aucun défaut n'a pu
  être observé en production réelle.

## 8. CRITÈRES DE FERMETURE MODE 2

- [x] La fiche produit rend son bouton d'achat, verrouillé par un test sur la **composition réelle** *(M2-01, M2-05)*
- [x] Aucun test ne valide une composition inexistante en production *(M2-05)*
- [x] La guidance transmise au modèle est cohérente avec ses outils *(M2-02)*
- [x] Aucune surface publique Mode 2 n'affiche texte ou devise en dur *(M2-03, M2-04)*
- [ ] Toute borne sur un paramètre commercial est **testée** *(M2-06)*
- [ ] Le chemin de paiement Mode 2 n'exécute aucune logique fournisseur *(M2-07, M2-08)*
- [ ] Toute RPC atteinte par un chemin Mode 2 a un script versionné *(M2-09)*
- [ ] Aucun défaut 🔴/🟠 non traité

**STATUT : NON FERMÉ** — résolution en cours.

## 9. ORDRE DE TRAITEMENT

① M2-01 + M2-05 · ② M2-02 · ③ M2-03 + M2-04 · ④ M2-06 · ⑤ M2-07 + M2-08 · ⑥ M2-09
