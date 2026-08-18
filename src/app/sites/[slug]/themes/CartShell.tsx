'use client';
import { type ReactNode } from 'react';
import { CartProvider } from './CartContext';
import CartDrawer from './CartDrawer';
import type { CartLabels } from './cartLabels';
import { getModeCapabilities } from './modeCapabilities';

type Labels = CartLabels;

export default function CartShell({
  children,
  primary,
  labels,
  slug,
  mode,
  products,
  shippingFlat,
}: {
  children: ReactNode;
  primary: string;
  labels: Labels;
  slug: string;
  mode?: number | null;
  products?: unknown[] | null;
  shippingFlat?: number;
}) {
  // Calcule sa propre verite a partir des donnees brutes (mode, products)
  // plutot que de faire confiance a un booleen deja decide par l'appelant :
  // un futur appel erroneement passe pour un site Mode 1 reste sans effet,
  // au lieu de dependre de la discipline de chaque site d'appel.
  const { hasShop } = getModeCapabilities({ mode, products });
  if (!hasShop) {
    return <>{children}</>;
  }

  return (
    <CartProvider>
      {children}
      <CartDrawer primary={primary} labels={labels} slug={slug} mode={mode} shippingFlat={shippingFlat} />
    </CartProvider>
  );
}
