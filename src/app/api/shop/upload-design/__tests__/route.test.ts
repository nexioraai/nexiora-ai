import { describe, it, expect, vi, beforeEach } from 'vitest';

// LOT J (Mode 3 global, F-CUSTOM-01/F-CUSTOM-04) -- première couverture de
// cette route (aucune avant ce lot). Verrouille les 2 correctifs :
//   1. `slug` obligatoire + site réel requis (lie l'upload à un tenant).
//   2. SVG retiré des types acceptés.
// et la création de la ligne design_uploads (source de vérité pour
// checkout/route.ts).

const siteSelectMock = vi.fn();
const storageUploadMock = vi.fn();
const getPublicUrlMock = vi.fn();
const designInsertMock = vi.fn();

function makeFrom() {
  return vi.fn((table: string) => {
    if (table === 'sites') {
      const b: any = {};
      b.select = () => b;
      b.eq = () => b;
      b.is = () => b;
      b.maybeSingle = async () => siteSelectMock();
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
  fromMock = makeFrom();
  siteSelectMock.mockReset().mockResolvedValue({ data: { id: 'site-1' }, error: null });
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
