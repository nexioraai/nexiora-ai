import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import JsonLdScript, { serializeJsonLd } from '../JsonLdScript';

// ============================================================
// M1-05 -- non-regression de M1-01 (Stored XSS via JSON-LD).
//
// Ces tests utilisent EXACTEMENT la methode qui a prouve la vulnerabilite
// pendant l'audit MODE 1 : un rendu React reel (`renderToStaticMarkup`),
// pas une inspection de chaine. Avant correctif, ce rendu produisait :
//
//   <script type="application/ld+json">{"name":"</script><script>...
//
// Le parseur HTML terminait le script sur cette balise fermante litterale.
//
// Le premier test est le CONTROLE NEGATIF : il verifie que le defaut
// d'origine (`JSON.stringify` brut) produit toujours la balise fermante.
// Sans lui, les tests suivants pourraient passer pour une raison etrangere
// au correctif -- une assertion qui ne peut pas echouer ne prouve rien.
// ============================================================

const HOSTILE = '</script><script>alert(document.domain)</script>';

describe('M1-05 -- contrôle négatif : le défaut d’origine est bien reproductible', () => {
  it('JSON.stringify BRUT laisse passer une balise fermante littérale', () => {
    const brut = JSON.stringify({ name: HOSTILE });
    expect(brut).toContain('</script>');          // <- le defaut, tel qu'il etait
  });
});

describe('M1-05 -- serializeJsonLd neutralise la classe, pas un payload', () => {
  it('la sortie ne contient AUCUN < > & littéral, quel que soit le champ', () => {
    const out = serializeJsonLd({
      name: HOSTILE,
      slogan: '<img src=x onerror=alert(1)>',
      about: 'a & b',
      faq: [{ question: '<!--', answer: '-->' }],
    });
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
    expect(out).not.toContain('&');
  });

  it('U+2028 / U+2029 sont échappés — ils cassent les parseurs JS', () => {
    const out = serializeJsonLd({ a: '\u2028', b: '\u2029' });
    expect(out).not.toContain('\u2028');
    expect(out).not.toContain('\u2029');
    expect(out).toContain('\\u2028');
    expect(out).toContain('\\u2029');
  });

  it('le JSON reste VALIDE et la donnée est restituée à l’identique (SEO/GEO intact)', () => {
    const data = {
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      name: HOSTILE,
      description: 'Café & Thé — «premium»',
      url: 'https://www.deribfy.com/sites/x?a=1&b=2',
    };
    const parsed = JSON.parse(serializeJsonLd(data));
    expect(parsed).toEqual(data);                 // aucune perte, aucune alteration
  });

  it('les données structurées légitimes ne sont pas dégradées', () => {
    const out = serializeJsonLd({ '@type': 'FAQPage', priceRange: '$$' });
    expect(JSON.parse(out)).toEqual({ '@type': 'FAQPage', priceRange: '$$' });
  });
});

describe('M1-05 -- rendu React réel : plus aucune balise fermante exécutable', () => {
  it('le composant ne produit plus </script> au milieu du contenu', () => {
    const html = renderToStaticMarkup(<JsonLdScript data={{ name: HOSTILE }} />);
    // Une seule balise fermante : celle du <script> lui-meme, en fin de rendu.
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    expect(html.endsWith('</script>')).toBe(true);
    expect(html).not.toContain('</script><script>');
    expect(html).toContain('\\u003c');            // le payload est neutralise, pas supprime
  });

  it('le type MIME reste application/ld+json', () => {
    const html = renderToStaticMarkup(<JsonLdScript data={{ a: 1 }} />);
    expect(html).toContain('type="application/ld+json"');
  });

  it.each([
    ['fermeture de script', '</script>'],
    ['ouverture de commentaire HTML', '<!--'],
    ['fermeture de commentaire HTML', '-->'],
    ['balise image', '<img src=x onerror=alert(1)>'],
    ['CDATA', ']]><script>alert(1)</script>'],
  ])('payload « %s » -> aucune balise injectée dans le rendu', (_label, payload) => {
    const html = renderToStaticMarkup(<JsonLdScript data={{ name: payload }} />);
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    expect(html).not.toMatch(/<script[^>]*>[\s\S]*<script/);
  });
});
