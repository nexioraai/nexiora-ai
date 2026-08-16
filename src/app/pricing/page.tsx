import type { Metadata } from 'next';
import PricingContent from './PricingContent';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://deribfy.com';

const TITLE = 'Tarifs — Deribfy';
const DESCRIPTION =
  'Choisissez le plan adapté à votre projet. Changez ou annulez à tout moment. Tous les prix sont en dollars canadiens (CAD), par mois.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/pricing` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/pricing`,
    siteName: 'Deribfy',
    type: 'website',
  },
};

export default function PricingPage() {
  return <PricingContent />;
}
