import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// ============================================================
// LOT BLOG 5 -- POST /api/blog/posts/[id]/cover.
//
// Ce que ce fichier doit prouver :
//   1. le CHEMIN ne contient aucun caractere venu du client ;
//   2. les controles gratuits precedent la borne, qui precede l'ecriture ;
//   3. un article d'un autre locataire ne fait rien depenser du tout ;
//   4. remplacer une couverture ne laisse pas d'orphelin dans un bucket public.
// ============================================================

const requireArticleOwnerMock = vi.fn();
vi.mock('@/lib/auth/require-article-owner', () => ({
  requireArticleOwner: (...a: unknown[]) => requireArticleOwnerMock(...a),
}));

const jetonMock = vi.fn();
vi.mock('@/lib/rate-limit/rateLimit', () => ({
  consommerJeton: (...a: unknown[]) => jetonMock(...a),
}));

const uploadMock = vi.fn();
const getPublicUrlMock = vi.fn();
const removeMock = vi.fn();
const bucketMock = vi.fn();
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: vi.fn(),
    storage: {
      from: (b: string) => {
        bucketMock(b);
        return {
          upload: (...a: unknown[]) => uploadMock(...a),
          getPublicUrl: (...a: unknown[]) => getPublicUrlMock(...a),
          remove: (...a: unknown[]) => removeMock(...a),
        };
      },
    },
  },
}));

const setPostCoverMock = vi.fn();
vi.mock('@/lib/blog', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  setPostCover: (...a: unknown[]) => setPostCoverMock(...a),
}));

import { POST } from '../route';

const ID = '11111111-1111-4111-8111-111111111111';
const SITE_A = 'aaaaaaaa-1111-4111-8111-111111111111';
const ARTICLE = { id: ID, site_id: SITE_A, title: 'T', cover_storage_path: null };
const ctx = () => ({ params: Promise.resolve({ id: ID }) });

function requete(file: File | null, champ = 'file') {
  const form = new FormData();
  if (file) form.set(champ, file);
  return new Request(`https://x.test/api/blog/posts/${ID}/cover`, {
    method: 'POST',
    headers: { authorization: 'Bearer t' },
    body: form,
  });
}
const image = (type = 'image/png', taille = 1024, nom = 'ma photo.PNG') =>
  new File([new Uint8Array(taille)], nom, { type });

const REFUS_404 = () => ({
  error: new Response(JSON.stringify({ error: 'Article not found' }), { status: 404 }),
});

beforeEach(() => {
  requireArticleOwnerMock.mockReset().mockResolvedValue({ ok: true, article: { ...ARTICLE } });
  jetonMock.mockReset().mockResolvedValue({ ok: true });
  uploadMock.mockReset().mockResolvedValue({ error: null });
  getPublicUrlMock.mockReset().mockReturnValue({ data: { publicUrl: 'https://s.test/pub/blog/x.png' } });
  removeMock.mockReset().mockResolvedValue({ error: null });
  bucketMock.mockReset();
  setPostCoverMock.mockReset().mockImplementation((id, siteId, url, path) =>
    Promise.resolve({ post: { ...ARTICLE, id, site_id: siteId, cover_image: url, cover_storage_path: path }, ancienChemin: null })
  );
});

describe('isolation — un autre locataire ne fait RIEN dépenser', () => {
  it('article d’un autre site -> 404, aucun jeton, aucun téléversement', async () => {
    requireArticleOwnerMock.mockResolvedValue(REFUS_404());
    const r = await POST(requete(image()), ctx());
    expect(r.status).toBe(404);
    expect(jetonMock).not.toHaveBeenCalled();
    expect(uploadMock).not.toHaveBeenCalled();
    expect(setPostCoverMock).not.toHaveBeenCalled();
  });

  it('la garde précède la lecture du corps', async () => {
    requireArticleOwnerMock.mockResolvedValue(REFUS_404());
    const r = await POST(
      new Request(`https://x.test/api/blog/posts/${ID}/cover`, { method: 'POST', body: 'pas du multipart' }),
      ctx()
    );
    expect(r.status).toBe(404);
  });
});

