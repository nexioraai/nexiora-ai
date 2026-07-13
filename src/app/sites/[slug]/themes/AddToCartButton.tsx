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
  primary = '#111111',
  label,
}: {
  id: string;
  name: string;
  priceNumber: number;
  currency: string;
  image?: string;
  customDesignUrl?: string;
  primary?: string;
  label: string;
}) {
  const { addItem } = useCart();
  return (
    <button
      onClick={() => addItem({ id, name, priceNumber, currency, image, customDesignUrl })}
      className="inline-flex items-center gap-1.5 text-sm font-medium transition hover:opacity-80"
      style={{ color: primary }}
    >
      <ShoppingBag className="w-4 h-4" />
      {label}
    </button>
  );
}
