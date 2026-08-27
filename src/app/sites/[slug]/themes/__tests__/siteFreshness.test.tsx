import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import { resolveSiteFreshness } from '../siteFreshness';

// ============================================================
// DEBT-034 — LA FRAICHEUR PUBLIEE SUIT ENFIN LES MODIFICATIONS.
//
// LE DEFAUT MESURE. `sites` n'a aucune colonne de derniere modification, et
// les TROIS surfaces qui publient une fraicheur se rabattaient donc toutes sur
// `created_at`. Les chantiers 3 a 8 ont ouvert a l'agent `lang`, `faq`,
// `whyus`, `area_served`, `price_range`, la galerie, les produits et les
// sections : aucune de ces modifications n'etait visible d'un crawler.
//
// CE FICHIER TESTE LES DEUX ETATS DU SCHEMA, et c'est le point central : la
// migration `supabase/sql/sites_updated_at.sql` est PREPAREE, pas EXECUTEE
// (aucun acces base depuis cet environnement). Le code doit donc etre juste
// AVANT comme APRES -- sans quoi son deploiement dependrait d'un ordre que
// personne ne peut verifier ici.
// ============================================================

let siteRow: Record<string, unknown> | null;
// LOT BLOG 8 -- ces surfaces annoncent desormais le blog : elles importent
// `fetchBlogEntries`, qui charge le client anon au chargement du module.
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({}) } }));
vi.mock('@/app/sites/[slug]/blog/fetchPosts', () => ({ fetchBlogEntries: async () => [] }));

vi.mock('../shared', () => ({
  fetchSite: async () => siteRow,
  resolveSiteBaseUrl: () => 'https://cafeducoin.ca',
  WOORRI_SITE_URL: 'https://www.deribfy.com',
}));
vi.mock('@/app/sites/[slug]/themes/shared', () => ({
  fetchSite: async () => siteRow,
  resolveSiteBaseUrl: () => 'https://cafeducoin.ca',
  WOORRI_SITE_URL: 'https://www.deribfy.com',
}));
vi.mock('@/lib/anomaly', () => ({ logAnomaly: vi.fn() }));

const CREATION = '2024-01-15T10:00:00.000Z';
const MODIFICATION = '2026-08-25T09:30:00.000Z';

/** Une vitrine reelle, reduite a ce que les trois surfaces lisent. */
const VITRINE = {
  id: 'site-1', slug: 'cafeducoin', name: 'Café du Coin',
  slogan: 'Le meilleur espresso', lang: 'fr', mode: 1,
  contact: { phone: '+1 514 555 0199' },
  created_at: CREATION,
};

beforeEach(() => { siteRow = { ...VITRINE }; });

