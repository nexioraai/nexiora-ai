import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import JsonLd from '@/app/sites/[slug]/themes/JsonLd';
import { toolNamesForSite } from '@/lib/agent-tools/toolCapabilities';

// ============================================================
// CHANTIER 4 (MODE 1) — LES SIX OUTILS SUR LA ROUTE RÉELLE.
//
// Mesuré sur yiaglobalcommodities.com : `faq` et `whyus` sont générés,
// rendus par les quatre thèmes (la FAQ depuis le chantier 2), publiés dans
// `llms.txt` et en `FAQPage` — et l'agent ne les voyait pas. L'éditeur, lui,
// les édite déjà (`Navbar.tsx:613` et `:371`) : le manque était l'agent seul.
//
// Ces tests exercent la ROUTE, pas le résolveur, et vérifient à chaque refus
// qu'AUCUNE écriture n'a eu lieu.
// ============================================================

const getUserMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: (...a: unknown[]) => getUserMock(...a) } },
}));

let siteRow: Record<string, unknown>;
let ecritures: Record<string, unknown>[] = [];

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...a: unknown[]) => fromMock(...(a as [string])) },
}));

const USER = { id: 'user-1', email: 'm@test.com' };

const FAQ_YIA = [
  { question: 'What are the minimum order quantities?', answer: 'Sesame from 500 kg.' },
  { question: 'What payment terms do you offer?', answer: '50% upfront.' },
];
const WHYUS_YIA = [
  { title: 'Direct sourcing', text: 'We buy from the cooperatives themselves.' },
  { title: 'Full documentation', text: 'Every lot ships with its paperwork.' },
];

function chain() {
  const b: any = {};
  b.select = () => b;
  b.eq = () => b;
  b.maybeSingle = async () => ({ data: siteRow, error: null });
  b.single = b.maybeSingle;
  b.update = (payload: Record<string, unknown>) => { ecritures.push(payload); return b; };
  b.then = (res: (v: unknown) => void) => res({ data: siteRow, error: null });
  return b;
}

function req(tool_name: string, tool_input: unknown) {
  return new Request('https://x.test/api/agent/yia/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: 'Bearer t' },
    body: JSON.stringify({ tool_name, tool_input }),
  });
}
const ctx = { params: Promise.resolve({ slug: 'yia' }) };

beforeEach(() => {
  ecritures = [];
  siteRow = {
    id: 'site-1', slug: 'yia', name: 'YIA Global Commodities',
    owner_id: USER.id, owner_email: USER.email, mode: 1, lang: 'en',
    faq: JSON.parse(JSON.stringify(FAQ_YIA)),
    whyus: JSON.parse(JSON.stringify(WHYUS_YIA)),
    sections: [], services: [], products: [], hidden_sections: [],
  };
  getUserMock.mockReset().mockResolvedValue({ data: { user: { ...USER } }, error: null });
  fromMock.mockReset().mockImplementation(() => chain());
});

async function appeler(tool: string, input: unknown) {
  const { POST } = await import('../route');
  const res = await POST(req(tool, input), ctx as any);
  return { statut: res.status, corps: await res.json().catch(() => null) };
}

// ------------------------------------------------------------
describe('CHANTIER 4 — l’agent LIT faq et whyus', () => {
  it('les deux tableaux figurent au CURRENT SITE STATE', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const src = readFileSync(join(__dirname, '../../chat/route.ts'), 'utf-8');
    expect(src).toMatch(/^ {4}faq: site\.faq,$/m);
    expect(src).toMatch(/^ {4}whyus: site\.whyus,$/m);
  });

  it('les six outils sont offerts à un site Mode 1', () => {
    const outils = toolNamesForSite(1, null);
    for (const t of ['propose_faq_add', 'propose_faq_remove', 'propose_faq_update',
                     'propose_whyus_add', 'propose_whyus_remove', 'propose_whyus_update']) {
      expect(outils, t).toContain(t);
    }
  });
});

