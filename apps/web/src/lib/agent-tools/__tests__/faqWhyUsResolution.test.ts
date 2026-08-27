import { describe, it, expect } from 'vitest';
import {
  resolveFaqEntry,
  resolveWhyUsEntry,
  faqResolutionMessage,
  whyUsResolutionMessage,
  validateEntryText,
} from '../faqWhyUsResolution';

// ============================================================
// CHANTIER 4 (MODE 1) — ADRESSAGE PAR CONTENU DE `faq` ET `whyus`.
//
// Les six questions réelles de YIA Global Commodities servent de fixture :
// c'est sur ce site que le manque a été mesuré — FAQ générée, rendue depuis
// le chantier 2, publiée dans `llms.txt` et en `FAQPage`, et invisible à
// l'agent.
// ============================================================

const FAQ_YIA = [
  { question: 'What certifications and documentation do you provide with each shipment?', answer: 'Every shipment includes a CoA.' },
  { question: 'What are the minimum order quantities?', answer: 'Sesame from 500 kg.' },
  { question: 'How long does shipping from Chad to North America typically take?', answer: 'Ocean freight 4–6 weeks.' },
  { question: 'Do you offer long-term supply contracts or exclusive sourcing agreements?', answer: 'Yes, multi-season contracts.' },
  { question: 'What payment terms do you offer?', answer: '50% upfront, 50% on bill of lading.' },
  { question: 'Are your sesame and gum arabic organic certified?', answer: 'Low-input traditional farming.' },
];

const WHYUS_YIA = [
  { title: 'Direct sourcing', text: 'We buy from the cooperatives themselves.' },
  { title: 'Full documentation', text: 'Every lot ships with its paperwork.' },
  { title: 'Reliable logistics', text: 'One partner from Chad to your door.' },
];

describe('CHANTIER 4 — résolution d’une question de FAQ', () => {
  it('chacune des six questions de YIA se résout vers SA position', () => {
    FAQ_YIA.forEach((f, i) => {
      const r = resolveFaqEntry(FAQ_YIA, f.question);
      expect(r.ok, f.question).toBe(true);
      expect(r.ok && r.index).toBe(i);
    });
  });

  it('la casse et les espaces de bord n’empêchent pas la résolution', () => {
    const r = resolveFaqEntry(FAQ_YIA, '  WHAT PAYMENT TERMS DO YOU OFFER?  ');
    expect(r.ok && r.index).toBe(4);
  });

  it('🔴 un fragment ne suffit PAS — égalité stricte, jamais sous-chaîne', () => {
    // Le piège rencontré au chantier 1 : « payment terms » apparaît dans une
    // seule question, donc un test qui n'assertait que `ok === false` aurait
    // aussi passé avec une recherche par sous-chaîne. On exige `not_found`.
    const r = resolveFaqEntry(FAQ_YIA, 'payment terms');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toBe('not_found');
  });

  it('🔴 deux questions identiques → ambigu, et AUCUNE position rendue', () => {
    const doublon = [...FAQ_YIA, { question: 'What payment terms do you offer?', answer: 'Autre' }];
    const r = resolveFaqEntry(doublon, 'What payment terms do you offer?');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toBe('ambiguous');
    expect(!r.ok && r.reason === 'ambiguous' && r.count).toBe(2);
  });

  it('🔴 une requête vide n’apparie rien, même face à une entrée vide', () => {
    for (const q of ['', '   ', null, undefined, 42, {}, []]) {
      expect(resolveFaqEntry([{ question: '', answer: 'x' }], q).ok, String(q)).toBe(false);
    }
  });

  it('une liste absente, nulle ou mal formée ne fait pas échouer la résolution', () => {
    for (const liste of [null, undefined, 'faq', 42, {}, [null, 'x', 7, []]]) {
      const r = resolveFaqEntry(liste, 'What payment terms do you offer?');
      expect(r.ok, String(liste)).toBe(false);
      expect(!r.ok && r.reason).toBe('not_found');
    }
  });

  it('une entrée dont la question n’est pas du texte est INADRESSABLE, pas devinée', () => {
    const liste = [{ question: { fr: 'X' }, answer: 'a' }, { question: 'Vraie question', answer: 'b' }];
    expect(resolveFaqEntry(liste, 'Vraie question').ok).toBe(true);
    expect(resolveFaqEntry(liste, 'X').ok).toBe(false);
  });
});

