import { describe, it, expect, vi, beforeEach } from 'vitest';

// LOT J (Mode 3 global, F-CUSTOM-01/F-CUSTOM-04) -- première couverture de
// cette route (aucune avant ce lot). Verrouille les 2 correctifs :
//   1. `slug` obligatoire + site réel requis (lie l'upload à un tenant).
//   2. SVG retiré des types acceptés.
// et la création de la ligne design_uploads (source de vérité pour
// checkout/route.ts).

const siteSelectMock = vi.fn();
/** LOT 5 -- la projection reellement demandee, et les filtres reellement poses. */
let colonnesDemandees = '';
const filtres: [string, unknown][] = [];
const storageUploadMock = vi.fn();
const getPublicUrlMock = vi.fn();
const designInsertMock = vi.fn();

function makeFrom() {
  return vi.fn((table: string) => {
    if (table === 'sites') {
      // ============================================================
      // LOT 5 / P5-01 -- CE HARNAIS MENTAIT, ET IL A MASQUE UNE PANNE TOTALE.
      //
      // `b.select = () => b` ignorait la liste de colonnes et le fixture
      // rendait `{ id, mode: 2 }`. La route, elle, ne demandait que `id` :
      // en production `site.mode` valait `undefined` et la route refusait
      // TOUT LE MONDE en 403. Un mock plus permissif que PostgREST rend
      // indetectable exactement la classe de defaut qu'il devrait attraper.
      //
      // La projection est desormais HONOREE : seules les colonnes reellement
      // demandees sont rendues, comme PostgREST. Les filtres sont captures
      // pour que leur retrait soit observable.
      // ============================================================
      const b: any = {};
      b.select = (cols?: string) => { colonnesDemandees = typeof cols === 'string' ? cols : ''; return b; };
      b.eq = (col: string, val: unknown) => { filtres.push([col, val]); return b; };
      b.is = (col: string, val: unknown) => { filtres.push([col, val]); return b; };
      b.maybeSingle = async () => {
        const { data, error } = await siteSelectMock();
        if (!data) return { data, error };
        const projete: Record<string, unknown> = {};
        for (const c of colonnesDemandees.split(',').map((x) => x.trim()).filter(Boolean)) {
          if (c in data) projete[c] = data[c];
        }
        return { data: projete, error };
      };
      return b;
    }
    if (table === 'design_uploads') {
      const b: any = {};
      b.insert = (payload: unknown) => designInsertMock(payload);
      return b;
    }
    throw new Error('unexpected table: ' + table);
  });
}

let fromMock: ReturnType<typeof makeFrom>;
vi.mock('@/lib/supabase-admin', () => ({
  get supabaseAdmin() {
    return {
      from: (...a: [string]) => fromMock(...a),
      storage: {
        from: () => ({
          upload: (...a: unknown[]) => storageUploadMock(...a),
          getPublicUrl: (...a: unknown[]) => getPublicUrlMock(...a),
        }),
      },
    };
  },
}));

import { POST } from '../route';

function makeRequest(fields: { file?: { name: string; type: string; size: number }; slug?: string | null }) {
  const fd = new FormData();
  if (fields.file) {
    const bytes = new Uint8Array(fields.file.size);
    const file = new File([bytes], fields.file.name, { type: fields.file.type });
    fd.append('file', file);
  }
  if (fields.slug !== null && fields.slug !== undefined) fd.append('slug', fields.slug);
  return new Request('https://woorri.test/api/shop/upload-design', { method: 'POST', body: fd });
}

beforeEach(() => {
  colonnesDemandees = '';
  filtres.length = 0;
  fromMock = makeFrom();
  siteSelectMock.mockReset().mockResolvedValue({ data: { id: 'site-1', mode: 2 }, error: null });
  storageUploadMock.mockReset().mockResolvedValue({ data: {}, error: null });
  getPublicUrlMock.mockReset().mockReturnValue({ data: { publicUrl: 'https://storage.test/custom-designs/abc.png' } });
  designInsertMock.mockReset().mockResolvedValue({ data: null, error: null });
});