// ------------------------------------------------------------
describe('CHANTIER 4 — FAQ : édition valide et persistance réelle', () => {
  it('ajout : la question est ajoutée EN FIN, les existantes intactes', async () => {
    const { statut } = await appeler('propose_faq_add', {
      question: 'Do you ship to Canada?', answer: 'Yes, weekly.', reason: 'r',
    });
    expect(statut).toBe(200);
    expect(ecritures).toHaveLength(1);
    expect(ecritures[0].faq).toEqual([...FAQ_YIA, { question: 'Do you ship to Canada?', answer: 'Yes, weekly.' }]);
  });

  it('ajout : le texte est trimé, et RIEN d’autre n’est écrit', async () => {
    await appeler('propose_faq_add', { question: '  Q?  ', answer: '  A.  ', reason: 'r' });
    expect((ecritures[0].faq as any[])[2]).toEqual({ question: 'Q?', answer: 'A.' });
    expect(Object.keys(ecritures[0])).toEqual(['faq']);
  });

  it('🔴 ajout : aucune clé arbitraire ne franchit la route', async () => {
    await appeler('propose_faq_add', {
      question: 'Q?', answer: 'A.', reason: 'r',
      __proto__: { pollué: true }, mode: 3, for_sale: true, html: '<b>x</b>',
    });
    const ajoutee = (ecritures[0].faq as any[])[2];
    expect(Object.keys(ajoutee).sort()).toEqual(['answer', 'question']);
  });

  it('suppression : adressée par question exacte, les autres survivent', async () => {
    const { statut } = await appeler('propose_faq_remove', {
      question: 'What payment terms do you offer?', reason: 'r',
    });
    expect(statut).toBe(200);
    expect(ecritures[0].faq).toEqual([FAQ_YIA[0]]);
  });

  it('modification : seul le champ visé change', async () => {
    const { statut } = await appeler('propose_faq_update', {
      question: 'What payment terms do you offer?', field: 'answer',
      value: '30% upfront, 70% on B/L.', reason: 'r',
    });
    expect(statut).toBe(200);
    expect(ecritures[0].faq).toEqual([
      FAQ_YIA[0], { question: 'What payment terms do you offer?', answer: '30% upfront, 70% on B/L.' },
    ]);
  });

  it('modification : réécrire la question elle-même fonctionne', async () => {
    await appeler('propose_faq_update', {
      question: 'What payment terms do you offer?', field: 'question',
      value: 'What are your payment terms?', reason: 'r',
    });
    expect((ecritures[0].faq as any[])[1]).toEqual({
      question: 'What are your payment terms?', answer: '50% upfront.',
    });
  });
});

// ------------------------------------------------------------
describe('CHANTIER 4 — « Pourquoi nous » : le contenu écrit, pas seulement la clé', () => {
  // TROU RÉVÉLÉ PAR MUTATION (M9). La campagne a remplacé
  //   current.map((e, i) => i === cible.index ? {...} : e)
  // par
  //   current.map((e) => ({ ...e, [field]: v.value }))
  // — la modification s'appliquait à TOUS les arguments — et la suite est
  // restée VERTE. La FAQ avait des assertions de contenu ; `whyus` n'en avait
  // que sur les clés du payload. Ces quatre tests comblent exactement cela.
  it('modification : SEULE l’entrée visée change', async () => {
    const { statut } = await appeler('propose_whyus_update', {
      title: 'Direct sourcing', field: 'text', value: 'Nous achetons en direct.', reason: 'r',
    });
    expect(statut).toBe(200);
    expect(ecritures[0].whyus).toEqual([
      { title: 'Direct sourcing', text: 'Nous achetons en direct.' },
      WHYUS_YIA[1],
    ]);
  });

  it('modification : réécrire le titre ne touche pas le second argument', async () => {
    await appeler('propose_whyus_update', {
      title: 'Direct sourcing', field: 'title', value: 'Sourcing direct', reason: 'r',
    });
    expect(ecritures[0].whyus).toEqual([
      { title: 'Sourcing direct', text: WHYUS_YIA[0].text },
      WHYUS_YIA[1],
    ]);
  });

  it('suppression : retire l’argument visé, exactement lui', async () => {
    await appeler('propose_whyus_remove', { title: 'Full documentation', reason: 'r' });
    expect(ecritures[0].whyus).toEqual([WHYUS_YIA[0]]);
  });

  it('ajout : ajouté en fin, forme {title,text} et rien d’autre', async () => {
    await appeler('propose_whyus_add', { title: 'Reliable logistics', text: 'Un seul partenaire.', reason: 'r', extra: 1 });
    expect(ecritures[0].whyus).toEqual([...WHYUS_YIA, { title: 'Reliable logistics', text: 'Un seul partenaire.' }]);
  });
});

