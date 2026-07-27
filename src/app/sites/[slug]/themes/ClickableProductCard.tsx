'use client';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import MerchantProductModal from './MerchantProductModal';
interface MerchantProduct {
  id?: string;
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
}
export default function ClickableProductCard({ product, primary, lang, slug, children, className }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <a
        href={product.id ? `/sites/${slug}/produits/${encodeURIComponent(product.id)}` : undefined}
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
          onClose={() => setOpen(false)}
        />,
        document.body
      )}
    </>
  );
}
