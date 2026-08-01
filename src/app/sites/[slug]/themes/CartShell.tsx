'use client';
import { type ReactNode } from 'react';
import { CartProvider } from './CartContext';
import CartDrawer from './CartDrawer';
import type { CartLabels } from './cartLabels';

type Labels = CartLabels;

export default function CartShell({
  children,
  primary,
  labels,
  slug,
  mode,
  shippingFlat,
}: {
  children: ReactNode;
  primary: string;
  labels: Labels;
  slug: string;
  mode?: number | null;
  shippingFlat?: number;
}) {
  return (
    <CartProvider>
      {children}
      <CartDrawer primary={primary} labels={labels} slug={slug} mode={mode} shippingFlat={shippingFlat} />
    </CartProvider>
  );
}
