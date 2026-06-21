'use client';
import { useState } from 'react';
import { useCart } from './CartContext';
import { X, ShoppingBag, Plus, Minus, Trash2 } from 'lucide-react';

type Labels = {
  cartTitle: string;
  empty: string;
  total: string;
  checkout: string;
  continue: string;
};

export default function CartDrawer({
  primary = '#111111',
  labels,
  slug,
}: {
  primary?: string;
  labels: Labels;
  slug: string;
}) {
  const { items, isOpen, total, currency, count, setQuantity, removeItem, closeCart } = useCart();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleCheckout = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/shop/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          items: items.map((i) => ({
            id: i.id,
            name: i.name,
            priceNumber: i.priceNumber,
            currency: i.currency,
            quantity: i.quantity,
          })),
        }),
      });
      const data = await res.json();
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
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-white z-[61] shadow-2xl flex flex-col transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-neutral-100">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5" style={{ color: primary }} />
            <h2 className="text-lg font-medium text-neutral-900">
              {labels.cartTitle} {count > 0 && `(${count})`}
            </h2>
          </div>
          <button onClick={closeCart} className="p-1 rounded-lg hover:bg-neutral-100 transition" aria-label="Fermer">
            <X className="w-5 h-5 text-neutral-500" />
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-neutral-400">
              <ShoppingBag className="w-12 h-12 mb-3 opacity-30" />
              <p>{labels.empty}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => (
                <div key={item.id} className="flex gap-4 items-center">
                  {item.image ? (
                    <img src={item.image} alt={item.name} className="w-16 h-16 rounded-xl object-cover border border-neutral-100" />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-neutral-100 flex items-center justify-center text-xl font-medium" style={{ color: primary }}>
                      {item.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-neutral-900 truncate">{item.name}</p>
                    <p className="text-sm text-neutral-500">{item.priceNumber.toFixed(2)} {item.currency}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <button onClick={() => setQuantity(item.id, item.quantity - 1)} className="w-7 h-7 rounded-lg border border-neutral-200 flex items-center justify-center hover:bg-neutral-50 transition">
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                      <button onClick={() => setQuantity(item.id, item.quantity + 1)} className="w-7 h-7 rounded-lg border border-neutral-200 flex items-center justify-center hover:bg-neutral-50 transition">
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => removeItem(item.id)} className="ml-auto p-1.5 rounded-lg hover:bg-red-50 text-neutral-400 hover:text-red-500 transition" aria-label="Retirer">
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
          <div className="border-t border-neutral-100 px-6 py-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-neutral-500">{labels.total}</span>
              <span className="text-xl font-semibold text-neutral-900">{total.toFixed(2)} {currency}</span>
            </div>
            <button
              className="w-full py-4 rounded-2xl font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              style={{ background: primary }}
              onClick={handleCheckout}
              disabled={busy}
            >
              {busy ? '…' : labels.checkout}
            </button>
            {error && <p className="text-sm text-red-500 text-center">{error}</p>}
            <button onClick={closeCart} className="w-full text-sm text-neutral-500 hover:text-neutral-700 transition">
              {labels.continue}
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
