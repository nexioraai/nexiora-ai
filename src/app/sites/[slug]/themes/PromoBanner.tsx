'use client';
import { useState, useEffect } from 'react';

export default function PromoBanner({ slug, primary }: { slug: string; primary: string }) {
  const [promo, setPromo] = useState<any>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch(`/api/shop/promo/active?slug=${slug}`)
      .then(r => r.json())
      .then(d => setPromo(d.promo))
      .catch(() => {});
  }, [slug]);

  if (!promo || dismissed) return null;

  const label = promo.discount_type === 'percent'
    ? `-${promo.discount_value}%`
    : `-${promo.discount_value}$`;

  const minLabel = promo.min_order > 0 ? ` (min. ${promo.min_order}$)` : '';

  return (
    <div
      className="w-full py-2.5 px-4 text-center text-sm font-medium relative z-50"
      style={{ background: primary, color: '#fff' }}
    >
      <span>
        🎉 {label} avec le code <strong>{promo.code}</strong>{minLabel}
      </span>
      <button
        onClick={() => setDismissed(true)}
        className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white text-lg"
      >
        ✕
      </button>
    </div>
  );
}
