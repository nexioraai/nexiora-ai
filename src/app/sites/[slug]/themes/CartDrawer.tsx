'use client';
import { useState } from 'react';
import { useCart } from './CartContext';
import { X, ShoppingBag, Plus, Minus, Trash2 } from 'lucide-react';
import type { CartLabels } from './cartLabels';
import { getBuyerNonce } from '@/lib/shop/buyerNonce';

type Labels = CartLabels;

// CART-01 : meme categorie de probleme deja corrigee sur CatalogSearch
// (DEBT-008), ContactMap (DEBT-010), MerchantProductModal (DEBT-011),
// CookieConsent (DEBT-012) -- un composant partage codait en dur un fond
// clair (bg-white, text-neutral-*), invisible en tant que "bug" tant qu'on
// ne l'ouvre pas reellement sur un storefront sombre. Verifie a l'ecran sur
// Cosmopo (Noir) : le tiroir panier s'ouvrait en panneau blanc pur sur un
// site entierement noir, au moment precis de l'intention d'achat.
// Meme principe que MerchantProductModal (variant?: 'light'|'dark',
// retro-compatible, defaut 'light' = comportement actuel inchange pour
// Editorial/Vif/Aurora qui ne passent pas la prop) mais exprime en classes
// Tailwind plutot qu'en style inline, pour rester dans l'idiome deja utilise
// par ce fichier precis (CartDrawer est 100% Tailwind, contrairement a
// MerchantProductModal qui est 100% style inline -- chaque composant garde
// son propre idiome existant plutot que d'en importer un nouveau).
// Palette dark reprise telle quelle de MerchantProductModal (#161109 /
// #F5F3EE) pour que les deux panneaux sombres que l'utilisateur peut voir
// l'un apres l'autre (fiche produit -> panier) restent visuellement
// coherents entre eux.
type Variant = 'light' | 'dark';

