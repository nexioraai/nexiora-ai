import { NextResponse } from 'next/server';
import { enableStockTracking, disableStockTracking } from '@/lib/shop';
import { requireProductOwner } from '@/lib/auth/require-product-owner';

/**
 * ETAPE 7 du chantier catalogue canonique -- LA POLITIQUE D'INVENTAIRE EST UN
 * ACTE, PAS UN CHAMP.
 *
 * Les etapes 1 a 6 ont pose la mecanique complete puis ferme toutes les portes
 * generiques : `track_inventory` et `stock_counted_at` sont exclus des deux
 * allowlists de `shop/products` (etape 6), ce qui rendait les etapes 1-5
 * INERTES -- aucun chemin applicatif ne permettait plus de declarer un
 * comptage. Cette route est ce chemin, et le seul.
 *
 * POURQUOI UNE ROUTE SEPAREE ET NON UN CHAMP DE PLUS.
 * Un `PATCH { track_inventory: true }` serait une DECLARATION sans preuve : la
 * barriere de l'etape 2 exige que `stock_counted_at` AVANCE STRICTEMENT, parce
 * qu'un compteur reactive sur une valeur perimee vend du stock qui n'existe
 * pas. Un comptage n'est pas la mise a jour d'un attribut, c'est l'affirmation
 * d'un fait observe. Le verbe le dit, l'URL le dit, et le corps ne porte que
 * ce fait : `{ units }`.
 *
 * POURQUOI ELLE NE REJOUE AUCUNE REGLE.
 * Elle n'interroge jamais `track_inventory` avant d'agir, ne compare aucune
 * date, ne decide jamais si une transition est licite. Elle transporte une
 * demande vers `enable_stock_tracking()` et TRADUIT le resultat en code HTTP.
 * Dupliquer la barriere ici creerait deux verites concurrentes ; c'est
 * precisement ce que quatre etapes de verrouillage en base ont servi a eviter.
 */

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/shop/products/[id]/inventory  { units: entier >= 0 }
 * -> suit le stock de ce produit, en affirmant un comptage de `units` unites.
 *
 * Idempotent par nature : recompter un produit deja suivi est l'operation
 * NORMALE (reinventaire), pas une erreur. Un double appel accidentel repose
 * donc simplement la meme valeur.
 */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const auth = await requireProductOwner(req, id);
    if ('error' in auth) return auth.error;

    const body = await req.json().catch(() => ({}));
    const units = (body as { units?: unknown }).units;

    // FAIL-CLOSED. `Number.isInteger` refuse `null`, `undefined`, `'5'`, `5.5`,
    // `NaN`, `Infinity` -- aucune coercition, aucun `Number(...)` complaisant :
    // un comptage ambigu n'est pas un comptage. La RPC revalide ces memes
    // bornes cote base (defense en profondeur), mais un 400 explicite vaut
    // mieux qu'un refus metier pour une faute de saisie.
    if (!Number.isInteger(units) || (units as number) < 0) {
      return NextResponse.json(
        { error: 'units doit etre un entier superieur ou egal a 0' },
        { status: 400 }
      );
    }

    const result = await enableStockTracking(id, units as number);

    if (!result.ok) {
      // Une panne de transport n'est pas un refus metier : elle ne dit rien de
      // la legitimite de la demande, et un 409 la ferait passer pour telle.
      if (result.transport) {
        return NextResponse.json({ error: result.reason }, { status: 500 });
      }
      // Traduction, PAS reinterpretation : chaque cause vient de la RPC
      // elle-meme (etape 3), aucune n'est deduite ici.
      if (result.reason.startsWith('INVALID_ARGUMENT')) {
        return NextResponse.json({ error: result.reason }, { status: 400 });
      }
      if (result.reason === 'PRODUCT_NOT_FOUND') {
        return NextResponse.json({ error: 'Product not found' }, { status: 404 });
      }
      // Tout le reste est un refus metier de la base -- au premier chef la
      // barriere `STOCK_TRACKING_REQUIRES_COUNT`. Le message n'est pas
      // reecrit : il vient de la seule autorite qui l'a prononce.
      return NextResponse.json({ error: result.reason }, { status: 409 });
    }

    return NextResponse.json({
      ok: true,
      product_id: id,
      track_inventory: true,
      stock: result.stock,
      stock_counted_at: result.stock_counted_at,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

/**
 * DELETE /api/shop/products/[id]/inventory
 * -> cesse de suivre le stock de ce produit.
 *
 * Aucun corps. `track_inventory = false` SEUL : ni `stock`, ni
 * `stock_counted_at`. La trace du dernier comptage survit deliberement a
 * l'arret du suivi -- c'est elle qui permettra a la barriere de l'etape 2 de
 * juger une future reactivation.
 */
export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const auth = await requireProductOwner(req, id);
    if ('error' in auth) return auth.error;

    const product = await disableStockTracking(id);
    return NextResponse.json({ ok: true, product_id: id, track_inventory: product.track_inventory });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
