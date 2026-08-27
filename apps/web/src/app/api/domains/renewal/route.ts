import { NextRequest, NextResponse } from 'next/server';
import { requireSiteOwner } from '@/lib/auth/require-site-owner';
import { resilierRenouvellement, reactiverRenouvellement } from '@/lib/domains/renewal';

// ============================================================
// P2 -- « DETACHER » ET « RESILIER » SONT DEUX OPERATIONS, DEUX ROUTES.
//
// Les confondre serait le defaut le plus couteux possible : un marchand qui
// veut simplement retirer son domaine d'un site perdrait le domaine lui-meme.
// La separation vit donc dans l'URL, pas seulement dans l'interface.
//
//   DELETE /api/domains         -> DETACHER : le lien domaine <-> site est
//                                  retire. Le domaine et son abonnement
//                                  continuent d'exister, intacts.
//   POST   /api/domains/renewal -> RESILIER : le renouvellement s'arrete. Le
//                                  domaine reste actif jusqu'a son expiration.
//
// Aucune des deux n'entraine jamais l'autre.
// ============================================================
export async function POST(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'Slug manquant' }, { status: 400 });

  const auth = await requireSiteOwner(req, slug, 'id, custom_domain');
  if (!auth.ok) return auth.response;
  const site = auth.site as { id: string; custom_domain: string | null };

  // LE DOMAINE A RESILIER N'EST PAS FOURNI PAR L'APPELANT. Il est lu depuis le
  // site dont la propriete vient d'etre etablie : un identifiant de domaine
  // accepte du client serait une voie directe vers la resiliation du domaine
  // d'autrui.
  if (!site.custom_domain) {
    return NextResponse.json({ error: 'Aucun domaine a resilier' }, { status: 400 });
  }

  // AUDIT FINAL -- LA RESILIATION ETAIT A SENS UNIQUE. Un marchand qui
  // arretait le renouvellement par erreur n'avait aucun moyen de revenir en
  // arriere : le domaine expirait, puis devenait rachetable par n'importe qui.
  // Le verbe reste le meme ; l'intention est explicite dans la requete.
  const reactiver = req.nextUrl.searchParams.get('reactiver') === 'true';

  const r = reactiver
    ? await reactiverRenouvellement({ siteId: site.id, domain: site.custom_domain, origine: 'marchand' })
    : await resilierRenouvellement({ siteId: site.id, domain: site.custom_domain, origine: 'marchand' });

  if (!r.ok) {
    // AUCUN FAUX SUCCES. Un echec registraire remonte tel quel : l'interface
    // ne doit jamais annoncer une resiliation qui n'a pas eu lieu.
    const statut = r.raison === 'introuvable' ? 404 : r.raison === 'registraire' ? 502 : 503;
    return NextResponse.json({ error: r.message, raison: r.raison }, { status: statut });
  }

  return NextResponse.json({
    ok: true,
    dejaResilie: r.dejaResilie,
    expireLe: r.expireLe,
    // Formulation NORMATIVE, alignee sur ce que l'API permet reellement :
    // le domaine n'est pas supprime, il cesse d'etre renouvele.
    message: reactiver
      ? 'Le renouvellement est retabli.'
      : 'Le renouvellement est arrete. Le domaine reste actif jusqu a son expiration.',
  });
}
