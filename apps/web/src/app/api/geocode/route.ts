import { NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth/require-authenticated-user';
import { consommerJeton } from '@/lib/rate-limit/rateLimit';

// Geocodage d'une adresse via Nominatim (OpenStreetMap).
// Appele uniquement quand l'adresse change (onBlur cote editeur) -> cout minimal.
// ============================================================
// AUDIT GLOBAL — PROXY TIERS NON AUTHENTIFIE, SOUS NOTRE IDENTITE.
//
// La route relayait n'importe quelle chaine vers Nominatim (OpenStreetMap)
// AVEC NOTRE `User-Agent` « Deribfy/1.0 », sans authentification ni borne.
// Aucune cle n'est depensee -- c'est la REPUTATION qui l'est : la politique
// d'usage de Nominatim bannit l'appelant abusif, et le bannissement frappe
// alors le geocodage de TOUS les marchands. Meme famille que DEBT-057, avec
// un credential immateriel.
//
// AUTHENTIFIER NE CASSE RIEN, ET C'EST MESURE : l'unique appelant est
// `Navbar.tsx`, actif seulement sur `/edit/[slug]` -- une surface MARCHAND
// ou la session existe deja. Ce n'est donc pas une authentification ajoutee a
// un parcours visiteur, c'est la reconnaissance d'une session en main.
//
// Borne par COMPTE : le geocodage est declenche a la sortie du champ adresse,
// une poignee de fois par edition.
// ============================================================
const PLAFOND_PAR_MINUTE = 20;

export async function POST(req: Request) {
  try {
    const auth = await requireAuthenticatedUser(req);
    if (!auth.ok) return auth.response;

    const jeton = await consommerJeton({
      type: 'geocode_request',
      siteId: null,
      perimetreSupplementaire: { colonne: 'details->>user_id', valeur: auth.userId },
      fenetreMs: 60_000,
      plafond: PLAFOND_PAR_MINUTE,
      message: 'Trop de requetes, reessayez dans une minute.',
      details: { user_id: auth.userId },
    });
    if (!jeton.ok) return NextResponse.json({ error: jeton.erreur }, { status: jeton.statut });

    const { address } = await req.json();
    if (!address || typeof address !== 'string') {
      return NextResponse.json({ error: 'address required' }, { status: 400 });
    }
    // Nettoyage adresse pour Nominatim : abreviations + retrait code postal canadien
    let q = address
      .replace(/\bTerr\.?/gi, 'Terrasse')
      .replace(/\bAve\.?/gi, 'Avenue')
      .replace(/\bBlvd\.?/gi, 'Boulevard')
      .replace(/\bSt\.?/gi, 'Saint')
      .replace(/\bRte\.?/gi, 'Route')
      // retire code postal canadien (ex H3J 1E7) qui fait echouer Nominatim
      .replace(/\b[A-Za-z]\d[A-Za-z]\s*\d[A-Za-z]\d/g, '')
      .replace(/\s+,/g, ',')
      .replace(/,\s*,/g, ',')
      .trim()
    const res = await fetch(

      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
      { headers: { 'User-Agent': 'Deribfy/1.0 (contact@deribfy.com)' } }
    );
    const json = await res.json();
    if (Array.isArray(json) && json[0]) {
      return NextResponse.json({
        lat: parseFloat(json[0].lat),
        lng: parseFloat(json[0].lon),
      });
    }
    return NextResponse.json({ lat: null, lng: null });
  } catch (e) {
    console.error('Geocode failed:', e);
    return NextResponse.json({ error: 'geocode failed' }, { status: 500 });
  }
}
