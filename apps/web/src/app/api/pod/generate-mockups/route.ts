import { NextResponse } from 'next/server';
import { createHash } from 'crypto';

export const maxDuration = 300;
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSiteOwner } from '@/lib/auth/require-site-owner';
import { isOwnPodDesignUrl } from '@/lib/mode3/podBrandMockups';
import { logAnomaly } from '@/lib/anomaly';

const POSITION = {
  area_width: 1800,
  area_height: 2400,
  width: 1800,
  height: 1800,
  top: 300,
  left: 0,
};

async function pfFetch(path: string, init?: RequestInit): Promise<any> {
  const token = process.env.PRINTFUL_API_TOKEN || '';
  const storeId = process.env.PRINTFUL_STORE_ID || '';
  const res = await fetch(`https://api.printful.com${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(storeId ? { 'X-PF-Store-Id': storeId } : {}),
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Printful ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()).result;
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

const MAX_CAS_ATTEMPTS = 5;

// Audit Mode 3/POD BRAND, perfectionnement -- cause racine : CREATE et POLL
// font tous les deux un read-modify-write sur la MEME colonne JSONB
// pod_designs (lue une fois via requireSiteOwner) sans aucune garde. Deux
// appels concurrents (ex: deux onglets, ou CREATE et POLL en parallele) sur
// le meme site peuvent donc s'ecraser mutuellement ("lost update") : un
// pending_task_keys fraichement ajoute par l'un peut disparaitre si
// l'ecriture de l'autre le remplace en se basant sur une lecture perimee --
// ce qui ferait ensuite rejeter, a tort, un poll legitime pour ce task_key
// par le filtre d'autorisation ajoute plus haut. Prouve live (test jetable,
// donnees supprimees, aucune donnee reelle touchee) que Postgres/PostgREST
// comparent bien pod_designs par egalite JSONB profonde via .eq() -- une
// ecriture basee sur un instantane perime est reellement rejetee (0 ligne
// affectee), jamais fusionnee ni silencieusement perdue. En cas de conflit,
// on relit la valeur reelle et on reapplique la MEME transformation dessus
// (jamais un simple "retry aveugle" du payload perime), jusqu'a
// MAX_CAS_ATTEMPTS tentatives.
async function writePodDesignsCAS(
  siteId: string,
  initialSnapshot: any[],
  computeNext: (current: any[]) => any[]
): Promise<boolean> {
  let snapshot = initialSnapshot;
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
    const next = computeNext(snapshot);
    const { data } = await supabaseAdmin
      .from('sites')
      .update({ pod_designs: next })
      .eq('id', siteId)
      .eq('pod_designs', JSON.stringify(snapshot))
      .select('id')
      .maybeSingle();
    if (data) return true;
    const { data: fresh } = await supabaseAdmin
      .from('sites')
      .select('pod_designs')
      .eq('id', siteId)
      .maybeSingle();
    snapshot = Array.isArray(fresh?.pod_designs) ? fresh.pod_designs : [];
  }
  return false;
}

export async function POST(req: Request) {
  try {
    const { slug, action, task_keys, index: bodyIndex } = await req.json();
    if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 });

    // Audit Mode 3/POD BRAND, lot mockups (cause racine : aucune authentification
    // ni verification de propriete n'existait sur cette route -- n'importe quel
    // appelant non authentifie pouvait declencher un appel Printful reel facture
    // (create-task) sur N'IMPORTE QUELLE boutique via son slug, et le mode poll
    // ecrivait le resultat dans pod_designs.mockups du slug fourni dans le corps
    // de la requete, independamment du site pour lequel le task_key avait
    // reellement ete cree -- une injection croisee entre boutiques etait donc
    // possible. requireSiteOwner() est le meme garde-fou deja utilise par
    // catalog/enhance et catalog/curate pour ce type d'action facturee.
    const auth = await requireSiteOwner(req, slug, 'id, pod_designs, dropship_type');
    if (!auth.ok) return auth.response;
    const ownedSite = auth.site as { id: string; pod_designs: any; dropship_type: string | null };

    // ---- POLL mode ----
    if (action === 'poll' && Array.isArray(task_keys)) {
      // Audit Mode 3/POD BRAND, perfectionnement -- requireSiteOwner()
      // protège QUI peut déclencher un poll pour ce slug, mais rien ne liait
      // jusqu'ici un task_key precis au site qui l'a réellement créé. Un
      // marchand possédant plusieurs sites aurait pu polleur le task_key
      // d'un site A en ciblant un site B (confusion de données, pas une
      // fuite inter-tenant, les deux lui appartenant) -- et si les task_key
      // Printful s'avéraient devinables (non vérifiable sans créer une
      // vraie tâche facturée), un tiers aurait pu tenter de récupérer le
      // résultat d'un task_key appartenant à un autre marchand en ciblant
      // son propre site. task_keys est desormais filtre contre la liste des
      // taches reellement en attente pour CE site, persistee lors de leur
      // creation (pending_task_keys sur pod_designs[0]).
      //
      // Fermeture DEBT-017 (swap design pendant le polling) -- cause racine :
      // pending_task_keys ne stockait QUE le task_key (string), jamais le
      // design pour lequel la tache avait ete lancee. Le poll relisait donc
      // "le design actuel" (pod_designs[0].url AU MOMENT DU POLL) pour
      // etiqueter le resultat -- si le marchand changeait de design entre le
      // CREATE et la fin du poll, un mockup rendu avec l'ANCIEN visuel se
      // retrouvait etiquete comme appartenant au NOUVEAU. Solution retenue
      // (association immuable, pas un verrou ni un compteur de generation) :
      // chaque entree de pending_task_keys porte desormais le design_url
      // CAPTURE au moment de la creation de la tache (voir plus bas, mode
      // CREATE) -- source de verite portee par la tache elle-meme, jamais
      // relue depuis un etat mutable au moment de la resolution. Un resultat
      // dont le design capture ne correspond plus au design actuellement
      // actif est purement et simplement ECARTE (jamais mislabelise) : le
      // marchand le voit comme "pas encore genere pour ce design", ce qui
      // est litteralement vrai. Retro-compatible avec d'anciennes entrees au
      // format string (design_url alors inconnu -> ne matchera jamais un
      // design_url reel, donc simplement ecartees sans crash).
      const designsForFilter = Array.isArray(ownedSite.pod_designs) ? ownedSite.pod_designs : [];
      const rawPendingEntries: unknown[] = Array.isArray(designsForFilter[0]?.pending_task_keys)
        ? designsForFilter[0].pending_task_keys
        : [];
      const normalizePendingEntry = (e: unknown): { task_key: string; design_url: string } | null => {
        if (typeof e === 'string') return { task_key: e, design_url: '' };
        if (e && typeof e === 'object' && typeof (e as any).task_key === 'string') {
          return { task_key: (e as any).task_key, design_url: typeof (e as any).design_url === 'string' ? (e as any).design_url : '' };
        }
        return null;
      };
      const pendingMap = new Map<string, string>(
        rawPendingEntries.map(normalizePendingEntry).filter((e): e is { task_key: string; design_url: string } => e !== null)
          .map((e) => [e.task_key, e.design_url])
      );
      const authorizedTaskKeys = task_keys.filter((tk: any) => pendingMap.has(tk?.task_key));

      const results: any[] = [];
      const pending: string[] = [];
      const errors: string[] = [];
      const resolvedTaskKeys = new Set<string>(); // completes ou échoue -- à retirer de pending_task_keys

      await Promise.all(
        authorizedTaskKeys.map(async (tk: any) => {
          try {
            const poll = await pfFetch(`/mockup-generator/task?task_key=${tk.task_key}`);
            if (poll.status === 'completed' && poll.mockups?.[0]) {
              resolvedTaskKeys.add(tk.task_key);
              const m = poll.mockups[0];
              // Lookup price from catalog
              const { data: cpRow } = await supabaseAdmin
                .from('catalog_products')
                .select('id, supplier_id, price, currency, shipping_days_min, shipping_days_max')
                .eq('supplier_id', 'printful')
                .eq('supplier_product_id', String(tk.variant_id))
                .single();
              results.push({
                product_name: tk.name,
                product_id: tk.product_id,
                variant_id: tk.variant_id,
                catalog_product_id: cpRow?.id ?? null,
                supplier_id: cpRow?.supplier_id ?? 'printful',
                mockup_url: m.mockup_url,
                extra: (m.extra || []).map((e: any) => ({ title: e.title, url: e.url })),
                price: cpRow?.price ?? null,
                currency: cpRow?.currency ?? 'USD',
                shipping_days_min: cpRow?.shipping_days_min ?? null,
                shipping_days_max: cpRow?.shipping_days_max ?? null,
                created_at: new Date().toISOString(),
                // Design capture au moment de la CREATE -- jamais relu depuis
                // un etat mutable ici, voir commentaire ci-dessus (DEBT-017).
                design_url: pendingMap.get(tk.task_key) || '',
              });
            } else if (poll.status === 'failed') {
              resolvedTaskKeys.add(tk.task_key);
              errors.push(`${tk.name}: ${poll.error || 'failed'}`);
            } else {
              pending.push(tk.task_key); // reste dans pending_task_keys, retenté au prochain poll
            }
          } catch (err: any) {
            // Erreur réseau/Printful transitoire : ne retire PAS de
            // pending_task_keys -- un prochain poll doit pouvoir reessayer
            // ce task_key legitimement lie a ce site.
            errors.push(`${tk.name}: ${err.message}`);
          }
        })
      );

      // Site deja recupere et verifie (ownedSite) : current design URL
      // necessaire pour le hashing + tagging.
      const designs = Array.isArray(ownedSite.pod_designs) ? ownedSite.pod_designs : [];
      const currentDesignUrl = designs[0]?.url || '';
      // DEBT-017 : un resultat dont le design capture a la creation ne
      // correspond plus au design actuellement actif appartient a un
      // design que le marchand a deja abandonne -- ecarte, jamais
      // sauvegarde ni mislabelise. La tache reste neanmoins "resolue" (deja
      // dans resolvedTaskKeys) : elle sort bien de pending_task_keys.
      // Calcule une seule fois, reutilise pour l'ecriture ET la reponse.
      const freshResults = results.filter((r: any) => r.design_url === currentDesignUrl);
      const staleResults = results.filter((r: any) => r.design_url !== currentDesignUrl);
      if (staleResults.length > 0) {
        console.warn(
          `generate-mockups poll: ${staleResults.length} résultat(s) écarté(s) (design changé pendant le polling) pour site ${ownedSite.id}`
        );
      }

      // Ecrit dès qu'il y a un résultat à sauvegarder OU une tâche résolue à
      // retirer de pending_task_keys -- sinon une tâche définitivement
      // échouée resterait indéfiniment "en attente" côté base, jamais
      // nettoyée (results peut être vide alors que resolvedTaskKeys ne
      // l'est pas : cas d'un échec Printful sans aucun succès ce passage).
      if (results.length > 0 || resolvedTaskKeys.size > 0) {
        const designHash = createHash('md5').update(currentDesignUrl).digest('hex').slice(0, 8);
        // Download mockup images to Supabase Storage (permanent URLs) --
        // uniquement pour les résultats encore pertinents (freshResults) :
        // inutile de payer le coût de stockage d'un mockup déjà écarté.
        const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        for (const m of freshResults) {
          const urls = [
            { key: 'mockup_url', url: m.mockup_url },
            ...((m.extra || []).map((e: any, ei: number) => ({ key: `extra_${ei}`, url: e.url }))),
          ];
          for (const item of urls) {
            try {
              const imgRes = await fetch(item.url);
              if (!imgRes.ok) continue;
              const buf = Buffer.from(await imgRes.arrayBuffer());
              const ext = item.url.includes('.png') ? 'png' : 'jpg';
              const storagePath = `${slug}/${designHash}-${m.product_id}-${m.variant_id}-${item.key}.${ext}`;
              await supabaseAdmin.storage.from('pod-designs').upload(storagePath, buf, {
                contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
                upsert: true,
              });
              const permUrl = `${sbUrl}/storage/v1/object/public/pod-designs/${storagePath}`;
              if (item.key === 'mockup_url') {
                m.mockup_url = permUrl;
              } else {
                const idx = parseInt(item.key.split('_')[1]);
                if (m.extra?.[idx]) m.extra[idx].url = permUrl;
              }
            } catch (e) {
              console.error('Mockup upload error:', e);
            }
          }
        }

        // computeNext est réappliquée à chaque tentative sur la valeur
        // REELLE la plus récente (pas seulement sur `designs`, l'instantané
        // de début de requête) -- une éventuelle écriture concurrente
        // (ex: CREATE ayant ajouté un nouveau pending_task_keys entre-temps)
        // est donc préservée plutôt qu'écrasée par cette réponse poll.
        const computeNext = (currentDesigns: any[]) => currentDesigns.map((d: any, i: number) => {
          if (i === 0) {
            const existing = Array.isArray(d.mockups) ? d.mockups : [];
            const newKeys = new Set(freshResults.map((r: any) => `${r.product_id}-${r.variant_id}`));
            // Purge mockups from previous designs + duplicates of new results
            const kept = existing.filter((m: any) =>
              m.design_url === currentDesignUrl && !newKeys.has(`${m.product_id}-${m.variant_id}`)
            );
            // Retire les task_keys résolus (complétés ou définitivement
            // échoués) de pending_task_keys -- ceux encore réellement
            // pending côté Printful (variable `pending` ci-dessus) restent,
            // pour être retentés au prochain appel poll. Normalise a la
            // volee un eventuel format legacy (string) rencontre en base.
            const rawExistingPending: unknown[] = Array.isArray(d.pending_task_keys) ? d.pending_task_keys : [];
            const remainingPending = rawExistingPending
              .map(normalizePendingEntry)
              .filter((e): e is { task_key: string; design_url: string } => e !== null && !resolvedTaskKeys.has(e.task_key));
            return { ...d, mockups: [...kept, ...freshResults], pending_task_keys: remainingPending };
          }
          return d;
        });
        const written = await writePodDesignsCAS(ownedSite.id, designs, computeNext);
        if (!written) {
          // Contention persistante et improbable (5 tentatives CAS
          // consécutives en échec) -- le task_key résolu reste dans
          // pending_task_keys côté DB (rien n'a été écrit), donc un
          // PROCHAIN poll naturel le retentera : dégradation sans perte de
          // données, jamais un faux "done" silencieusement non persisté.
          console.error(`generate-mockups poll: CAS write abandonnée après ${MAX_CAS_ATTEMPTS} tentatives pour site ${ownedSite.id}`);
        }
      }

      return NextResponse.json({
        status: pending.length > 0 ? 'pending' : 'done',
        generated: freshResults.length,
        pending: pending.length,
        errors,
        mockups: freshResults.map(m => ({ name: m.product_name, url: m.mockup_url })),
      });
    }

    // ---- CREATE mode ----
    // Site deja recupere et verifie (ownedSite).
    //
    // Audit Mode 3 global (N13) -- cette branche declenche un appel Printful
    // REEL et FACTURE (create-task, plus bas) des lors qu'un design existe
    // dans pod_designs, sans jamais verifier que le site est effectivement
    // pod_brand. Combine au fait que pod_designs est ecrivable sur n'importe
    // quel site via updateOwnedSite (N12, ownership seul, aucun lien a
    // dropship_type), n'importe quel proprietaire de site -- Mode 1, Mode 2,
    // ou Mode 3 reseller/pod_custom -- pouvait forcer un appel Printful
    // facture sans aucun rapport avec un vrai site pod_brand. Garde
    // fail-closed : seul pod_brand declenche cette depense.
    if (ownedSite.dropship_type !== 'pod_brand') {
      return NextResponse.json({ error: 'Cette action est réservée aux boutiques POD Brand.' }, { status: 403 });
    }
    const designs = Array.isArray(ownedSite.pod_designs) ? ownedSite.pod_designs : [];
    if (designs.length === 0) return NextResponse.json({ error: 'No designs uploaded' }, { status: 400 });
    // LE DESIGN ACTIF, NOMME. Le corps de requete porte `index`, qui est un
    // index de PRODUIT (`idx >= todo.length` plus bas), jamais de design :
    // cette route genere toujours pour le design actif, c'est-a-dire le
    // premier du tableau -- convention rendue explicite au LOT 3 (l'editeur
    // ajoute desormais en tete et l'etiquette « Actif »). On la nomme au lieu
    // de la subir.
    const designActif = designs[0];
    const designUrl = designActif.url;
    if (!designUrl) return NextResponse.json({ error: 'Design URL missing' }, { status: 400 });

    // ============================================================
    // LOT 3 / L3-04 -- LE DESIGN DOIT APPARTENIR A CE SITE, ICI AUSSI.
    //
    // CE QUI MANQUAIT. La liaison locataire n'existait qu'au CHECKOUT. Or
    // c'est ICI que la premiere depense a lieu : `designUrl` part quelques
    // lignes plus bas dans `image_url` d'un `create-task` Printful REEL ET
    // FACTURE. Et sa valeur vient de `sites.pod_designs`, colonne du GRANT
    // UPDATE des 41 : le marchand l'ecrit DIRECTEMENT en PostgREST. Rien
    // n'empechait donc de faire payer a la plateforme le rendu d'une image
    // arbitraire -- y compris le design d'une AUTRE boutique.
    //
    // MEME REGLE, MEME DEFINITION : `isOwnPodDesignUrl`, l'unique definition
    // du format `pod-designs/<slug>/`, deja consommee par le checkout. Aucune
    // seconde definition, aucun schema nouveau.
    //
    // FAIL-CLOSED ET AVANT TOUTE DEPENSE : le refus precede la lecture du
    // catalogue et tout appel fournisseur.
    // ============================================================
    if (!isOwnPodDesignUrl(designUrl, slug)) {
      await logAnomaly({
        type: 'pod_brand_design_foreign_url',
        siteId: ownedSite.id,
        slug,
        details: { phase: 'generate-mockups' },
      });
      return NextResponse.json(
        { error: 'Ce design n’appartient pas à cette boutique.' },
        { status: 403 }
      );
    }

    // 1. Get selected products from pod_designs or fallback to auto
    const selectedProducts = designActif?.selected_products || {};
    const selectedIds = Object.entries(selectedProducts)
      .filter(([_, v]: [string, any]) => v.selected)
      .map(([id]: [string, any]) => id);

    let query = supabaseAdmin
      .from('catalog_products')
      .select('supplier_product_id, supplier_parent_id, name')
      .eq('supplier_id', 'printful')
      .eq('in_stock', true)
      .not('supplier_parent_id', 'is', null);

    if (selectedIds.length > 0) {
      query = query.in('supplier_parent_id', selectedIds);
    }

    const { data: catProducts } = await query.limit(1000);

    if (!catProducts || catProducts.length === 0) {
      return NextResponse.json({ error: 'No Printful products found. Select products or run sync.' }, { status: 400 });
    }

    // 2. Deduplicate by product_id, use merchant-selected variant if available
    const seen = new Set<string>();
    const blanks: { product_id: number; variant_id: number; name: string }[] = [];

    for (const cp of catProducts) {
      if (!cp.supplier_parent_id || seen.has(cp.supplier_parent_id)) continue;
      const sel = selectedProducts[cp.supplier_parent_id];
      const preferredVariant = sel?.variantId ? String(sel.variantId) : null;
      // If merchant selected a specific variant, skip until we find it
      if (preferredVariant && cp.supplier_product_id !== preferredVariant) continue;
      seen.add(cp.supplier_parent_id);
      blanks.push({
        product_id: Number(cp.supplier_parent_id),
        variant_id: Number(cp.supplier_product_id),
        name: cp.name,
      });
    }
    // Second pass: fill in products where preferred variant wasn't found
    for (const cp of catProducts) {
      if (!cp.supplier_parent_id || seen.has(cp.supplier_parent_id)) continue;
      seen.add(cp.supplier_parent_id);
      blanks.push({
        product_id: Number(cp.supplier_parent_id),
        variant_id: Number(cp.supplier_product_id),
        name: cp.name,
      });
    }

    if (blanks.length === 0) {
      return NextResponse.json({ error: 'No unique Printful products found' }, { status: 400 });
    }

    // Skip products that already have a mockup (avoid burning rate limit)
    const existingMockups = Array.isArray(designActif?.mockups) ? designActif.mockups : [];
    const mockedIds = new Set(
      existingMockups
        .filter((m: any) => m.design_url === designUrl)
        .map((m: any) => String(m.product_id))
    );
    const todo = blanks.filter(b => !mockedIds.has(String(b.product_id)));

    if (todo.length === 0) {
      return NextResponse.json({ status: 'all_done', total: blanks.length, already_done: true });
    }

    // 3. Create ONE mockup task (index from frontend)
    const idx = typeof bodyIndex === 'number' ? bodyIndex : 0;
    const errors: string[] = [];

    if (idx >= todo.length) {
      return NextResponse.json({ status: 'all_done', total: todo.length });
    }

    const blank = todo[idx];
    const PLACEMENTS = ['front', 'default', 'front_large', 'embroidery_front', 'embroidery_front_large'];
    let launched = null;

    // Fetch real printfile specs for this product (placement + exact print area)
    let placementsToTry: { placement: string; position: typeof POSITION }[] = [];
    try {
      const pf = await pfFetch(`/mockup-generator/printfiles/${blank.product_id}`);
      const available = Object.keys(pf.available_placements || {});
      const vp = (pf.variant_printfiles || []).find((v: any) => v.variant_id === blank.variant_id)
        || (pf.variant_printfiles || [])[0];
      const filesById = new Map((pf.printfiles || []).map((f: any) => [f.printfile_id, f]));
      // Preferred order first, then any front-like placement the product actually exposes
      const candidates = [
        ...PLACEMENTS.filter(p => available.includes(p)),
        ...available.filter(p => !PLACEMENTS.includes(p) && (p.startsWith('front') || p.startsWith('embroidery_front') || p === 'default')),
      ];
      for (const p of candidates) {
        if (!vp?.placements?.[p]) continue;
        const file: any = filesById.get(vp.placements[p]);
        if (!file) continue;
        // Center the design at 80% of the print area width (square design assumed)
        const w = Math.round(file.width * 0.8);
        const h = w;
        placementsToTry.push({
          placement: p,
          position: {
            area_width: file.width,
            area_height: file.height,
            width: w,
            height: h,
            top: Math.max(0, Math.round((file.height - h) / 2)),
            left: Math.max(0, Math.round((file.width - w) / 2)),
          },
        });
      }
    } catch {
      // printfiles unavailable -> fallback below
    }
    if (placementsToTry.length === 0) {
      placementsToTry = PLACEMENTS.map(p => ({ placement: p, position: POSITION }));
    }

    for (const { placement, position } of placementsToTry) {
      try {
        let task: any = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            task = await pfFetch(`/mockup-generator/create-task/${blank.product_id}`, {
              method: 'POST',
              body: JSON.stringify({
                variant_ids: [blank.variant_id],
                format: 'jpg',
                files: [{
                  placement,
                  image_url: designUrl,
                  position,
                }],
              }),
            });
            break;
          } catch (err: any) {
            if (err.message.includes('429') && attempt < 2) {
              const m = err.message.match(/after (\d+) seconds/);
              const waitS = m ? parseInt(m[1]) + 3 : 63;
              await delay(waitS * 1000);
              continue;
            }
            throw err;
          }
        }
        if (task?.task_key) {
          launched = {
            task_key: task.task_key,
            name: blank.name,
            product_id: blank.product_id,
            variant_id: blank.variant_id,
          };
          break;
        }
      } catch (err: any) {
        if (err.message.includes('not allowed')) continue;
        errors.push(`${blank.name}: ${err.message}`);
        break;
      }
    }

    if (!launched && errors.length === 0) {
      errors.push(`${blank.name}: no compatible placement found`);
    }

    if (launched) {
      // Persiste le task_key comme appartenant à CE site avant de le
      // renvoyer au client -- c'est cette liste que le mode poll consulte
      // pour n'accepter que les task_keys réellement créés pour ce site.
      // computeNext est réappliquée sur la valeur reelle la plus recente a
      // chaque tentative CAS (jamais un ecrasement aveugle d'un instantane
      // perime) : une eventuelle ecriture concurrente (autre CREATE en
      // parallele, ou POLL ayant deja nettoye un autre task_key resolu) est
      // donc preservee.
      //
      // Fermeture DEBT-017 : design_url capture ICI (designUrl, celui
      // reellement envoye a Printful comme image_url quelques lignes plus
      // haut), pas relu depuis pod_designs[0].url au moment du poll -- voir
      // le commentaire detaille en mode POLL. C'est cette association
      // immuable tache<->design qui permet au poll d'ecarter un resultat
      // devenu obsolete plutot que de le mislabeliser.
      const computeNextCreate = (currentDesigns: any[]) => currentDesigns.map((d: any, i: number) => {
        if (i === 0) {
          const existing = Array.isArray(d.pending_task_keys) ? d.pending_task_keys : [];
          return { ...d, pending_task_keys: [...existing, { task_key: launched!.task_key, design_url: designUrl }] };
        }
        return d;
      });
      const written = await writePodDesignsCAS(ownedSite.id, designs, computeNextCreate);
      if (!written) {
        // Contention persistante et improbable (5 tentatives CAS
        // consecutives en echec) : la tache Printful a deja ete creee
        // (facturee) mais son task_key n'a pas pu etre lie a ce site --
        // un poll ulterieur pour ce task_key serait a tort rejete par le
        // filtre d'autorisation. On ne renvoie donc PAS ce task_key au
        // client comme si tout avait reussi -- mieux vaut une tache
        // Printful orpheline (sans consequence, jamais consultee) qu'un
        // faux succes que le client croirait pouvoir suivre.
        console.error(`generate-mockups create: CAS write abandonnee après ${MAX_CAS_ATTEMPTS} tentatives pour site ${ownedSite.id}, task_key ${launched.task_key} non lie`);
        return NextResponse.json({
          error: 'Conflit temporaire lors de la creation de la tache. Veuillez reessayer.',
        }, { status: 503 });
      }
    }

    return NextResponse.json({
      status: 'launched',
      index: idx,
      total: todo.length,
      task: launched,
      errors,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