describe('contrôles gratuits — AVANT la borne, AVANT tout octet', () => {
  it('aucun fichier -> 400, aucun jeton', async () => {
    const r = await POST(requete(null), ctx());
    expect(r.status).toBe(400);
    expect(jetonMock).not.toHaveBeenCalled();
  });

  it('champ mal nommé -> 400', async () => {
    expect((await POST(requete(image(), 'fichier'), ctx())).status).toBe(400);
  });

  it('au-delà de 5 Mo -> 400, aucun jeton, aucun téléversement', async () => {
    const r = await POST(requete(image('image/png', 5 * 1024 * 1024 + 1)), ctx());
    expect(r.status).toBe(400);
    expect(jetonMock).not.toHaveBeenCalled();
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('exactement 5 Mo -> accepté (la borne est la limite RÉELLE du bucket)', async () => {
    expect((await POST(requete(image('image/png', 5 * 1024 * 1024)), ctx())).status).toBe(200);
  });

  it('SVG -> 400 : il peut embarquer un script, et le bucket ne l’accepte pas', async () => {
    const r = await POST(requete(image('image/svg+xml')), ctx());
    expect(r.status).toBe(400);
    expect(jetonMock).not.toHaveBeenCalled();
  });

  const REFUSES = ['application/pdf', 'text/html', 'image/tiff', 'application/octet-stream', ''];
  for (const t of REFUSES) {
    it(`type « ${t || '(vide)'} » -> 400, aucune dépense`, async () => {
      expect((await POST(requete(image(t)), ctx())).status).toBe(400);
      expect(uploadMock).not.toHaveBeenCalled();
    });
  }

  const ACCEPTES: [string, string][] = [
    ['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp'],
    ['image/gif', 'gif'], ['image/avif', 'avif'],
  ];
  for (const [mime, ext] of ACCEPTES) {
    it(`${mime} accepté, extension « ${ext} » DÉRIVÉE du type`, async () => {
      await POST(requete(image(mime)), ctx());
      expect(uploadMock.mock.calls[0][0]).toMatch(new RegExp(`\\.${ext}$`));
    });
  }
});

describe('borne de dépense', () => {
  it('posée sur le SITE de l’article, après les contrôles gratuits', async () => {
    await POST(requete(image()), ctx());
    expect(jetonMock.mock.calls[0][0]).toMatchObject({
      type: 'blog_cover_upload', siteId: SITE_A, plafond: 10,
    });
  });

  it('borne atteinte -> 429 et AUCUN téléversement', async () => {
    jetonMock.mockResolvedValue({ ok: false, statut: 429, erreur: 'Trop de téléversements, réessayez dans une minute.' });
    const r = await POST(requete(image()), ctx());
    expect(r.status).toBe(429);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('compteur en panne -> REFUSE (503), il n’ouvre pas', async () => {
    jetonMock.mockResolvedValue({ ok: false, statut: 503, erreur: 'Service momentanément indisponible.' });
    expect((await POST(requete(image()), ctx())).status).toBe(503);
    expect(uploadMock).not.toHaveBeenCalled();
  });
});

describe('le chemin — 100 % serveur', () => {
  it('forme `blog/{site_id}/{uuid}.{ext}`', async () => {
    await POST(requete(image()), ctx());
    expect(uploadMock.mock.calls[0][0]).toMatch(
      new RegExp(`^blog/${SITE_A}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.png$`)
    );
  });

  it('le NOM DE FICHIER du client n’apparaît nulle part', async () => {
    await POST(requete(image('image/png', 512, '../../autre-site/vol .PNG')), ctx());
    const chemin = uploadMock.mock.calls[0][0] as string;
    expect(chemin).not.toContain('vol');
    expect(chemin).not.toContain('..');
    expect(chemin).not.toContain(' ');
    expect(chemin).toContain(`blog/${SITE_A}/`);
  });

  it('l’extension vient du MIME, JAMAIS du nom — `.php` déguisé n’existe pas', async () => {
    await POST(requete(image('image/webp', 512, 'exploit.php')), ctx());
    expect(uploadMock.mock.calls[0][0]).toMatch(/\.webp$/);
    expect(uploadMock.mock.calls[0][0]).not.toContain('php');
  });

  it('deux téléversements ne collisionnent jamais', async () => {
    await POST(requete(image()), ctx());
    await POST(requete(image()), ctx());
    expect(uploadMock.mock.calls[0][0]).not.toBe(uploadMock.mock.calls[1][0]);
  });

  it('bucket `site-images`, `upsert: false`, `contentType` conservé', async () => {
    await POST(requete(image('image/webp')), ctx());
    expect(bucketMock).toHaveBeenCalledWith('site-images');
    expect(uploadMock.mock.calls[0][2]).toMatchObject({ contentType: 'image/webp', upsert: false });
  });
});

describe('écriture et orphelins', () => {
  it('`setPostCover` reçoit l’id ET le `site_id` de l’ARTICLE VÉRIFIÉ', async () => {
    await POST(requete(image()), ctx());
    const [id, siteId, url, path] = setPostCoverMock.mock.calls[0];
    expect(id).toBe(ID);
    expect(siteId).toBe(SITE_A);
    expect(url).toBe('https://s.test/pub/blog/x.png');
    expect(path).toBe(uploadMock.mock.calls[0][0]);
  });

  it('remplacer une couverture RETIRE l’ancienne — pas d’orphelin dans un bucket public', async () => {
    setPostCoverMock.mockResolvedValue({ post: { ...ARTICLE }, ancienChemin: 'blog/site/ancienne.png' });
    await POST(requete(image()), ctx());
    expect(removeMock).toHaveBeenCalledWith(['blog/site/ancienne.png']);
  });

  it('le retrait a lieu APRÈS l’écriture en base, jamais avant', async () => {
    const ordre: string[] = [];
    setPostCoverMock.mockImplementation(async () => {
      ordre.push('base');
      return { post: { ...ARTICLE }, ancienChemin: 'blog/site/ancienne.png' };
    });
    removeMock.mockImplementation(async () => { ordre.push('retrait'); return { error: null }; });
    await POST(requete(image()), ctx());
    expect(ordre).toEqual(['base', 'retrait']);
  });

  it('premier téléversement : rien à retirer', async () => {
    await POST(requete(image()), ctx());
    expect(removeMock).not.toHaveBeenCalled();
  });

  it('un retrait qui échoue n’invalide PAS la couverture déjà posée', async () => {
    setPostCoverMock.mockResolvedValue({ post: { ...ARTICLE }, ancienChemin: 'blog/site/a.png' });
    removeMock.mockResolvedValue({ error: { message: 'not found' } });
    expect((await POST(requete(image()), ctx())).status).toBe(200);
  });

  it('aucune ligne touchée -> 404 ET l’objet fraîchement déposé est retiré', async () => {
    setPostCoverMock.mockResolvedValue(null);
    const r = await POST(requete(image()), ctx());
    expect(r.status).toBe(404);
    expect(removeMock).toHaveBeenCalledWith([uploadMock.mock.calls[0][0]]);
  });

  it('échec du téléversement -> 503, aucune écriture en base', async () => {
    uploadMock.mockResolvedValue({ error: { message: 'bucket quota exceeded on node-7' } });
    const r = await POST(requete(image()), ctx());
    expect(r.status).toBe(503);
    expect(setPostCoverMock).not.toHaveBeenCalled();
    expect(JSON.stringify(await r.json())).not.toMatch(/quota|node-7|bucket/i);
  });

  it('URL publique absente -> 503, aucune écriture', async () => {
    getPublicUrlMock.mockReturnValue({ data: null });
    expect((await POST(requete(image()), ctx())).status).toBe(503);
    expect(setPostCoverMock).not.toHaveBeenCalled();
  });
});

describe('cliquet structurel', () => {
  const SRC = readFileSync(join(__dirname, '../route.ts'), 'utf-8');
  const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('AUCUN `canTransact` — le blog est commun aux trois modes', () => {
    expect(CODE).not.toMatch(/canTransact|commerce-admission/);
  });

  it('le chemin est construit avec `article.site_id` et `randomUUID`, jamais avec `file.name`', () => {
    expect(CODE).toMatch(/`blog\/\$\{article\.site_id\}\/\$\{randomUUID\(\)\}\.\$\{extension\}`/);
    expect(CODE).not.toMatch(/file\.name/);
  });

  it('l’allowlist MIME est alignée sur le bucket réel et exclut SVG', () => {
    for (const m of ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']) {
      expect(CODE, m).toContain(`'${m}'`);
    }
    expect(CODE).not.toMatch(/svg/i);
  });

  it('les contrôles gratuits précèdent la borne, qui précède le téléversement', () => {
    // L'ordre se mesure dans le CORPS de la fonction : `consommerJeton` et
    // `randomUUID` apparaissent d'abord dans les IMPORTS, en tête de fichier.
    const CORPS = CODE.slice(CODE.indexOf('export async function POST'));
    const taille = CORPS.indexOf('file.size >');
    const mime = CORPS.indexOf('MIME_AUTORISES[file.type]');
    const jeton = CORPS.indexOf('await consommerJeton(');
    const upload = CORPS.indexOf('.upload(');
    for (const [n, v] of [['taille', taille], ['mime', mime], ['jeton', jeton], ['upload', upload]] as const) {
      expect(v, n).toBeGreaterThan(-1);
    }
    expect(taille).toBeLessThan(jeton);
    expect(mime).toBeLessThan(jeton);
    expect(jeton).toBeLessThan(upload);
  });

  it('la propriété est tranchée avant toute lecture du corps', () => {
    expect(CODE.indexOf('requireArticleOwner')).toBeLessThan(CODE.indexOf('req.formData()'));
  });

  it('le bucket est `site-images` — pas `custom-designs`, pas un bucket neuf', () => {
    expect(CODE).toContain("const BUCKET = 'site-images'");
    expect(CODE).not.toMatch(/custom-designs|pod-designs/);
  });

  it('la table n’est pas nommée ici : l’écriture passe par `@/lib/blog`', () => {
    expect(CODE).not.toMatch(/site_blog_posts|from\(['"]blog_posts['"]\)/);
    expect(CODE).toContain("from '@/lib/blog'");
  });
});
