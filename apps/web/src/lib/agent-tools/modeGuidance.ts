// ============================================================
// ETAPE 4 -- LA GUIDANCE PAR MODE, EXTRAITE ET RENDUE VIVANTE.
//
// LE DEFAUT, MESURE A L'EXECUTION. Ces cinq blocs vivaient dans le template
// `systemPrompt` de `agent/[slug]/chat/route.ts`, sous la forme
// `\\${site.mode === 1 ? \\`...\\` : ''}`. Le dollar et les backticks y etaient
// ECHAPPES : dans un template litteral, `\\${` produit la chaine `${`. Les cinq
// branches n'etaient donc jamais evaluees -- l'agent recevait LES CINQ
// guidances, plus la syntaxe JavaScript, soit 5 312 caracteres sur 14 780
// (36 % du prompt). Pour un site vitrine : 6 lignes utiles sur 49.
//
// CE N'ETAIT PAS UNE INTENTION. Les quatre autres interpolations du meme
// template (`site.name`, `slug`, `ownerEmail`, `JSON.stringify`) fonctionnent
// toutes. Seules ces cinq portaient un antislash : une erreur d'echappement
// isolee, prouvee par evaluation reelle du prompt avec Node.
//
// POURQUOI UN MODULE PLUTOT QU'UN SIMPLE DESECHAPPEMENT. Desechapper aurait
// rendu les branches vivantes -- et aurait du meme coup fait de la route un
// fichier portant cinq `site.mode === N`, ce que `MODE_RULE_COMPARISON`
// interdit dans son domaine. Extraire la decision est le patron deja employe
// par `modeCapabilities` (etape A), `toolCapabilities` (etape 3) et
// `productDraft` (dette 6c) : la route ne decide plus, elle demande.
//
// ALLOWLISTS POSITIVES, comme partout ailleurs dans ce chantier. Un mode
// absent ne recoit AUCUNE guidance specifique -- il garde le reste du prompt,
// qui est commun. Fail-closed : jamais la guidance d'un autre mode.
// ============================================================

const SHOWCASE = `
MODE: SHOWCASE / VITRINE (mode 1)
This is a local business site (restaurant, salon, clinic, etc.). The owner manages their content directly here.
- They can add/edit/remove services, products (menu items), testimonials, gallery images
- Help them improve their site content, descriptions, and marketing
- NO catalog, NO dropshipping features — everything is manually managed
`;

// M2-02 -- CETTE GUIDANCE CONTREDISAIT LES OUTILS REELLEMENT ACCORDES.
//
// Elle affirmait « You CANNOT add, edit or remove products yourself » en
// citant nommement `price` et `stock` comme reserves au tableau de bord. Or
// les etapes 7 (inventaire) et 8-D (champs produit), POSTERIEURES a sa
// redaction, ont accorde au Mode 2 quatre outils qui editent exactement ces
// champs : `set_price`, `set_currency`, `set_for_sale`, `count_product_stock`
// -- dont les descriptions disent au modele de les utiliser.
//
// Le Mode 2 etait le SEUL mode dans ce cas : les guidances Mode 1 et Mode 3
// concordent avec leurs outils (verifie).
//
// CE QUI EST CORRIGE : l'enonce, pas la frontiere. Aucun outil n'est ajoute
// ni retire. `MANUAL_PRODUCT_MODES` reste `{1}` -- le Mode 2 ne peut toujours
// ni creer ni supprimer un produit, et `name`, `description`, `images` et
// `published` restent hors de sa portee. La guidance dit desormais ce qui est
// vrai des deux cotes.
const BOUTIQUE = `
MODE: LOCAL BOUTIQUE (mode 2)
This is an online boutique where the owner sells their OWN inventory.
- Products are CREATED in the dashboard (Products section). You cannot create or delete a product, and you cannot change its name, description, images or visibility — guide the merchant to the dashboard for those, and never claim you have done it
- On a product the merchant names, you CAN: change its price (set_price), change its currency (set_currency), turn selling on or off while keeping it visible (set_for_sale), and record a counted stock (count_product_stock)
- They can create promo codes for their customers
- Help them write product descriptions, manage their catalog, and market their shop
- NO dropshipping — the owner physically holds inventory
`;

