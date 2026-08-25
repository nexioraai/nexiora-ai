'use client';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import MerchantProductModal from './MerchantProductModal';
interface MerchantProduct {
  id?: string;
  /** LOT 3 / DEBT-058 -- voir le calcul de `href` ci-dessous. */
  hasProductPage?: boolean;
  name: string;
  description: string;
  price: string;
  priceNumber?: number;
  currency?: string;
  image?: string;
  supplierId?: string | null;
  supplierProductId?: string | null;
}
interface Props {
  product: MerchantProduct;
  primary: string;
  lang?: string;
  slug: string;
  children: React.ReactNode;
  className?: string;
  // Optionnel, retro-compatible : voir MerchantProductModal.tsx.
  variant?: 'light' | 'dark';
}
export default function ClickableProductCard({ product, primary, lang, slug, children, className, variant }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <a
        // LOT 3 / DEBT-058 -- UN LIEN QUI MENE A UN 404 N'EST PLUS EMIS.
        //
        // Le clic est intercepte (`preventDefault` ci-dessous, la modale
        // s'ouvre), mais le `href` restait reel : ouverture en nouvel onglet,
        // URL collee, et surtout robots d'indexation l'atteignaient. Pour une
        // maquette POD BRAND, `fetchProduct` refuse : il sert la fiche depuis
        // `site_catalog_selections`, mecanisme que `pod_brand` n'utilise pas
        // (regle du LOT 2, `usesCatalogSelections`).
        //
        // ON NE FABRIQUE PAS UNE FICHE POUR AUTANT : deux decisions deja
        // prises disent que ces produits n'en ont pas -- le sitemap ne les
        // publie pas, et l'admission les refuse. On rend le lien coherent
        // avec elles. `undefined` par defaut = comportement inchange pour
        // toutes les autres surfaces.
        href={product.id && product.hasProductPage !== false ? `/sites/${slug}/produits/${encodeURIComponent(product.id)}` : undefined}
        className={className}
        onClick={(e) => { e.preventDefault(); setOpen(true); }}
        style={{ cursor: 'pointer', textDecoration: 'none', color: 'inherit', display: 'block' }}
      >
        {children}
      </a>
      {open && typeof document !== 'undefined' && createPortal(
        <MerchantProductModal
          product={product}
          primary={primary}
          lang={lang}
          variant={variant}
          onClose={() => setOpen(false)}
        />,
        document.body
      )}
    </>
  );
}
