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
}) {
  const { addItem } = useCart();
  return (
    <button
      onClick={() => { if (!disabled) addItem({ id, name, priceNumber, currency, image, customDesignUrl, customDesignPosition, customDesigns, variantId }); }}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 text-sm font-medium transition hover:opacity-80"
      style={{ color: primary, opacity: disabled ? 0.4 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
    >
      <ShoppingBag className="w-4 h-4" />
      {label}
    </button>
  );
}