const SKIN: Record<Variant, {
  drawerBg: string;
  // Couleur de base posee sur <aside> lui-meme : plusieurs elements du
  // panier (icones Minus/Plus, chiffre de quantite) n'ont jamais eu de
  // classe de couleur de texte propre dans le composant d'origine -- ils
  // heritaient implicitement du <body> (proche du noir, invisible une fois
  // le fond du panier assombri pour Noir). Rendu explicite ici plutot que
  // de dependre d'un heritage silencieux, decouvert en ouvrant reellement
  // le panier sur Cosmopo : icones -/+ invisibles sur le tiroir sombre.
  bodyText: string;
  headerBorder: string;
  titleText: string;
  closeHoverBg: string;
  closeIconText: string;
  emptyText: string;
  itemImageBorder: string;
  itemImagePlaceholderBg: string;
  itemTitleText: string;
  itemPriceText: string;
  qtyBtnBorder: string;
  qtyBtnHoverBg: string;
  removeBtnText: string;
  footerBorder: string;
  labelMutedText: string;
  valueText: string;
  helperText: string;
  inputBorder: string;
  inputText: string;
  inputBg: string;
  inputFocusBorder: string;
  tierBorderDefault: string;
  tierBgDefault: string;
  tierHoverBorder: string;
  tierSelectedBorder: string;
  tierSelectedBg: string;
  tierRadioBorderSelected: string;
  tierRadioBorderDefault: string;
  tierRadioDotBg: string;
  tierLabelText: string;
  tierMetaText: string;
  tierPriceText: string;
  totalLabelText: string;
  totalValueText: string;
  continueText: string;
  continueHoverText: string;
}> = {
  light: {
    drawerBg: 'bg-white',
    bodyText: 'text-neutral-900',
    headerBorder: 'border-neutral-100',
    titleText: 'text-neutral-900',
    closeHoverBg: 'hover:bg-neutral-100',
    closeIconText: 'text-neutral-500',
    emptyText: 'text-neutral-400',
    itemImageBorder: 'border-neutral-100',
    itemImagePlaceholderBg: 'bg-neutral-100',
    itemTitleText: 'text-neutral-900',
    itemPriceText: 'text-neutral-500',
    qtyBtnBorder: 'border-neutral-200',
    qtyBtnHoverBg: 'hover:bg-neutral-50',
    removeBtnText: 'text-neutral-400',
    footerBorder: 'border-neutral-100',
    labelMutedText: 'text-neutral-500',
    valueText: 'text-neutral-700',
    helperText: 'text-neutral-400',
    inputBorder: 'border-neutral-200',
    inputText: 'text-neutral-900',
    inputBg: 'bg-white',
    inputFocusBorder: 'focus:border-neutral-400',
    tierBorderDefault: 'border-neutral-200',
    tierBgDefault: 'bg-white',
    tierHoverBorder: 'hover:border-neutral-300',
    tierSelectedBorder: 'border-neutral-900',
    tierSelectedBg: 'bg-neutral-50',
    tierRadioBorderSelected: 'border-neutral-900',
    tierRadioBorderDefault: 'border-neutral-300',
    tierRadioDotBg: 'bg-neutral-900',
    tierLabelText: 'text-neutral-900',
    tierMetaText: 'text-neutral-500',
    tierPriceText: 'text-neutral-900',
    totalLabelText: 'text-neutral-500',
    totalValueText: 'text-neutral-900',
    continueText: 'text-neutral-500',
    continueHoverText: 'hover:text-neutral-700',
  },
  dark: {
    drawerBg: 'bg-[#161109]',
    bodyText: 'text-[#F5F3EE]',
    headerBorder: 'border-[rgba(245,243,238,0.12)]',
    titleText: 'text-[#F5F3EE]',
    closeHoverBg: 'hover:bg-[rgba(245,243,238,0.08)]',
    closeIconText: 'text-[rgba(245,243,238,0.55)]',
    emptyText: 'text-[rgba(245,243,238,0.35)]',
    itemImageBorder: 'border-[rgba(245,243,238,0.12)]',
    itemImagePlaceholderBg: 'bg-[rgba(245,243,238,0.08)]',
    itemTitleText: 'text-[#F5F3EE]',
    itemPriceText: 'text-[rgba(245,243,238,0.55)]',
    qtyBtnBorder: 'border-[rgba(245,243,238,0.18)]',
    qtyBtnHoverBg: 'hover:bg-[rgba(245,243,238,0.08)]',
    removeBtnText: 'text-[rgba(245,243,238,0.4)]',
    footerBorder: 'border-[rgba(245,243,238,0.12)]',
    labelMutedText: 'text-[rgba(245,243,238,0.55)]',
    valueText: 'text-[rgba(245,243,238,0.8)]',
    helperText: 'text-[rgba(245,243,238,0.4)]',
    inputBorder: 'border-[rgba(245,243,238,0.18)]',
    inputText: 'text-[#F5F3EE]',
    inputBg: 'bg-[#1F1810]',
    inputFocusBorder: 'focus:border-[rgba(245,243,238,0.4)]',
    tierBorderDefault: 'border-[rgba(245,243,238,0.18)]',
    tierBgDefault: 'bg-transparent',
    tierHoverBorder: 'hover:border-[rgba(245,243,238,0.35)]',
    tierSelectedBorder: 'border-[#F5F3EE]',
    tierSelectedBg: 'bg-[rgba(245,243,238,0.08)]',
    tierRadioBorderSelected: 'border-[#F5F3EE]',
    tierRadioBorderDefault: 'border-[rgba(245,243,238,0.3)]',
    tierRadioDotBg: 'bg-[#F5F3EE]',
    tierLabelText: 'text-[#F5F3EE]',
    tierMetaText: 'text-[rgba(245,243,238,0.55)]',
    tierPriceText: 'text-[#F5F3EE]',
    totalLabelText: 'text-[rgba(245,243,238,0.55)]',
    totalValueText: 'text-[#F5F3EE]',
    continueText: 'text-[rgba(245,243,238,0.55)]',
    continueHoverText: 'hover:text-[#F5F3EE]',
  },
};