describe('CHANTIER 4 — résolution d’un argument « Pourquoi nous »', () => {
  it('chaque titre se résout vers SA position', () => {
    WHYUS_YIA.forEach((w, i) => {
      const r = resolveWhyUsEntry(WHYUS_YIA, w.title);
      expect(r.ok && r.index, w.title).toBe(i);
    });
  });

  it('🔴 titres en double → ambigu', () => {
    const r = resolveWhyUsEntry([...WHYUS_YIA, { title: 'direct sourcing', text: 'z' }], 'Direct sourcing');
    expect(!r.ok && r.reason).toBe('ambiguous');
  });

  it('🔴 la FAQ et « Pourquoi nous » n’adressent PAS la même clé', () => {
    // `whyus` porte `title`, `faq` porte `question`. Confondre les deux
    // résoudrait silencieusement vers la mauvaise liste.
    expect(resolveWhyUsEntry(FAQ_YIA, 'What payment terms do you offer?').ok).toBe(false);
    expect(resolveFaqEntry(WHYUS_YIA, 'Direct sourcing').ok).toBe(false);
  });
});

describe('CHANTIER 4 — validation du texte écrit', () => {
  it('un texte réel est accepté et rendu trimé', () => {
    const r = validateEntryText('  Une vraie réponse.  ', 'answer');
    expect(r.ok && r.value).toBe('Une vraie réponse.');
  });

  it('🔴 une non-chaîne est refusée — c’est ce qui casserait le rendu React', () => {
    for (const v of [null, undefined, 42, true, {}, [], { fr: 'x' }, ['a']]) {
      expect(validateEntryText(v, 'answer').ok, String(v)).toBe(false);
    }
  });

  it('🔴 une chaîne vide ou blanche est refusée — elle serait inadressable', () => {
    for (const v of ['', '   ', '\n', '\t  ']) {
      expect(validateEntryText(v, 'question').ok, JSON.stringify(v)).toBe(false);
    }
  });

  it('le message d’erreur nomme le champ fautif', () => {
    const r = validateEntryText(null, 'question');
    expect(!r.ok && r.message).toContain('question');
    expect(!r.ok && r.message).toContain("Aucun changement");
  });

  it('AUCUN plafond de longueur — l’éditeur n’en impose pas non plus', () => {
    // Poser une borne ici seul ferait refuser à l'agent ce que le marchand
    // vient d'écrire à la main dans `Navbar.tsx`. Choix délibéré, pas un oubli.
    expect(validateEntryText('x'.repeat(20000), 'answer').ok).toBe(true);
  });

  it('le texte n’est NI échappé NI transformé — l’échappement appartient à JsonLdScript', () => {
    const brut = '</script><script>alert(1)</script> & <b>gras</b>';
    const r = validateEntryText(brut, 'answer');
    expect(r.ok && r.value).toBe(brut);
  });
});

describe('CHANTIER 4 — messages rendus au modèle', () => {
  it('introuvable : la FAQ et « Pourquoi nous » ne disent pas la même chose', () => {
    const f = faqResolutionMessage({ ok: false, reason: 'not_found', query: 'X' });
    const w = whyUsResolutionMessage({ ok: false, reason: 'not_found', query: 'X' });
    expect(f).toContain('FAQ');
    expect(w).toContain('Pourquoi nous');
    expect(f).not.toBe(w);
  });

  it('chaque message dit qu’AUCUN changement n’a eu lieu', () => {
    for (const m of [
      faqResolutionMessage({ ok: false, reason: 'not_found', query: 'X' }),
      faqResolutionMessage({ ok: false, reason: 'ambiguous', query: 'X', count: 2 }),
      whyUsResolutionMessage({ ok: false, reason: 'not_found', query: 'X' }),
      whyUsResolutionMessage({ ok: false, reason: 'ambiguous', query: 'X', count: 3 }),
    ]) {
      expect(m).toContain("Aucun changement n'a ete fait");
    }
  });
});