// ------------------------------------------------------------
describe('DEBT-034 — l’autorite unique', () => {
  it('`updated_at` l’emporte quand il existe', () => {
    expect(resolveSiteFreshness({ updated_at: MODIFICATION, created_at: CREATION })).toBe(MODIFICATION);
  });

  it('repli sur `created_at` tant que la colonne n’existe pas', () => {
    expect(resolveSiteFreshness({ created_at: CREATION })).toBe(CREATION);
    expect(resolveSiteFreshness({ updated_at: null, created_at: CREATION })).toBe(CREATION);
  });

  it('aucune valeur inventee quand le site n’en porte aucune', () => {
    // Fail-soft, jamais fail-invent : `now()` affirmerait une modification
    // qui n'a pas eu lieu -- un mensonge envoye aux moteurs.
    expect(resolveSiteFreshness({})).toBeUndefined();
    expect(resolveSiteFreshness({ updated_at: null, created_at: null })).toBeUndefined();
  });

  it('🔴 le module est PUR — aucune dependance, donc aucun mock necessaire', () => {
    const src = readFileSync(join(__dirname, '../siteFreshness.ts'), 'utf-8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
    // C'est ce qui a permis aux 29 tests des deux routes de rester justes
    // sans une ligne de changement : la fonction ne vit pas dans un module
    // que ces tests simulent.
    expect(src).not.toMatch(/^\s*import\s/m);
  });
});

// ------------------------------------------------------------
describe('DEBT-034 — 🔴 les trois surfaces, dans les DEUX etats du schema', () => {
  const ETATS: Array<[string, Record<string, unknown>, string]> = [
    ['AVANT la migration (colonne absente)', {}, CREATION],
    ['APRES, jamais modifie (backfill = created_at)', { updated_at: CREATION }, CREATION],
    ['APRES, modifie par l’agent', { updated_at: MODIFICATION }, MODIFICATION],
  ];

  for (const [etat, extra, attendu] of ETATS) {
    describe(etat, () => {
      beforeEach(() => { siteRow = { ...VITRINE, ...extra }; });

      it('JSON-LD publie cette date en `dateModified`', async () => {
        const { default: JsonLd } = await import('../JsonLd');
        const html = renderToStaticMarkup(
          <JsonLd site={siteRow as never} url="https://cafeducoin.ca" />
        );
        const bloc = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1];
        const data = JSON.parse(bloc.replace(/\\u003c/g, '<').replace(/\\u003e/g, '>').replace(/\\u0026/g, '&'));
        expect(data.dateModified).toBe(attendu);
      });

      it('llms.txt publie cette date', async () => {
        const { GET } = await import('../../llms.txt/route');
        const texte = await (await GET(
          new Request('https://cafeducoin.ca/llms.txt'),
          { params: Promise.resolve({ slug: 'cafeducoin' }) }
        )).text();
        expect(texte).toContain(attendu.split('T')[0]);
      });

      it('le sitemap publie cette date en `<lastmod>`', async () => {
        const { GET } = await import('@/app/api/internal/site-sitemap/[slug]/route');
        const xml = await (await GET(
          new Request('https://cafeducoin.ca/sitemap.xml'),
          { params: Promise.resolve({ slug: 'cafeducoin' }) }
        )).text();
        expect(xml).toContain(`<lastmod>${attendu}</lastmod>`);
      });
    });
  }

  it('🔴 CONTROLE POSITIF — la modification est REELLEMENT distinguee de la creation', () => {
    // Sans cette assertion, les trois etats ci-dessus passeraient encore si le
    // code ignorait `updated_at` et publiait toujours `created_at` : deux des
    // trois etats attendent justement `CREATION`.
    expect(MODIFICATION).not.toBe(CREATION);
    expect(resolveSiteFreshness({ updated_at: MODIFICATION, created_at: CREATION }))
      .not.toBe(CREATION);
  });
});

