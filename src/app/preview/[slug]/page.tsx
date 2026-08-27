'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  fetchSitePreview,
  type Site,
} from '@/app/sites/[slug]/themes/shared';
import EditorialTheme from '@/app/sites/[slug]/themes/EditorialTheme';
import NoirTheme from '@/app/sites/[slug]/themes/NoirTheme';
import VifTheme from '@/app/sites/[slug]/themes/VifTheme';
import AuroraTheme from '@/app/sites/[slug]/themes/AuroraTheme';
import CartShell from '@/app/sites/[slug]/themes/CartShell';
import CatalogSearch, { type ThemeKey } from '@/app/sites/[slug]/themes/CatalogSearch';
// LOT 1 / L1-02 -- la montee de la barre de recherche etait une NEGATION
// (`!== 'pod_brand'`) recopiee ici, dans l'apercu et dans AuroraTheme : un
// sous-type ABSENT y passait. Regle unique, allowlist positive. Et le repli
// `|| 'reseller'` sur la prop est retire : il fabriquait un sous-type que la
// base ne porte pas.
import { showsVisitorCatalogSearch } from '@/app/sites/[slug]/themes/catalogSearchVisibility'
import PromoBanner from '@/app/sites/[slug]/themes/PromoBanner';
import { getCartLabels } from '@/app/sites/[slug]/themes/cartLabels';
import { resolveShopCurrency } from '@/app/sites/[slug]/themes/shopCurrency';
import ScrollRevealInit from '@/app/sites/[slug]/themes/ScrollRevealInit';

const themes = {
  editorial: EditorialTheme,
  noir: NoirTheme,
  vif: VifTheme,
  aurora: AuroraTheme,
};

export default function PreviewPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const [site, setSite] = useState<Site | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.push('/login');
        return;
      }
      fetchSitePreview(slug, data.user.email!).then((s) => {
        setSite(s);
        setLoading(false);
      });
    });
  }, [slug, router]);

  if (loading) {
    return (
      <div className="min-h-screen nexiora-bg flex items-center justify-center">
        <div className="text-white/40 text-lg">Chargement de l'aperçu…</div>
      </div>
    );
  }

  if (!site) {
    return (
      <div className="min-h-screen nexiora-bg flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-white/70 text-lg">Aperçu indisponible.</p>
        <p className="text-white/40 text-sm">Ce site est introuvable ou ne vous appartient pas.</p>
        <button
          onClick={() => router.push('/dashboard')}
          className="mt-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-white/15 text-white/80 hover:text-white hover:border-white/30 transition"
        >
          ← Retour au tableau de bord
        </button>
      </div>
    );
  }

  const key = (site.theme as keyof typeof themes) || 'editorial';
  const Theme = themes[key] ?? EditorialTheme;
  const primary = site.primary_color || '#111111';
  const cartLabels = getCartLabels(site.lang);

  return (
    <>
      <div className="sticky top-0 z-50 bg-[#FA5D1E] text-white text-sm font-medium text-center py-2 px-4">
        Mode aperçu — ce site n'est pas encore publié. Publiez-le depuis votre tableau de bord pour le rendre public.
      </div>
      <PromoBanner slug={site.slug} primary={primary} mode={site.mode} labels={cartLabels} currency={resolveShopCurrency(site.products)} />
      <CartShell primary={primary} labels={cartLabels} slug={site.slug} mode={site.mode} products={site.products} shippingFlat={site.shipping_flat} variant={key === 'noir' ? 'dark' : 'light'}>
        <Theme site={site} />
        {site.mode === 3 && showsVisitorCatalogSearch(site.dropship_type) && site.theme !== 'aurora' && <CatalogSearch slug={site.slug} primary={primary} lang={site.lang} theme={key as ThemeKey} dropshipType={site.dropship_type} />}
      </CartShell>
      <ScrollRevealInit />
    </>
  );
}