// ------------------------------------------------------------
describe('CHANTIER 4 — FAQ : la modification ne déborde pas non plus', () => {
  it('modifier une réponse laisse l’autre question intacte', async () => {
    await appeler('propose_faq_update', {
      question: FAQ_YIA[0].question, field: 'answer', value: 'Sesame from 1000 kg.', reason: 'r',
    });
    expect(ecritures[0].faq).toEqual([
      { question: FAQ_YIA[0].question, answer: 'Sesame from 1000 kg.' },
      FAQ_YIA[1],
    ]);
  });
});

// ------------------------------------------------------------
describe('CHANTIER 4 — 🔴 refus : jamais d’écriture', () => {
  const REFUS: Array<[string, string, unknown, number]> = [
    ['question introuvable', 'propose_faq_remove', { question: 'Inconnue ?', reason: 'r' }, 404],
    ['fragment, pas égalité', 'propose_faq_remove', { question: 'payment terms', reason: 'r' }, 404],
    ['question vide', 'propose_faq_remove', { question: '   ', reason: 'r' }, 404],
    ['question non-texte', 'propose_faq_remove', { question: { fr: 'x' }, reason: 'r' }, 404],
    ['ajout : question vide', 'propose_faq_add', { question: '  ', answer: 'A', reason: 'r' }, 400],
    ['ajout : réponse absente', 'propose_faq_add', { question: 'Q?', reason: 'r' }, 400],
    ['ajout : réponse non-texte', 'propose_faq_add', { question: 'Q?', answer: { a: 1 }, reason: 'r' }, 400],
    ['ajout : structure imbriquée', 'propose_faq_add', { question: ['Q?'], answer: 'A', reason: 'r' }, 400],
    ['maj : champ hors enum', 'propose_faq_update', { question: 'What payment terms do you offer?', field: 'answerx', value: 'v', reason: 'r' }, 400],
    ['maj : champ système', 'propose_faq_update', { question: 'What payment terms do you offer?', field: 'mode', value: '3', reason: 'r' }, 400],
    ['maj : valeur vide', 'propose_faq_update', { question: 'What payment terms do you offer?', field: 'answer', value: '  ', reason: 'r' }, 400],
    ['maj : valeur non-texte', 'propose_faq_update', { question: 'What payment terms do you offer?', field: 'answer', value: 42, reason: 'r' }, 400],
    ['whyus : titre introuvable', 'propose_whyus_remove', { title: 'Inconnu', reason: 'r' }, 404],
    ['whyus : ajout sans texte', 'propose_whyus_add', { title: 'T', reason: 'r' }, 400],
    ['whyus : champ hors enum', 'propose_whyus_update', { title: 'Direct sourcing', field: 'question', value: 'v', reason: 'r' }, 400],
  ];

  for (const [libelle, outil, input, attendu] of REFUS) {
    it(`${libelle} → ${attendu}, aucune écriture`, async () => {
      const { statut } = await appeler(outil, input);
      expect(statut).toBe(attendu);
      expect(ecritures, 'une écriture a eu lieu malgré le refus').toHaveLength(0);
    });
  }

  it('🔴 doublon en base → 409 ambigu, aucune écriture', async () => {
    siteRow.faq = [...FAQ_YIA, { question: 'What payment terms do you offer?', answer: 'Autre' }];
    for (const [outil, input] of [
      ['propose_faq_remove', { question: 'What payment terms do you offer?', reason: 'r' }],
      ['propose_faq_update', { question: 'What payment terms do you offer?', field: 'answer', value: 'v', reason: 'r' }],
    ] as const) {
      ecritures = [];
      const { statut } = await appeler(outil, input);
      expect(statut, outil).toBe(409);
      expect(ecritures).toHaveLength(0);
    }
  });

  it('🔴 ajouter une question déjà présente → 409, pas de doublon créé', async () => {
    const { statut } = await appeler('propose_faq_add', {
      question: '  what PAYMENT terms do you offer?  ', answer: 'X', reason: 'r',
    });
    expect(statut).toBe(409);
    expect(ecritures).toHaveLength(0);
  });

  it('🔴 un non-propriétaire ne peut rien écrire', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'autre', email: 'x@t.com' } }, error: null });
    for (const outil of ['propose_faq_add', 'propose_faq_remove', 'propose_whyus_remove']) {
      ecritures = [];
      const { statut } = await appeler(outil, { question: 'Q?', answer: 'A', title: 'Direct sourcing', reason: 'r' });
      expect(statut, outil).not.toBe(200);
      expect(ecritures).toHaveLength(0);
    }
  });
});