describe('POST /api/shop/upload-design — LOT J (F-CUSTOM-01) : slug obligatoire', () => {
  it('slug absent -> 400, aucun upload storage tenté', async () => {
    const res = await POST(makeRequest({ file: { name: 'a.png', type: 'image/png', size: 100 }, slug: null }));
    expect(res.status).toBe(400);
    expect(storageUploadMock).not.toHaveBeenCalled();
  });

  it('slug ne correspond à aucun site réel (ou site archivé) -> 404, aucun upload storage tenté', async () => {
    siteSelectMock.mockResolvedValue({ data: null, error: null });
    const res = await POST(makeRequest({ file: { name: 'a.png', type: 'image/png', size: 100 }, slug: 'inconnu' }));
    expect(res.status).toBe(404);
    expect(storageUploadMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/shop/upload-design — LOT J (F-CUSTOM-01) : SVG retiré', () => {
  it('image/svg+xml désormais rejeté (Invalid file type)', async () => {
    const res = await POST(makeRequest({ file: { name: 'a.svg', type: 'image/svg+xml', size: 100 }, slug: 'my-shop' }));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toBe('Invalid file type');
    expect(storageUploadMock).not.toHaveBeenCalled();
  });

  it.each(['image/png', 'image/jpeg', 'image/webp'])('%s toujours accepté', async (type) => {
    const res = await POST(makeRequest({ file: { name: 'a.png', type, size: 100 }, slug: 'my-shop' }));
    expect(res.status).toBe(200);
  });
});

describe('POST /api/shop/upload-design — cas nominal', () => {
  it('crée une ligne design_uploads liée au site résolu, avec la bonne public_url', async () => {
    const res = await POST(makeRequest({ file: { name: 'a.png', type: 'image/png', size: 100 }, slug: 'my-shop' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.url).toBe('https://storage.test/custom-designs/abc.png');
    expect(designInsertMock).toHaveBeenCalledWith(expect.objectContaining({
      site_id: 'site-1',
      public_url: 'https://storage.test/custom-designs/abc.png',
      mime_type: 'image/png',
    }));
  });

  it('taille > 10MB -> 400, aucun upload storage tenté', async () => {
    const res = await POST(makeRequest({ file: { name: 'a.png', type: 'image/png', size: 11 * 1024 * 1024 }, slug: 'my-shop' }));
    expect(res.status).toBe(400);
    expect(storageUploadMock).not.toHaveBeenCalled();
  });

  it("l'insertion design_uploads échoue -> 500 (jamais une URL publique renvoyée sans référence tracée)", async () => {
    designInsertMock.mockResolvedValue({ data: null, error: { message: 'insert failed' } });
    const res = await POST(makeRequest({ file: { name: 'a.png', type: 'image/png', size: 100 }, slug: 'my-shop' }));
    expect(res.status).toBe(500);
  });
});

// ============================================================
// LOT 5 / P5-01 -- LA GARDE COMMERCIALE, MESUREE SUR LA PROJECTION REELLE.
//
// La route refusait TOUT LE MONDE en 403 parce qu'elle gardait sur une
// colonne qu'elle ne demandait pas. Ces tests ne peuvent exister que sur un
// harnais qui honore la projection : c'est la seule difference entre « la
// garde marche » et « la garde refuse tout ».
// ============================================================
const reqAvecFichier = (slug = 'ma-boutique') =>
  makeRequest({ file: { name: 'd.png', type: 'image/png', size: 10 }, slug });

describe('POST /api/shop/upload-design — LOT 5 : la garde lit une colonne REELLEMENT demandee', () => {
  it('la projection contient `mode` -- sans quoi la garde est aveugle', async () => {
    siteSelectMock.mockResolvedValue({ data: { id: 'site-1', mode: 3 }, error: null });
    await POST(reqAvecFichier());
    expect(colonnesDemandees).toContain('mode');
  });

  it.each([2, 3])('site Mode %s (commercant) -> upload accepte, ligne design_uploads creee', async (mode) => {
    siteSelectMock.mockResolvedValue({ data: { id: 'site-1', mode }, error: null });
    storageUploadMock.mockResolvedValue({ error: null });
    designInsertMock.mockResolvedValue({ error: null });
    const res = await POST(reqAvecFichier());
    expect(res.status).toBe(200);
    expect(storageUploadMock).toHaveBeenCalled();
    expect(designInsertMock).toHaveBeenCalledWith(expect.objectContaining({ site_id: 'site-1' }));
  });

  it('site Mode 1 (vitrine) -> 403, aucun stockage, aucune ligne', async () => {
    siteSelectMock.mockResolvedValue({ data: { id: 'site-1', mode: 1 }, error: null });
    const res = await POST(reqAvecFichier());
    expect(res.status).toBe(403);
    expect(storageUploadMock).not.toHaveBeenCalled();
    expect(designInsertMock).not.toHaveBeenCalled();
  });

  it('le site est resolu par SON slug -- jamais un site arbitraire', async () => {
    siteSelectMock.mockResolvedValue({ data: { id: 'site-1', mode: 3 }, error: null });
    await POST(reqAvecFichier('ma-boutique'));
    expect(filtres).toContainEqual(['slug', 'ma-boutique']);
    expect(filtres).toContainEqual(['archived_at', null]);
  });
});
