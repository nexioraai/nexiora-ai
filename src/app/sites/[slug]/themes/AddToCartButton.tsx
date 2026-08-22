'use client';
import { useCart } from './CartContext';
import { ShoppingBag } from 'lucide-react';

export default function AddToCartButton({
  id,
  name,
  priceNumber,
  currency,
  image,
  customDesignUrl,
  customDesignPosition,
  customDesigns,
  variantId,
  primary = '#111111',
  label,
  disabled = false,
  onAdded,
}: {
  id: string;
  name: string;
  priceNumber: number;
  currency: string;
  image?: string;
  customDesignUrl?: string;
  customDesignPosition?: Record<string, number>;
  customDesigns?: any[];
  variantId?: string;
  primary?: string;
  label: string;
  disabled?: boolean;
  onAdded?: () => void;
}) {
  const { addItem } = useCart();
  return (
    <button
      type="button"
      onClick={(e) => {
        // Ce bouton est souvent imbrique dans un conteneur cliquable plus large
        // (ClickableProductCard -> un <a href="/produits/..."> dont l'onClick
        // fait e.preventDefault() + ouvre une fiche produit). stopPropagation()
        // seul ne suffit PAS : il empeche bien le double-trigger (ajouter au
        // panier ET ouvrir la modale), mais en bloquant la bulle vers l'ancre
        // parente, il empeche AUSSI le preventDefault() de cette ancre de
        // s'executer -- la navigation native du <a> reprenait alors la main
        // et redirigeait vers la page produit complete. Verifie a l'ecran :
        // premiere version de ce correctif redirigeait reellement hors du
        // Shop apres un clic "Add to cart", une regression pire que le bug
        // d'origine. preventDefault() ici bloque cette navigation native
        // directement a la source, sans dependre du parent. addItem/logique
        // panier inchanges.
        e.preventDefault()
        e.stopPropagation()
        if (!disabled) { addItem({ id, name, priceNumber, currency, image, customDesignUrl, customDesignPosition, customDesigns, variantId }); onAdded?.(); }
      }}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 text-sm font-medium transition hover:opacity-80"
      style={{ color: primary, opacity: disabled ? 0.4 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
    >
      <ShoppingBag className="w-4 h-4" />
      {label}
    </button>
  );
}
