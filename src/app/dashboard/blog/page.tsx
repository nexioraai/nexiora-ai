'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Sparkles, Trash2, Eye, Upload, Plus } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/lib/translations';
import {
  BROUILLON_VIDE, versBrouillon, corpsCreation, corpsModification,
  peutEnregistrer, peutPublier, cleErreur, refusCouverture, COVER_MIME,
  type ArticleBrouillon, type ArticleServeur,
} from './blogDraft';

// ============================================================
// LOT BLOG 9 -- ESPACE PROPRIETAIRE DU BLOG.
//
// LE NAVIGATEUR NE CONNAIT AUCUN `site_id`. Il nomme le site par son SLUG ;
// le serveur le resout et verifie la propriete. Toute la logique de decision
// -- ce qu'on envoie, ce qu'on refuse, ce qu'on affiche d'une erreur -- vit
// dans `blogDraft.ts`, ou elle est testable ; cette page ne fait que la
// brancher a des ecrans.
//
// AUCUN ACCES DIRECT A LA BASE POUR LES ARTICLES : la table n'accorde rien a
// `authenticated` (401 / 42501 mesure). Le client anon ne sert ici qu'a la
// session et a la liste des sites possedes -- le meme usage que
// `dashboard/marketing`.
// ============================================================

const ACCENT = '#FA5D1E';

type Site = { slug: string; name: string };

