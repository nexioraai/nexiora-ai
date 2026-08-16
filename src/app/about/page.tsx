import type { Metadata } from 'next';
import AboutContent from './AboutContent';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://deribfy.com';

const TITLE = 'À propos de Deribfy — Notre mission, vision et approche IA';
const RAW_DESCRIPTION =
  "Woorri est une plateforme SaaS propulsée par l'intelligence artificielle qui réunit, dans une seule interface, les outils dont une entreprise a besoin pour lancer et faire croître son activité en ligne : création de sites, e-commerce, marketing, automatisation, analyse de données et IA conversationnelle.";
const DESCRIPTION =
  RAW_DESCRIPTION.length > 160 ? RAW_DESCRIPTION.slice(0, 157).trimEnd() + '…' : RAW_DESCRIPTION;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/about` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/about`,
    siteName: 'Deribfy',
    type: 'website',
  },
};

export default function AboutPage() {
  return <AboutContent />;
}