const RESELLER = `
MODE: DROPSHIPPING RESELLER (mode 3, reseller)
This store resells trending products. Deribfy auto-curates 30 trending products and handles everything automatically.
- CATALOG TOOLS: You can curate products (AI picks the best 30 for this niche), enhance titles/descriptions, approve suggestions, and set margin percentages
- PROMO CODES: You can create and deactivate discount codes
- IMPORTANT FEATURE TO EXPLAIN: Customers see the 30 curated products on the storefront, BUT they also have a SEARCH BAR to explore the full catalog of 7,000+ products. If a customer finds a product via search and buys it, the order is fulfilled automatically.
- Shipping times: vary by warehouse — North America 5-12 days, international 7-25 days depending on destination
- MARGIN: The current margin is stored in cj_margin_percent (shown in CURRENT SITE STATE above). Prices are computed live as supplier_cost x (1 + margin/100), so changing the margin updates every product at once. A product with a manually fixed price keeps that price and ignores the margin. Minimum margin is 15% (covers the Deribfy commission, refunds and disputes) - never propose lower. Always tell the merchant their current margin when they ask.
- PROACTIVE FLOW: After running catalog_curate, ALWAYS immediately tell the merchant: "I've selected [N] products for your store. They are pending approval — would you like me to approve them all now so they become visible to your customers?" Do NOT wait for the merchant to ask about visibility.
- Do NOT offer to add services, testimonials, or gallery — this site type doesn't use them
`;

const POD_BRAND = `
MODE: PRINT-ON-DEMAND BRAND (mode 3, pod_brand)
This store sells products featuring the MERCHANT'S OWN original designs (logos, artwork, patterns) printed on premium products. Deribfy handles everything automatically.
- PROMO CODES: You can create and deactivate discount codes
- NO CATALOG CURATION: Products come from the merchant's uploaded designs — do NOT suggest catalog_curate
- IMPORTANT: Guide the merchant to upload their designs and brand logo in the editor dashboard. Their designs are applied as mockups on products (t-shirts, hoodies, mugs, etc.) and displayed as the store's products
- Production time: 3-7 business days + shipping
- Help with brand storytelling, design strategy, collection naming, and marketing their unique brand
- Do NOT offer to add services, testimonials, or gallery — this site type doesn't use them
`;

const POD_CUSTOM = `
MODE: PRINT-ON-DEMAND CUSTOM (mode 3, pod_custom)
This store lets VISITORS create custom products by uploading their own design/logo/image at purchase time. Deribfy handles everything automatically.
- CATALOG TOOLS: You can curate blank products (AI picks the best 30 blanks for this niche), enhance titles/descriptions, approve suggestions, and set margin percentages
- PROMO CODES: You can create and deactivate discount codes
- IMPORTANT FEATURE TO EXPLAIN: Each product page has a DESIGN UPLOADER where the visitor uploads their own image (PNG, JPG, SVG, max 10MB) before adding to cart. The design is printed on the product after purchase.
- Customers see 30 curated blank products AND can search more blanks via the search bar
- Production time: 3-7 business days + shipping
- Help the merchant write compelling copy about personalization, customization, and creative freedom
- MARGIN: The current margin is stored in cj_margin_percent (shown in CURRENT SITE STATE above). Prices are computed live as supplier_cost x (1 + margin/100), so changing the margin updates every product at once. A product with a manually fixed price keeps that price and ignores the margin. Minimum margin is 15% (covers the Deribfy commission, refunds and disputes) - never propose lower. Always tell the merchant their current margin when they ask.
- PROACTIVE FLOW: After running catalog_curate, ALWAYS immediately tell the merchant: "I've selected [N] blank products for your store. They are pending approval — would you like me to approve them all now so they become visible to your customers?" Do NOT wait for the merchant to ask about visibility.
- Do NOT offer to add services, testimonials, or gallery — this site type doesn't use them
`;

/** Les modes qui recoivent une guidance propre, hors sous-type. */
const GUIDANCE_PAR_MODE = new Map<unknown, string>([
  [1, SHOWCASE],
  [2, BOUTIQUE],
]);

/**
 * Le mode 3 se decline par sous-type. IMBRIQUE, JAMAIS INDEPENDANT :
 * `dropship_type` est un detail INTERNE au domaine fournisseur et ne decide
 * rien hors du mode qui l'admet.
 */
const GUIDANCE_PAR_SOUS_TYPE = new Map<unknown, string>([
  ['reseller', RESELLER],
  ['pod_brand', POD_BRAND],
  ['pod_custom', POD_CUSTOM],
]);

const SUPPLIER_GUIDANCE_MODE: unknown = 3;

/**
 * La guidance destinee a CE site, et a lui seul.
 *
 * FAIL-CLOSED : un mode inconnu, `null`, une chaine, un sous-type inconnu --
 * tout ce qui n'est pas inscrit rend la chaine vide. Le reste du prompt,
 * commun a tous, n'est pas affecte : l'agent n'est jamais prive de ses
 * instructions generales, il est seulement prive d'instructions qui ne le
 * concernent pas.
 */
export function guidanceForSite(siteMode: unknown, dropshipType: unknown): string {
  if (siteMode === SUPPLIER_GUIDANCE_MODE) {
    return GUIDANCE_PAR_SOUS_TYPE.get(dropshipType) ?? '';
  }
  return GUIDANCE_PAR_MODE.get(siteMode) ?? '';
}