export default function BlogDashboardPage() {
  const router = useRouter();
  const { t } = useTranslation();

  const [chargement, setChargement] = useState(true);
  const [sites, setSites] = useState<Site[]>([]);
  const [site, setSite] = useState('');
  const [articles, setArticles] = useState<ArticleServeur[]>([]);
  const [selection, setSelection] = useState<ArticleServeur | null>(null);
  const [brouillon, setBrouillon] = useState<ArticleBrouillon>(BROUILLON_VIDE);
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState('');

  const jeton = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  const appeler = useCallback(
    async (chemin: string, init?: RequestInit) => {
      const tk = await jeton();
      if (!tk) { router.push('/login'); return null; }
      const res = await fetch(chemin, {
        ...init,
        headers: {
          ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
          ...(init?.headers ?? {}),
          Authorization: `Bearer ${tk}`,
        },
      });
      if (!res.ok) { setErreur(t(cleErreur(res.status))); return null; }
      setErreur('');
      return res;
    },
    [jeton, router, t]
  );

  const recharger = useCallback(
    async (slugSite: string) => {
      const res = await appeler(`/api/blog/posts?site=${encodeURIComponent(slugSite)}`);
      if (!res) return;
      const { posts } = await res.json();
      setArticles(posts ?? []);
    },
    [appeler]
  );

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/login'); return; }
      supabase.from('sites').select('slug,name')
        .eq('owner_email', data.user.email)
        .order('created_at', { ascending: false })
        .then(({ data: rows }) => {
          const liste = (rows as Site[]) ?? [];
          setSites(liste);
          if (liste.length > 0) setSite(liste[0].slug);
          setChargement(false);
        });
    });
  }, [router]);

  useEffect(() => { if (site) recharger(site); }, [site, recharger]);

  function ouvrir(a: ArticleServeur | null) {
    setSelection(a);
    setBrouillon(a ? versBrouillon(a) : BROUILLON_VIDE);
    setMessage(''); setErreur('');
  }

  async function enregistrer() {
    if (!peutEnregistrer(brouillon) || occupe) return;
    setOccupe(true);
    const res = selection
      ? await appeler(`/api/blog/posts/${selection.id}`, {
          method: 'PATCH', body: JSON.stringify(corpsModification(selection, brouillon)),
        })
      : await appeler('/api/blog/posts', {
          method: 'POST', body: JSON.stringify(corpsCreation(site, brouillon)),
        });
    if (res) {
      const { post } = await res.json();
      setSelection(post); setMessage(t('blog.saved')); await recharger(site);
    }
    setOccupe(false);
  }

  async function basculerPublication(a: ArticleServeur) {
    if (occupe) return;
    if (!a.published && !peutPublier(versBrouillon(a))) { setErreur(t('blog.needContent')); return; }
    setOccupe(true);
    const res = await appeler(`/api/blog/posts/${a.id}`, {
      method: 'PATCH', body: JSON.stringify({ published: !a.published }),
    });
    if (res) { const { post } = await res.json(); if (selection?.id === post.id) setSelection(post); await recharger(site); }
    setOccupe(false);
  }

  async function supprimer(a: ArticleServeur) {
    if (occupe || !window.confirm(t('blog.confirmDelete'))) return;
    setOccupe(true);
    const res = await appeler(`/api/blog/posts/${a.id}`, { method: 'DELETE' });
    if (res) { if (selection?.id === a.id) ouvrir(null); await recharger(site); }
    setOccupe(false);
  }

  async function generer() {
    if (occupe || !site) return;
    setOccupe(true); setMessage('');
    const res = await appeler('/api/blog/posts/generate', {
      method: 'POST', body: JSON.stringify({ site }),
    });
    if (res) { const { post } = await res.json(); await recharger(site); ouvrir(post); }
    setOccupe(false);
  }

  async function televerser(fichier: File) {
    if (!selection || occupe) return;
    // Refus LOCAL de ce que le serveur refuserait : evite un aller-retour et
    // une consommation de jeton. La garde SERVEUR reste l'autorite.
    const refus = refusCouverture(fichier);
    if (refus) { setErreur(t(refus)); return; }
    setOccupe(true);
    const form = new FormData(); form.set('file', fichier);
    const res = await appeler(`/api/blog/posts/${selection.id}/cover`, { method: 'POST', body: form });
    if (res) { const { post } = await res.json(); setSelection(post); await recharger(site); }
    setOccupe(false);
  }

  const champ = 'w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:border-white/25';

  return (
    <div className="min-h-screen bg-[#0A050E] text-white">
      <Sidebar />
      <main className="lg:pl-64 px-6 py-10 max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <FileText className="w-6 h-6" style={{ color: ACCENT }} />
          <h1 className="text-2xl font-bold">{t('blog.title')}</h1>
        </div>
        <p className="text-sm text-white/50 mb-8">{t('blog.subtitle')}</p>

        {chargement ? null : sites.length === 0 ? (
          <p className="text-sm text-white/60">{t('blog.noSite')}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <label className="text-xs uppercase tracking-wider text-white/40">{t('blog.site')}</label>
              <select value={site} onChange={(e) => { setSite(e.target.value); ouvrir(null); }}
                className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm">
                {sites.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
              </select>
              <button onClick={() => ouvrir(null)} disabled={occupe}
                className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm disabled:opacity-40">
                <Plus className="w-4 h-4" />{t('blog.new')}
              </button>
              <button onClick={generer} disabled={occupe}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                style={{ background: ACCENT }}>
                <Sparkles className="w-4 h-4" />{occupe ? t('blog.generating') : t('blog.generate')}
              </button>
            </div>

            {erreur && <p className="mb-4 text-sm text-red-300">{erreur}</p>}
            {message && <p className="mb-4 text-sm text-emerald-300">{message}</p>}

            <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
              <aside className="space-y-2">
                {articles.length === 0 ? (
                  <p className="text-sm text-white/40">{t('blog.empty')}</p>
                ) : articles.map((a) => (
                  <div key={a.id}
                    className={`rounded-xl border px-3 py-3 ${selection?.id === a.id ? 'border-white/30 bg-white/10' : 'border-white/10 bg-white/[0.03]'}`}>
                    <button onClick={() => ouvrir(a)} className="block w-full text-left text-sm font-medium">
                      {a.title}
                    </button>
                    <div className="mt-2 flex items-center gap-2 text-[11px]">
                      <span className={a.published ? 'text-emerald-300' : 'text-white/40'}>
                        {a.published ? t('blog.published') : t('blog.draft')}
                      </span>
                      <button onClick={() => basculerPublication(a)} disabled={occupe}
                        className="ml-auto text-white/50 hover:text-white disabled:opacity-40">
                        {a.published ? t('blog.unpublish') : t('blog.publish')}
                      </button>
                      <button onClick={() => supprimer(a)} disabled={occupe}
                        aria-label={t('blog.delete')} className="text-white/40 hover:text-red-300 disabled:opacity-40">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </aside>

              <section className="space-y-4">
                <input className={champ} placeholder={t('blog.fTitle')} value={brouillon.title}
                  onChange={(e) => setBrouillon({ ...brouillon, title: e.target.value })} />
                <input className={champ} placeholder={t('blog.fSlug')} value={brouillon.slug}
                  onChange={(e) => setBrouillon({ ...brouillon, slug: e.target.value })} />
                <textarea className={champ} rows={2} placeholder={t('blog.fExcerpt')} value={brouillon.excerpt}
                  onChange={(e) => setBrouillon({ ...brouillon, excerpt: e.target.value })} />
                <textarea className={champ} rows={16} placeholder={t('blog.fContent')} value={brouillon.content}
                  onChange={(e) => setBrouillon({ ...brouillon, content: e.target.value })} />

                {selection && (
                  <div className="rounded-xl border border-white/10 p-4">
                    <p className="text-xs uppercase tracking-wider text-white/40 mb-2">{t('blog.cover')}</p>
                    {selection.cover_image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={selection.cover_image} alt="" className="mb-3 w-full rounded-lg" />
                    )}
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm">
                      <Upload className="w-4 h-4" />{t('blog.coverUpload')}
                      <input type="file" accept={COVER_MIME.join(',')} className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) televerser(f); }} />
                    </label>
                    <p className="mt-2 text-[11px] text-white/35">{t('blog.coverHint')}</p>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <button onClick={enregistrer} disabled={occupe || !peutEnregistrer(brouillon)}
                    className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                    style={{ background: ACCENT }}>
                    {t('blog.save')}
                  </button>
                  {selection?.published && (
                    <a href={`/sites/${encodeURIComponent(site)}/blog/${encodeURIComponent(selection.slug)}`}
                      target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white">
                      <Eye className="w-4 h-4" />{t('blog.view')}
                    </a>
                  )}
                </div>
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