export default function CartDrawer({
  primary = '#111111',
  labels,
  slug,
  mode,
  shippingFlat = 0,
  variant = 'light',
}: {
  primary?: string;
  labels: Labels;
  slug: string;
  mode?: number | null;
  shippingFlat?: number;
  variant?: Variant;
}) {
  const { items, isOpen, total, currency, count, setQuantity, removeItem, closeCart } = useCart();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [country, setCountry] = useState('');
  const [stateCode, setStateCode] = useState('');
  const s = SKIN[variant];

  // Auto-detect country + state from timezone
  const tzStateMap: Record<string, { country: string; state: string }> = {
    'America/Toronto': { country: 'CA', state: 'ON' },
    'America/Montreal': { country: 'CA', state: 'QC' },
    'America/Vancouver': { country: 'CA', state: 'BC' },
    'America/Edmonton': { country: 'CA', state: 'AB' },
    'America/Winnipeg': { country: 'CA', state: 'MB' },
    'America/Halifax': { country: 'CA', state: 'NS' },
    'America/Regina': { country: 'CA', state: 'SK' },
    'America/St_Johns': { country: 'CA', state: 'NL' },
    'America/New_York': { country: 'US', state: 'NY' },
    'America/Chicago': { country: 'US', state: 'IL' },
    'America/Denver': { country: 'US', state: 'CO' },
    'America/Los_Angeles': { country: 'US', state: 'CA' },
    'America/Phoenix': { country: 'US', state: 'AZ' },
    'America/Anchorage': { country: 'US', state: 'AK' },
    'Pacific/Honolulu': { country: 'US', state: 'HI' },
    'America/Detroit': { country: 'US', state: 'MI' },
    'America/Indiana/Indianapolis': { country: 'US', state: 'IN' },
    'Europe/London': { country: 'GB', state: 'ENG' },
    'Europe/Paris': { country: 'FR', state: '' },
    'Europe/Berlin': { country: 'DE', state: '' },
    'Europe/Madrid': { country: 'ES', state: '' },
    'Europe/Rome': { country: 'IT', state: '' },
    'Europe/Amsterdam': { country: 'NL', state: '' },
    'Europe/Brussels': { country: 'BE', state: '' },
    'Australia/Sydney': { country: 'AU', state: 'NSW' },
    'Australia/Melbourne': { country: 'AU', state: 'VIC' },
    'Asia/Tokyo': { country: 'JP', state: '' },
    'Asia/Seoul': { country: 'KR', state: '' },
    'Asia/Singapore': { country: 'SG', state: '' },
    'Asia/Hong_Kong': { country: 'HK', state: '' },
  };
  const defaultStates: Record<string, string> = {
    CA: 'ON', US: 'NY', AU: 'NSW', GB: 'ENG',
  };
  const [shipping, setShipping] = useState<number | null>(null);
  const [calcBusy, setCalcBusy] = useState(false);
  const [aging, setAging] = useState<string | null>(null);
  type CjTier = { tier: string; label: string; cost: number; days_min: number | null; days_max: number | null };
  const [tiers, setTiers] = useState<CjTier[] | null>(null);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState('');
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [promoMsg, setPromoMsg] = useState('');
  const [promoValid, setPromoValid] = useState(false);
  const [promoBusy, setPromoBusy] = useState(false);

  // Libelles pays localises (ISO -> nom), tries alpha. Liste alignee sur Stripe.
  const COUNTRY_CODES = ['US','CA','GB','FR','DE','ES','IT','NL','BE','CH','AT','IE','PT','SE','NO','DK','FI','PL','AU','NZ','JP','KR','SG','HK','AE','SA','BR','MX','ZA','IN'];
  const dn = typeof Intl !== 'undefined' && (Intl as any).DisplayNames
    ? new (Intl as any).DisplayNames(['fr'], { type: 'region' })
    : null;
  const countries = COUNTRY_CODES
    .map((code) => ({ code, name: dn ? dn.of(code) : code }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const handlePromo = async () => {
    if (!promoCode.trim()) return;
    setPromoBusy(true);
    setPromoMsg('');
    try {
      const res = await fetch('/api/shop/promo/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, code: promoCode, subtotal: total }),
      });
      const data = await res.json();
      if (data.valid) {
        setPromoDiscount(data.discount);
        setPromoValid(true);
        setPromoMsg(data.discount_type === 'percent' ? `-${data.discount_value}%` : `-${data.discount} ${currency}`);
      } else {
        setPromoDiscount(0);
        setPromoValid(false);
        const reasonMsg =
          data.reason === 'expired' ? labels.promoExpired
          : data.reason === 'depleted' ? labels.promoDepleted
          : data.reason === 'min_order' ? labels.promoMinOrder.replace('{min}', `${data.min_order} ${currency}`)
          : labels.promoInvalid;
        setPromoMsg(reasonMsg);
      }
    } catch {
      setPromoMsg(labels.promoError);
    } finally {
      setPromoBusy(false);
    }
  };

  const handleCountryChange = async (code: string) => {
    setCountry(code);
    setShipping(null);
    setTiers(null);
    setSelectedTier(null);
    setAging(null);
    setError('');
    // Detect state from timezone or use default
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const detected = tzStateMap[tz];
    const sc = (detected && detected.country === code) ? detected.state : (defaultStates[code] || '');
    setStateCode(sc);
    if (!code) return;
    setCalcBusy(true);
    try {
      const res = await fetch('/api/shop/shipping/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          items: items.map((i) => ({ id: i.id, quantity: i.quantity })),
          countryCode: code,
          stateCode: sc,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      if (data.source === 'unavailable') {
        setShipping(-1);
        setAging(null);
      } else {
        setAging(data.aging || null);
        // Tiers CJ : si presents, on pilote le shipping par le tier choisi.
        if (Array.isArray(data.cjTiers) && data.cjTiers.length > 0) {
          setTiers(data.cjTiers);
          const std = data.cjTiers.find((t: CjTier) => t.tier === 'standard') || data.cjTiers[0];
          setSelectedTier(std.tier);
          setShipping(Number(std.cost) || 0);
        } else {
          setTiers(null);
          setSelectedTier(null);
          setShipping(Number(data.shipping) || 0);
        }
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCalcBusy(false);
    }
  };

  const pickTier = (t: CjTier) => {
    setSelectedTier(t.tier);
    setShipping(Number(t.cost) || 0);
  };

  const handleCheckout = async () => {
    setBusy(true);
    setError('');
    try {
      const payload = {
        slug,
        countryCode: country,
        items: items.map((i) => ({
          id: i.id,
          name: i.name,
          priceNumber: i.priceNumber,
          currency: i.currency,
          quantity: i.quantity,
          customDesignUrl: i.customDesignUrl,
          customDesignPosition: i.customDesignPosition,
          customDesigns: i.customDesigns,
        })),
        stateCode,
        shipmentTier: selectedTier,
        // Passe de cloture (P-1) : on transmet UNIQUEMENT le code saisi,
        // jamais `promoDiscount` calcule ici. Le serveur re-resout le code
        // dans le contexte de CE site et recalcule la remise a partir des
        // prix serveur -- la valeur affichee ci-dessus n'a qu'un role
        // indicatif et n'a aucune autorite sur le montant facture.
        // Envoye seulement si le code a ete valide, pour ne pas faire
        // echouer un checkout sur un code a moitie saisi.
        promoCode: promoValid ? promoCode.trim().toUpperCase() : undefined,
      };
      // ---- Contrat "affiche = facture" (LOT 4) ----
      // 1) APERCU : le serveur produit le devis qui fera foi, par le MEME
      //    chemin de code que la facturation -- il s'arrete juste avant la
      //    creation de la session Stripe. Aucune commande n'est creee ici.
      const preview = await fetch('/api/shop/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, preview: true }),
      });
      const quote = await preview.json();
      if (!preview.ok) throw new Error(quote.error || 'Erreur');

      // 2) CHECKOUT REEL, porteur du hash du devis apercu. Si le devis a
      //    change entre les deux appels, le serveur refuse en 409 AVANT de
      //    creer la moindre session Stripe.
      const res = await fetch('/api/shop/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          // LOT 3 -- identifiant d'ACHETEUR, aleatoire et persiste, PAS une
          // empreinte du panier (voir buyerNonce.ts). Sans autorite
          // financiere : la cle reelle est construite cote serveur.
          checkoutNonce: getBuyerNonce(),
          quoteHash: quote.quoteHash,
        }),
      });
      const data = await res.json();

      // Devis perime : on met l'affichage a jour avec les montants faisant
      // foi et on rend la main a l'acheteur. AUCUNE nouvelle tentative
      // automatique -- un rejeu immediat pourrait boucler et, surtout,
      // facturerait un montant que l'acheteur n'a pas encore vu.
      if (res.status === 409 && data.code === 'quote_changed') {
        if (typeof data.shipping === 'number') setShipping(data.shipping);
        if (typeof data.discount === 'number') setPromoDiscount(data.discount);
        setError(data.error || 'Les prix ont ete mis a jour.');
        setBusy(false);
        return;
      }

      if (!res.ok) throw new Error(data.error || 'Erreur');
      window.location.href = data.url;
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <>
      {/* Overlay */}
      <div
        onClick={closeCart}
        className={`fixed inset-0 bg-black/50 z-[60] transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Drawer */}
      <aside
        className={`fixed top-0 right-0 h-full w-full max-w-md ${s.drawerBg} ${s.bodyText} z-[61] shadow-2xl flex flex-col transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-5 border-b ${s.headerBorder}`}>
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5" style={{ color: primary }} />
            <h2 className={`text-lg font-medium ${s.titleText}`}>
              {labels.cartTitle} {count > 0 && `(${count})`}
            </h2>
          </div>
          <button onClick={closeCart} className={`p-1 rounded-lg ${s.closeHoverBg} transition`} aria-label="Fermer">
            <X className={`w-5 h-5 ${s.closeIconText}`} />
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {items.length === 0 ? (
            <div className={`flex flex-col items-center justify-center h-full text-center ${s.emptyText}`}>
              <ShoppingBag className="w-12 h-12 mb-3 opacity-30" />
              <p>{labels.empty}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item, idx) => (
                <div key={`${item.id}-${idx}`} className="flex gap-4 items-center">
                  {item.image ? (
                    <img src={item.image} alt={item.name} className={`w-16 h-16 rounded-xl object-cover border ${s.itemImageBorder}`} />
                  ) : (
                    <div className={`w-16 h-16 rounded-xl ${s.itemImagePlaceholderBg} flex items-center justify-center text-xl font-medium`} style={{ color: primary }}>
                      {item.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium ${s.itemTitleText} truncate`}>{item.name}</p>
                    <p className={`text-sm ${s.itemPriceText}`}>{(item.priceNumber ?? 0).toFixed(2)} {item.currency}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <button onClick={() => setQuantity(item.id, item.quantity - 1)} className={`w-7 h-7 rounded-lg border ${s.qtyBtnBorder} flex items-center justify-center ${s.qtyBtnHoverBg} transition`}>
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                      <button onClick={() => setQuantity(item.id, item.quantity + 1)} className={`w-7 h-7 rounded-lg border ${s.qtyBtnBorder} flex items-center justify-center ${s.qtyBtnHoverBg} transition`}>
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => removeItem(item.id)} className={`ml-auto p-1.5 rounded-lg hover:bg-red-50 ${s.removeBtnText} hover:text-red-500 transition`} aria-label="Retirer">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className={`border-t ${s.footerBorder} px-6 py-5 space-y-4`}>
            {mode === 2 ? (
              <div className="flex items-center justify-between text-sm">
                <span className={s.labelMutedText}>Livraison</span>
                <span className={s.valueText}>{shippingFlat > 0 ? `${shippingFlat.toFixed(2)} ${currency}` : 'Gratuite'}</span>
              </div>
            ) : (
              <>
              <div>
                <label className={`block text-sm ${s.labelMutedText} mb-1.5`}>Pays de livraison</label>
                <select
                  value={country}
                  onChange={(e) => handleCountryChange(e.target.value)}
                  className={`w-full px-4 py-3 rounded-xl border ${s.inputBorder} ${s.inputText} ${s.inputBg} focus:outline-none ${s.inputFocusBorder} transition`}
                >
                  <option value="">Sélectionnez votre pays…</option>
                  {countries.map((co) => (
                    <option key={co.code} value={co.code}>{co.name}</option>
                  ))}
                </select>
              </div>
              {!country && (
                <p className={`text-sm ${s.helperText} text-center`}>Sélectionnez votre pays pour calculer la livraison.</p>
              )}
              {country && (
                <>
                <div className="flex items-center justify-between text-sm">
                  <span className={s.labelMutedText}>Livraison estimée</span>
                  <span className={s.valueText}>
                    {calcBusy ? '…' : shipping === -1 ? 'Non disponible' : shipping !== null ? `${shipping.toFixed(2)} ${currency}` : '—'}
                  </span>
                </div>
                {aging && !tiers && (
                  <p className={`text-xs ${s.labelMutedText} mt-1`}>
                    {aging}
                  </p>
                )}
                {tiers && tiers.length > 0 && (
                  <div className="mt-2 space-y-2">
                    <p className={`text-xs ${s.labelMutedText}`}>Choisissez votre livraison :</p>
                    {tiers.map((t) => (
                      <button
                        key={t.tier}
                        type="button"
                        onClick={() => pickTier(t)}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-left transition ${selectedTier === t.tier ? `${s.tierSelectedBorder} ${s.tierSelectedBg}` : `${s.tierBorderDefault} ${s.tierBgDefault} ${s.tierHoverBorder}`}`}
                      >
                        <span className="flex items-center gap-2">
                          <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${selectedTier === t.tier ? s.tierRadioBorderSelected : s.tierRadioBorderDefault}`}>
                            {selectedTier === t.tier && <span className={`w-1.5 h-1.5 rounded-full ${s.tierRadioDotBg}`} />}
                          </span>
                          <span className="text-sm">
                            <span className={`font-medium ${s.tierLabelText}`}>{t.label}</span>
                            {(t.days_min || t.days_max) && (
                              <span className={s.tierMetaText}> · {t.days_min}-{t.days_max} j</span>
                            )}
                          </span>
                        </span>
                        <span className={`text-sm ${s.tierPriceText}`}>{t.cost.toFixed(2)} {currency}</span>
                      </button>
                    ))}
                  </div>
                )}
                </>
              )}
              </>
            )}
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder={labels.promoPlaceholder}
                value={promoCode}
                onChange={(e) => { setPromoCode(e.target.value.toUpperCase()); setPromoValid(false); setPromoDiscount(0); setPromoMsg(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handlePromo()}
                className={`flex-1 px-3 py-2 rounded-lg border ${s.inputBorder} text-sm ${s.inputText} ${s.inputBg} focus:outline-none ${s.inputFocusBorder}`}
              />
              <button
                onClick={handlePromo}
                disabled={promoBusy || !promoCode.trim()}
                className="px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-40"
                style={{ background: `${primary}15`, color: primary, border: `1px solid ${primary}30` }}
              >
                {promoBusy ? '…' : 'Appliquer'}
              </button>
            </div>
            {promoMsg && (
              <p className={`text-xs ${promoValid ? 'text-green-600' : 'text-red-500'}`}>
                {promoValid ? `✓ Code appliqué : ${promoMsg}` : promoMsg}
              </p>
            )}
            <div className="flex items-center justify-between">
              <span className={s.totalLabelText}>{labels.total}</span>
              <span className={`text-xl font-semibold ${s.totalValueText}`}>
                {(total + (mode === 2 ? shippingFlat : (shipping ?? 0)) - promoDiscount).toFixed(2)} {currency}
              </span>
            </div>
            <button
              className="w-full py-4 rounded-2xl font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              style={{ background: primary }}
              onClick={handleCheckout}
              disabled={busy || (mode !== 2 && (!country || calcBusy || shipping === -1))}
            >
              {busy ? '…' : labels.checkout}
            </button>
            {error && <p className="text-sm text-red-500 text-center">{error}</p>}
            <button onClick={closeCart} className={`w-full text-sm ${s.continueText} ${s.continueHoverText} transition`}>
              {labels.continue}
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