// ------------------------------------------------------------
describe('CHANTIER 4 — données vides, nulles ou absentes', () => {
  it('un site SANS faq : l’ajout crée le tableau', async () => {
    for (const vide of [null, undefined, [], 'pas un tableau', 42]) {
      ecritures = [];
      siteRow.faq = vide;
      const { statut } = await appeler('propose_faq_add', { question: 'Q?', answer: 'A.', reason: 'r' });
      expect(statut, String(vide)).toBe(200);
      expect(ecritures[0].faq).toEqual([{ question: 'Q?', answer: 'A.' }]);
    }
  });

  it('🔴 un site sans faq : supprimer renvoie 404, pas une erreur serveur', async () => {
    siteRow.faq = null;
    const { statut } = await appeler('propose_faq_remove', { question: 'Q?', reason: 'r' });
    expect(statut).toBe(404);
  });

  it('supprimer la DERNIÈRE entrée laisse un tableau vide, pas null', async () => {
    siteRow.faq = [FAQ_YIA[0]];
    await appeler('propose_faq_remove', { question: FAQ_YIA[0].question, reason: 'r' });
    expect(ecritures[0].faq).toEqual([]);
  });
});

// ------------------------------------------------------------
describe('CHANTIER 4 — INVARIANTS MODE 1', () => {
  it('🔴 aucune écriture ne touche services, sections, mode ni le commerce', async () => {
    const CAS: Array<[string, unknown]> = [
      ['propose_faq_add', { question: 'Q?', answer: 'A.', reason: 'r' }],
      ['propose_faq_remove', { question: FAQ_YIA[0].question, reason: 'r' }],
      ['propose_faq_update', { question: FAQ_YIA[0].question, field: 'answer', value: 'v', reason: 'r' }],
      ['propose_whyus_add', { title: 'T', text: 'X', reason: 'r' }],
      ['propose_whyus_remove', { title: WHYUS_YIA[0].title, reason: 'r' }],
      ['propose_whyus_update', { title: WHYUS_YIA[0].title, field: 'text', value: 'v', reason: 'r' }],
    ];
    for (const [outil, input] of CAS) {
      ecritures = [];
      const { statut } = await appeler(outil, input);
      expect(statut, outil).toBe(200);
      expect(Object.keys(ecritures[0]), outil).toEqual([outil.includes('faq') ? 'faq' : 'whyus']);
      for (const interdit of ['services', 'sections', 'mode', 'dropship_type', 'products', 'lang', 'hidden_sections', 'shipping_flat']) {
        expect(ecritures[0], `${outil} / ${interdit}`).not.toHaveProperty(interdit);
      }
    }
  });

  it('🔴 aucun outil commercial n’a été ajouté au Mode 1', () => {
    const outils = toolNamesForSite(1, null);
    for (const commercial of ['set_price', 'set_for_sale', 'set_currency', 'create_promo_code', 'count_product_stock', 'catalog_curate']) {
      expect(outils, commercial).not.toContain(commercial);
    }
  });

  it('le Mode 2 reçoit les six outils, le Mode 3 ne les reçoit pas', () => {
    // Conséquence assumée : `faq`/`whyus` rejoignent `CONTENT_TOOLS`, dont
    // les modes sont {1, 2}. Aucune frontière n'est déplacée — le Mode 3
    // n'avait déjà ni témoignages ni galerie par l'agent, et son marchand
    // édite ces champs dans l'éditeur, où le formulaire existe pour tous.
    for (const t of ['propose_faq_add', 'propose_whyus_add']) {
      expect(toolNamesForSite(2, null), `mode 2 / ${t}`).toContain(t);
      expect(toolNamesForSite(3, 'reseller'), `mode 3 / ${t}`).not.toContain(t);
    }
  });

  it('un site Mode 1 reste Mode 1 après une édition de FAQ', async () => {
    await appeler('propose_faq_add', { question: 'Q?', answer: 'A.', reason: 'r' });
    expect(siteRow.mode).toBe(1);
  });

  it('les Modes 2 et 3 empruntent le même chemin d’écriture', async () => {
    for (const mode of [2, 3]) {
      ecritures = [];
      siteRow = { ...siteRow, mode, faq: JSON.parse(JSON.stringify(FAQ_YIA)) };
      const { statut } = await appeler('propose_faq_add', { question: 'Q?', answer: 'A.', reason: 'r' });
      expect(statut, `mode ${mode}`).toBe(200);
      expect((ecritures[0].faq as any[])).toHaveLength(3);
    }
  });
});

