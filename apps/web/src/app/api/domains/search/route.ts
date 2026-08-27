import { NextRequest, NextResponse } from 'next/server';
import { supabase as supabaseAnon } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkDomain, getRegistrationRequirements } from '@/lib/domains/porkbun';
import { consommerJeton } from '@/lib/rate-limit/rateLimit';
import { estDomaineReserve } from '@/lib/domains/reserved';

// Porkbun limite checkDomain a 1 appel toutes les 10 secondes, pour tout le
// compte. Le verrou est donc global et vit en base, pas en memoire : sur
// Vercel chaque requete peut atterrir sur une instance differente.
const RATE_LIMIT_MS = 10_000;
const LOCK_KEY = 'porkbun-checkdomain-last';

// ============================================================
// D-04 -- LE VERROU S'OUVRAIT EN PANNE, ET UN SEUL COMPTE POUVAIT AFFAMER
// TOUT LE PARC.
//
// DEUX DEFAUTS DISTINCTS, DEUX CORRECTIONS DISTINCTES.
//
// 1. FAIL-OPEN. `const { data } = await ...` ne lisait jamais `error`. Sur
//    panne de base, `data` vaut `null`, donc `last` vaut 0, donc `elapsed`
//    vaut la duree depuis 1970 : le verrou s'ouvrait TOUJOURS, au moment
//    precis ou l'on peut le moins se le permettre. C'est le meme defaut
//    systemique que les six compteurs corriges au LOT 6 -- celui-ci avait
//    echappe au balayage parce qu'il lit `data`, pas `count`.
//
// 2. PORTEE. Le verrou global est CORRECT et doit rester : le registraire
//    limite l'appel a un toutes les dix secondes POUR TOUT LE COMPTE. Ce
//    n'est pas un choix, c'est une contrainte externe. Mais rien ne bornait
//    un compte individuel : un seul utilisateur pouvait prendre chaque
//    creneau indefiniment et priver tous les autres de la recherche.
//
// La correction ajoute donc un quota PAR COMPTE devant le verrou global, sans
// toucher a ce dernier. L'espacement protege le registraire ; le quota
// garantit qu'aucun compte ne monopolise les creneaux.
// ============================================================

/** Nombre de recherches autorisees par compte et par minute. */
const PLAFOND_PAR_COMPTE_PAR_MINUTE = 10;

type EtatVerrou =
  | { ok: true }
  | { ok: false; statut: 429; attenteMs: number }
  | { ok: false; statut: 503 };

async function verrouGlobal(): Promise<EtatVerrou> {
  const { data, error } = await supabaseAdmin
    .from('cron_state')
    .select('value')
    .eq('key', LOCK_KEY)
    .maybeSingle();

  // LA PANNE FERME. Un verrou qui ne sait pas repondre ne peut pas autoriser
  // une depense chez le registraire.
  if (error) return { ok: false, statut: 503 };

  const last = Number((data?.value as { at?: unknown } | null)?.at ?? 0);
  const elapsed = Date.now() - last;
  if (elapsed >= RATE_LIMIT_MS) return { ok: true };
  return { ok: false, statut: 429, attenteMs: RATE_LIMIT_MS - elapsed };
}

async function markCall(): Promise<void> {
  await supabaseAdmin.from('cron_state').upsert({
    key: LOCK_KEY,
    value: { at: Date.now() },
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' });
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
  const { data: { user }, error: authErr } = await supabaseAnon.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  const { domain } = await req.json().catch(() => ({ domain: '' }));
  if (typeof domain !== 'string' || !/^[a-z0-9-]+\.[a-z]{2,}$/i.test(domain.trim())) {
    return NextResponse.json({ error: 'Nom de domaine invalide' }, { status: 400 });
  }
  const clean = domain.trim().toLowerCase();

  // D-07 -- un domaine reserve n'est jamais « disponible ». Refuser ici evite
  // aussi de consommer un creneau du registraire pour rien.
  if (estDomaineReserve(clean)) {
    return NextResponse.json({ domain: clean, available: false, reason: 'domaine_reserve' });
  }

  const tld = clean.split('.').pop() || '';

  // Deja pris dans Nexiora ? Aucun appel API necessaire.
  const { data: taken, error: erreurTaken } = await supabaseAdmin
    .from('site_domains')
    .select('id')
    .eq('domain', clean)
    .maybeSingle();
  // AUDIT AGRESSIF / TOUR 2 -- le dernier controle encore ouvert. En panne, un
  // domaine DEJA reserve par Deribfy etait annonce « disponible » : on
  // promettait un domaine qu'on ne peut pas vendre, et le creneau du
  // registraire etait consomme pour rien.
  if (erreurTaken) {
    return NextResponse.json({ error: 'Service momentanement indisponible.' }, { status: 503 });
  }
  if (taken) {
    return NextResponse.json({ domain: clean, available: false, reason: 'deja_reserve' });
  }

  // ORDRE VOULU : l'espacement global est une LECTURE, il ne consomme rien.
  // Un appelant refuse par lui ne perd donc aucun jeton. Le quota par compte
  // vient ensuite, juste avant la depense reelle.
  const verrou = await verrouGlobal();
  if (!verrou.ok) {
    return verrou.statut === 503
      ? NextResponse.json({ error: 'Service momentanement indisponible.' }, { status: 503 })
      : NextResponse.json({ error: 'Trop de recherches', retryAfterMs: verrou.attenteMs }, { status: 429 });
  }

  const jeton = await consommerJeton({
    type: 'domain_search_request',
    siteId: null,
    perimetreSupplementaire: { colonne: 'details->>user_id', valeur: user.id },
    fenetreMs: 60_000,
    plafond: PLAFOND_PAR_COMPTE_PAR_MINUTE,
    message: 'Trop de recherches, reessayez dans une minute.',
    details: { user_id: user.id },
  });
  if (!jeton.ok) {
    return NextResponse.json({ error: jeton.erreur }, { status: jeton.statut });
  }

  try {
    await markCall();
    const [check, reqs] = await Promise.all([
      checkDomain(clean),
      getRegistrationRequirements(tld).catch(() => ({ apiRegisterable: false, registrationDurationYears: null })),
    ]);
    return NextResponse.json({
      ...check,
      apiRegisterable: reqs.apiRegisterable,
      // .ca, .us, .eu, .au : eligibilite registre non soumissible par API.
      reason: reqs.apiRegisterable ? null : 'tld_non_automatisable',
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
