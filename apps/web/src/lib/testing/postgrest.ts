// ============================================================
// LOT 6 / CHAINE D -- UN MOCK POSTGREST QUI NE MENT PAS.
//
// LE DEFAUT QU'IL EXISTE POUR EMPECHER. Soixante-neuf harnais du depot
// construisaient leur double ainsi :
//
//     const b: any = {};
//     b.select = () => b;          // <- la projection est IGNOREE
//     b.eq = () => b;              // <- les filtres sont INVISIBLES
//     b.maybeSingle = async () => ({ data: FIXTURE, error: null });
//
// Ce double est PLUS PERMISSIF que le systeme reel sur deux axes, et les deux
// ont deja masque une panne totale en production :
//
//   * LA PROJECTION. PostgREST rend EXACTEMENT les colonnes demandees.
//     `.select('id')` ne rend jamais `mode`. `upload-design` gardait sur
//     `site.mode` sans le demander : en production la garde lisait `undefined`
//     et refusait TOUT LE MONDE en 403, pendant que le harnais -- qui rendait
//     le fixture entier -- affichait du vert. C'est DEBT-068 (P5-01).
//
//   * LES FILTRES. `b.eq = () => b` rend le retrait d'un `.eq('site_id', ...)`
//     strictement inobservable. Une fuite inter-tenant ne casserait aucun test.
//
// CE DOUBLE HONORE LES DEUX. La projection est appliquee comme PostgREST
// l'applique, et chaque filtre pose est capture pour etre asserte.
//
// CE QU'IL NE FAIT PAS, ET C'EST DELIBERE. Il n'evalue PAS les filtres pour
// selectionner des lignes : la table rend ce que le test lui dit de rendre.
// Simuler le moteur de requetes reintroduirait un second systeme a croire.
// Le test assert les filtres POSES ; c'est observable et suffisant.
// ============================================================

export type Filtre = [operateur: string, colonne: string, valeur: unknown];

export type ReponseTable = { data: unknown; error: unknown };

export type TableStub = {
  /** Ce que la table rend. Une fonction recoit les filtres deja poses. */
  reponse: ReponseTable | ((filtres: Filtre[]) => ReponseTable);
};

export type JournalPostgrest = {
  /** Filtres poses, par table. */
  filtres: Record<string, Filtre[]>;
  /** Liste de colonnes reellement demandee, par table. */
  projections: Record<string, string>;
  /** Charges utiles des ecritures, par table. */
  ecritures: Record<string, unknown[]>;
};

/** Applique la projection EXACTEMENT comme PostgREST : seules les colonnes
 *  demandees sortent. `*` ou projection vide rend la ligne entiere. */
export function projeter(donnee: unknown, colonnes: string): unknown {
  if (donnee === null || donnee === undefined) return donnee;
  if (Array.isArray(donnee)) return donnee.map((d) => projeter(d, colonnes));
  if (typeof donnee !== 'object') return donnee;
  const liste = colonnes
    .replace(/\([^)]*\)/g, '')          // les jointures imbriquees restent entieres
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  if (liste.length === 0 || liste.includes('*')) return donnee;

  const source = donnee as Record<string, unknown>;
  const sortie: Record<string, unknown> = {};
  for (const brut of liste) {
    // `catalog_products(id, name)` -> on garde la cle de la relation
    const cle = brut.split(/[\s:]/)[0];
    if (cle in source) sortie[cle] = source[cle];
  }
  // les relations imbriquees sont rendues telles quelles si demandees
  for (const m of colonnes.matchAll(/(\w+)\s*\(/g)) {
    if (m[1] in source) sortie[m[1]] = source[m[1]];
  }
  return sortie;
}

/**
 * Construit un double de `supabaseAdmin.from()` fidele a PostgREST.
 *
 * @param tables  ce que chaque table rend
 * @param journal objet rempli au fil des appels (filtres, projections, ecritures)
 */
export function creerFrom(
  tables: Record<string, TableStub>,
  journal: JournalPostgrest
) {
  return (table: string) => {
    const stub = tables[table];
    if (!stub) throw new Error(`table non prevue par le harnais : ${table}`);
    journal.filtres[table] ??= [];
    journal.ecritures[table] ??= [];

    let colonnes = '';
    const b: Record<string, unknown> = {};

    const poser = (op: string) => (colonne: string, valeur?: unknown) => {
      journal.filtres[table].push([op, colonne, valeur]);
      return b;
    };

    b.select = (cols?: string, _opts?: unknown) => {
      colonnes = typeof cols === 'string' ? cols : '';
      journal.projections[table] = colonnes;
      return b;
    };
    for (const op of ['eq', 'neq', 'is', 'gte', 'lte', 'gt', 'lt', 'in', 'ilike', 'not', 'order', 'limit', 'range']) {
      b[op] = poser(op);
    }
    for (const op of ['insert', 'update', 'upsert', 'delete']) {
      b[op] = (charge?: unknown) => {
        journal.ecritures[table].push({ op, charge });
        return b;
      };
    }

    const resoudre = (): ReponseTable => {
      const r = typeof stub.reponse === 'function' ? stub.reponse(journal.filtres[table]) : stub.reponse;
      return { data: projeter(r.data, colonnes), error: r.error };
    };
    b.maybeSingle = async () => resoudre();
    b.single = async () => resoudre();
    // `head: true` -> le comptage passe par le thenable, comme PostgREST.
    b.then = (suite: (r: unknown) => unknown) => {
      const r = typeof stub.reponse === 'function' ? stub.reponse(journal.filtres[table]) : stub.reponse;
      return Promise.resolve({ ...r, data: projeter(r.data, colonnes) }).then(suite);
    };
    return b;
  };
}

export function journalVierge(): JournalPostgrest {
  return { filtres: {}, projections: {}, ecritures: {} };
}