// ------------------------------------------------------------
describe('CHANTIER 4 — cohérence avec le masquage et le JSON-LD', () => {
  it('🔴 éditer la FAQ ne touche PAS hidden_sections', async () => {
    siteRow.hidden_sections = ['FAQ'];
    for (const [outil, input] of [
      ['propose_faq_add', { question: 'Q?', answer: 'A.', reason: 'r' }],
      ['propose_faq_remove', { question: FAQ_YIA[0].question, reason: 'r' }],
    ] as const) {
      ecritures = [];
      await appeler(outil, input);
      expect(ecritures[0], outil).not.toHaveProperty('hidden_sections');
      expect(siteRow.hidden_sections).toEqual(['FAQ']);
    }
  });

  it('une question hostile est neutralisée par JsonLdScript, PAS par la validation', async () => {
    // La validation laisse le texte intact — l'échappement appartient au seul
    // point d'entrée du JSON-LD (M1-01). On le PROUVE plutôt que d'ajouter un
    // second échappement en amont.
    const hostile = '</script><script>alert(1)</script>';
    await appeler('propose_faq_add', { question: hostile, answer: 'A.', reason: 'r' });
    expect((ecritures[0].faq as any[])[2].question).toBe(hostile);

    const html = renderToStaticMarkup(
      <JsonLd site={{ name: 'YIA', faq: [{ question: hostile, answer: 'A.' }] } as any} url="https://yia.test" />
    );
    expect(html).toContain('FAQPage');
    expect(html, 'une balise fermante littérale a survécu').not.toContain('</script><script>alert(1)');
    expect(html).toContain('\\u003c');
  });
});
