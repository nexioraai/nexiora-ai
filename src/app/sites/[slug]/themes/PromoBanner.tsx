'use client';
import { useState, useEffect } from 'react';
import { canTransact } from '@/lib/commerce-admission/canTransact';

// ============================================================
// FERMETURE MODE 1, VOLET 2 -- UNE BANNIERE COMMERCIALE N'APPARAIT QUE SUR
// UN SITE ADMIS AU COMMERCE (DEBT-031).
//
// LE DEFAUT CORRIGE. Ce composant etait monte SANS AUCUNE CONDITION DE MODE,
// et pas a un endroit mais a DEUX -- `sites/[slug]/page.tsx` (vitrine
// publique) et `preview/[slug]/page.tsx` (apercu proprietaire). Les deux
// l'ont oublie, separement : c'est la signature meme d'une regle laissee a la
// discipline des sites d'appel.
//
// IL ETAIT MONTE EN FRERE DE `CartShell`, jamais dedans -- il n'heritait donc
// RIEN de la garde exemplaire de ce dernier. Deux composants corrects
// separement, un defaut ne de leur composition.
//
// CONSEQUENCE MESUREE, meme sans code promo en base : chaque affichage de
// chaque page d'une vitrine declenchait un `fetch` vers une API de boutique.
//
// LA GARDE VIT ICI, PAS CHEZ L'APPELANT. C'est le patron deja etabli par
// `CartShell` : « calcule sa propre verite a partir des donnees brutes
// plutot que de faire confiance a un booleen deja decide par l'appelant ».
// Un troisieme point de montage ajoute demain herite de la garde sans que
// personne ait a y penser -- c'est precisement ce qui a manque ici.
//
// `canTransact` ET NON `hasShop`. Ce sont deux questions distinctes :
// `hasShop` demande « faut-il afficher la surface boutique ? » et depend de
// l'existence d'un produit ; la banniere, elle, pose une question
// d'ADMISSION -- « ce site a-t-il le droit de produire un artefact
// commercial ? ». Un code promo EST un artefact commercial. Passer par
// `hasShop` aurait de plus modifie le comportement d'une boutique Mode 2
// sans produit, hors du perimetre Mode 1.
//
// FAIL-CLOSED SANS QU'AUCUNE LIGNE AIT A LE PREVOIR : `undefined`, `null`,
// `0`, `4`, `'2'`, `NaN` -- tout ce qui n'est pas litteralement 2 ou 3 sort
// avant le `fetch`.
//
// `mode` EST REQUIS, jamais optionnel. Un prop optionnel se serait tu au lieu
// d'echouer : TypeScript oblige desormais les deux points de montage a le
// fournir, et obligera le troisieme.
// ============================================================

export default function PromoBanner({ slug, primary, mode }: {
  slug: string;
  primary: string;
  mode: number | null | undefined;
}) {
  const [promo, setPromo] = useState<any>(null);
  const [dismissed, setDismissed] = useState(false);
  const admis = canTransact(mode);

  useEffect(() => {
    // Le refus precede l'appel reseau : une vitrine n'interroge JAMAIS une
    // route commerciale, meme pour s'entendre repondre « rien ».
    if (!admis) return;
    fetch(`/api/shop/promo/active?slug=${slug}`)
      .then(r => r.json())
      .then(d => setPromo(d.promo))
      .catch(() => {});
  }, [slug, admis]);

  if (!admis || !promo || dismissed) return null;

  const label = promo.discount_type === 'percent'
    ? `-${promo.discount_value}%`
    : `-${promo.discount_value}$`;

  const minLabel = promo.min_order > 0 ? ` (min. ${promo.min_order}$)` : '';

  return (
    <div
      className="w-full py-2.5 px-4 text-center text-sm font-medium relative z-[100]"
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