// ------------------------------------------------------------
describe('DEBT-034 — 🔒 CLIQUET : aucune surface ne republie `created_at` en direct', () => {
  const SURFACES: Array<[string, string]> = [
    ['JSON-LD', 'src/app/sites/[slug]/themes/JsonLd.tsx'],
    ['llms.txt', 'src/app/sites/[slug]/llms.txt/route.ts'],
    ['sitemap', 'src/app/api/internal/site-sitemap/[slug]/route.ts'],
  ];
  const RACINE = join(__dirname, '../../../../../..');

  for (const [nom, chemin] of SURFACES) {
    it(`${nom} demande la fraicheur, il ne la decide plus`, () => {
      const src = readFileSync(join(RACINE, chemin), 'utf-8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
      expect(src, `${nom} doit passer par l'autorite unique`).toContain('resolveSiteFreshness');
      // Recopier `updated_at ?? created_at` dans les trois fichiers
      // rejouerait la faute que `modeCapabilities` et `toolCapabilities` ont
      // servi a defaire : une meme question posee a trois endroits finit par
      // recevoir trois reponses.
      expect(src, `${nom} ne doit plus lire created_at pour la fraicheur`)
        .not.toMatch(/\bsite\.created_at\b/);
    });
  }
});

// ------------------------------------------------------------
describe('DEBT-034 — 🔒 la migration preparee dit ce qu’elle fait', () => {
  const SQL = readFileSync(
    join(__dirname, '../../../../../..', 'supabase/sql/sites_updated_at.sql'), 'utf-8'
  );

  it('elle est ADDITIVE — aucun DROP de table, de colonne ni de donnee', () => {
    expect(SQL).not.toMatch(/DROP\s+TABLE/i);
    expect(SQL).not.toMatch(/DROP\s+COLUMN/i);
    expect(SQL).not.toMatch(/\bDELETE\s+FROM/i);
    expect(SQL).not.toMatch(/\bTRUNCATE\b/i);
  });

  it('elle est IDEMPOTENTE — re-executable sans effet de bord', () => {
    expect(SQL).toMatch(/ADD COLUMN IF NOT EXISTS updated_at/);
    expect(SQL).toMatch(/WHERE updated_at IS NULL/);
    expect(SQL).toMatch(/CREATE OR REPLACE FUNCTION/);
    expect(SQL).toMatch(/DROP TRIGGER IF EXISTS trg_sites_touch_updated_at/);
  });

  it('le backfill vaut `created_at`, JAMAIS `now()`', () => {
    // `now()` affirmerait que tous les sites viennent d'etre modifies -- un
    // mensonge envoye aux moteurs des le lendemain de la migration.
    expect(SQL).toMatch(/SET updated_at = created_at/);
    expect(SQL).not.toMatch(/SET updated_at = now\(\)/);
  });

  // ------------------------------------------------------------
  // LA RECREATION DE LA VUE EST LE POINT LE PLUS RISQUE DU SCRIPT.
  //
  // `CREATE OR REPLACE VIEW` peut changer `security_invoker`, et une premiere
  // redaction de cette migration portait `true` la ou la vue en place porte
  // `false`. La difference n'est pas cosmetique : avec `true`, la vue evalue
  // la RLS de `sites` sous l'identite de L'APPELANT, or la seule policy SELECT
  // de cette table est `TO authenticated USING (owner_id = auth.uid())` --
  // aucune pour `anon`. La vitrine publique, servie par le client anon, aurait
  // recu ZERO LIGNE sur chaque site. Le defaut a ete vu avant execution ; ce
  // cliquet existe pour qu'il ne puisse pas revenir.
  // ------------------------------------------------------------
  const VUE_EN_PLACE = readFileSync(
    join(__dirname, '../../../../../..', 'supabase/sql/sites_public_view.sql'), 'utf-8'
  );

  /** (security_invoker, colonnes) d'une definition de `sites_public`. */
  function definitionVue(sql: string): [string, string[]] {
    const m = sql.match(
      /CREATE OR REPLACE VIEW public\.sites_public\s*\n?WITH \(security_invoker = (\w+)\)\s*\n?AS\s*\n?SELECT([\s\S]*?)FROM public\.sites/
    );
    expect(m, 'definition de sites_public introuvable — extraction a revoir').toBeTruthy();
    return [m![1], m![2].replace(/\n/g, ' ').split(',').map((c) => c.trim()).filter(Boolean)];
  }

  it('🔴 `security_invoker` est IDENTIQUE a la vue en place', () => {
    const [enPlace] = definitionVue(VUE_EN_PLACE);
    const [migration] = definitionVue(SQL);
    expect(migration, 'changer security_invoker mettrait toutes les vitrines hors ligne')
      .toBe(enPlace);
    expect(migration, 'la vue doit contourner la RLS de l’appelant').toBe('false');
  });

  it('🔴 les colonnes existantes sont reprises A L’IDENTIQUE et dans le MEME ORDRE', () => {
    // PostgreSQL refuse toute omission ou reordonnancement dans un
    // `CREATE OR REPLACE VIEW` : le script echouerait. Mais une colonne
    // silencieusement retiree de la vitrine serait pire qu'une erreur.
    const [, enPlace] = definitionVue(VUE_EN_PLACE);
    const [, migration] = definitionVue(SQL);
    expect(migration.slice(0, enPlace.length)).toEqual(enPlace);
    expect(migration.slice(enPlace.length), 'ajout en fin uniquement').toEqual(['updated_at']);
  });

  it('la vue publique expose la colonne — sinon la vitrine ne la verrait jamais', () => {
    // `fetchSite` interroge `sites_public` en `select('*')` : une colonne
    // absente de la vue reste invisible meme si elle existe sur la table.
    const vue = SQL.match(/CREATE OR REPLACE VIEW public\.sites_public[\s\S]*?FROM public\.sites/)![0];
    expect(vue).toContain('updated_at');
  });

  it('le declencheur est PORTE SUR DES COLONNES, jamais sur tout UPDATE', () => {
    // Un declencheur nu ferait bouger la fraicheur a chaque ecriture de
    // comptabilite interne (les crons de domaine touchent
    // `custom_domain_google_*` sans que le contenu ait change d'un mot).
    expect(SQL).toMatch(/BEFORE UPDATE OF/);
    const decl = SQL.match(/BEFORE UPDATE OF([\s\S]*?)ON public\.sites/)![1];
    expect(decl).not.toMatch(/custom_domain_google/);
    expect(decl).toMatch(/\bfaq\b/);
    expect(decl).toMatch(/\bsections\b/);
  });

  it('🔴 `updated_at` n’est PAS accordee en UPDATE au marchand', () => {
    // Elle est posee par le declencheur : l'accorder permettrait de falsifier
    // la fraicheur publiee aux moteurs.
    expect(SQL).not.toMatch(/GRANT UPDATE[^;]*updated_at/i);
  });
});
