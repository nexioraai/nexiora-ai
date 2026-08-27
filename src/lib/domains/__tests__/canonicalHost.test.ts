import { describe, it, expect } from 'vitest';
import { varianteHote, cibleCanonique } from '../canonicalHost';

// ============================================================
// D-08 -- CE QUI EST PROUVE ICI : AUCUNE BOUCLE, AUCUN SAUT DE LOCATAIRE,
// CHEMIN ET PARAMETRES CONSERVES.
// ============================================================

describe('D-08 — variante apex / www', () => {
  it('apex -> www', () => expect(varianteHote('exemple.com')).toBe('www.exemple.com'));
  it('www -> apex', () => expect(varianteHote('www.exemple.com')).toBe('exemple.com'));

  it('un sous-domaine autre que www reçoit son www, jamais son apex', () => {
    // `boutique.exemple.com` n'est pas une forme `www` : sa variante est
    // `www.boutique.exemple.com`, pas `exemple.com` -- qui appartiendrait
    // potentiellement a un AUTRE site.
    expect(varianteHote('boutique.exemple.com')).toBe('www.boutique.exemple.com');
  });

  it('la normalisation ferme les formes équivalentes', () => {
    expect(varianteHote('  WWW.Exemple.COM.  ')).toBe('exemple.com');
  });

  it.each(['', '   ', 'localhost', 'www.', 'www.localhost'])(
    'aucune variante sensée pour %s',
    (h) => expect(varianteHote(h)).toBeNull()
  );

  it('AUCUNE BOUCLE : la variante n’est jamais l’hôte lui-même', () => {
    for (const h of ['exemple.com', 'www.exemple.com', 'a.b.exemple.com', 'www.a.b.com']) {
      expect(varianteHote(h)).not.toBe(h);
    }
  });

  it('la variante de la variante revient à l’hôte de départ', () => {
    // Propriete d'involution : elle garantit qu'aucune chaine de redirections
    // ne peut s'allonger indefiniment.
    for (const h of ['exemple.com', 'www.exemple.com']) {
      expect(varianteHote(varianteHote(h)!)).toBe(h);
    }
  });
});

describe('D-08 — cible de redirection', () => {
  it('conserve le chemin', () => {
    expect(cibleCanonique('exemple.com', '/produits/abc', '')).toBe('https://exemple.com/produits/abc');
  });

  it('conserve les paramètres', () => {
    expect(cibleCanonique('exemple.com', '/recherche', '?q=sac&page=2')).toBe(
      'https://exemple.com/recherche?q=sac&page=2'
    );
  });

  it('la racine reste la racine', () => {
    expect(cibleCanonique('exemple.com', '/', '')).toBe('https://exemple.com/');
  });

  it('toujours en HTTPS — jamais une rétrogradation de connexion', () => {
    expect(cibleCanonique('exemple.com', '/x', '')).toMatch(/^https:\/\//);
  });

  it('un chemin sans barre oblique initiale est normalisé', () => {
    expect(cibleCanonique('exemple.com', 'produits', '')).toBe('https://exemple.com/produits');
  });
});
