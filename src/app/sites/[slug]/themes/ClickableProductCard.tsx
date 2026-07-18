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
  children: React.ReactNode;
  className?: string;
}

export default function ClickableProductCard({ product, primary, lang, children, className }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div
        className={className}
        onClick={() => setOpen(true)}
        style={{ cursor: 'pointer' }}
      >
        {children}
      </div>
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
