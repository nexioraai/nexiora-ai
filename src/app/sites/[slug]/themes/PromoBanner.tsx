'use client';
import { useState, useEffect } from 'react';
import { canTransact } from '@/lib/commerce-admission/canTransact';
import type { CartLabels } from './cartLabels';

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

export default function PromoBanner({ slug, primary, mode, labels, currency }: {
  slug: string;
  primary: string;
  mode: number | null | undefined;
  /** M2-03 -- les memes libelles que le panier : une seule autorite de langue. */
  labels: CartLabels;
  /**
   * M2-04 -- la devise REELLE de la boutique, ou `undefined` si elle n'est pas
   * etablissable. Voir `resolveShopCurrency` : on affiche alors le montant nu
   * plutot qu'une devise fausse.
   */
  currency: string | undefined;
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

  // M2-04 -- LE `$` ETAIT ECRIT EN DUR, sur les deux montants.
  // Un pourcentage n'a pas de devise ; un montant fixe en a une, et si elle
  // n'est pas etablissable on affiche le nombre seul. Jamais un symbole
  // suppose : « min. 50$ » sur une boutique en euros est FAUX, pas imprecis.
  const montant = (n: number) => (currency ? `${n} ${currency}` : `${n}`);
  const label = promo.discount_type === 'percent'
    ? `-${promo.discount_value}%`
    : `-${montant(promo.discount_value)}`;

  const minLabel = promo.min_order > 0
    ? ' ' + labels.promoBannerMin.replace('{min}', montant(promo.min_order))
    : '';

  return (
    <div
      className="w-full py-2.5 px-4 text-center text-sm font-medium relative z-[100]"
      style={{ background: primary, color: '#fff' }}
    >
      {/* M2-03 -- « avec le code » etait en dur. Le gabarit traduit porte les
          deux emplacements, l'ordre des mots pouvant differer d'une langue a
          l'autre : on decoupe autour de `{code}` plutot que de concatener. */}
      <span>
        {'🎉 '}
        {labels.promoBannerWithCode.replace('{discount}', label).split('{code}')[0]}
        <strong>{promo.code}</strong>
        {labels.promoBannerWithCode.split('{code}')[1] ?? ''}
        {minLabel}
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
