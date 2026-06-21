'use client';
import { type ReactNode } from 'react';
import { CartProvider } from './CartContext';
import CartDrawer from './CartDrawer';

type Labels = {
  cartTitle: string;
  empty: string;
  total: string;
  checkout: string;
  continue: string;
};

export default function CartShell({
  children,
  primary,
  labels,
  slug,
}: {
  children: ReactNode;
  primary: string;
  labels: Labels;
  slug: string;
}) {
  return (
    <CartProvider>
      {children}
      <CartDrawer primary={primary} labels={labels} slug={slug} />
    </CartProvider>
  );
}
