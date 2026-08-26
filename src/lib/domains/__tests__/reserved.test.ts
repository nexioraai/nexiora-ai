import { describe, it, expect } from 'vitest';
import { estDomaineReserve, normaliserDomaine, racinesReservees } from '../reserved';

// ============================================================
// D-07 -- LISTE FERMEE, NORMALISATION, FAIL-CLOSED.
//
// Ce qui est prouve ici tient en trois points : les domaines de la plateforme
// sont refuses SOUS TOUTES LEURS FORMES, les domaines clients legitimes ne le
// sont JAMAIS, et une entree illisible est refusee plutot que devinee.
// ============================================================

describe('D-07 — domaines réservés', () => {
  it('le domaine principal est réservé', () => {
    expect(estDomaineReserve('deribfy.com')).toBe(true);
  });

  it.each(['www.deribfy.com', 'app.deribfy.com', 'blog.deribfy.com', 'a.b.deribfy.com'])(
    'le sous-domaine %s est réservé',
    (d) => expect(estDomaineReserve(d)).toBe(true)
  );

  it.each(['DERIBFY.COM', 'Deribfy.Com', 'WWW.DERIBFY.COM'])('la casse ne contourne rien : %s', (d) => {
    expect(estDomaineReserve(d)).toBe(true);
  });

  it.each(['deribfy.com.', '  deribfy.com  ', ' WWW.Deribfy.COM. '])(
    'la normalisation ferme les formes équivalentes : %s',
    (d) => expect(estDomaineReserve(d)).toBe(true)
  );

  it.each([null, undefined, '', '   ', 123, {}, []])(
    'entrée illisible (%s) -> RÉSERVÉE (fail-closed)',
    (d) => expect(estDomaineReserve(d as never)).toBe(true)
  );
});

describe('D-07 — aucun domaine client légitime n’est bloqué', () => {
  it.each([
    'mondomaine.com',
    'deribfy-client.com',
    'mondomaine-deribfy.com',
    'deribfy.net',
    'deribfy.com.mondomaine.fr',
    'notderibfy.com',
    'boutique.example.org',
  ])('%s reste utilisable', (d) => {
    expect(estDomaineReserve(d)).toBe(false);
  });

  it('un domaine qui CONTIENT la racine sans en être un sous-domaine passe', () => {
    // `xderibfy.com` n'est pas un sous-domaine de `deribfy.com` : seul un
    // point separateur cree la relation de sous-domaine.
    expect(estDomaineReserve('xderibfy.com')).toBe(false);
  });
});

describe('D-07 — normalisation', () => {
  it('met en minuscules, retire les espaces et le point final', () => {
    expect(normaliserDomaine('  Exemple.COM.  ')).toBe('exemple.com');
  });

  it('une valeur non textuelle rend une chaîne vide', () => {
    expect(normaliserDomaine(42)).toBe('');
    expect(normaliserDomaine(null)).toBe('');
  });
});

describe('D-07 — la liste est fermée et non vide', () => {
  it('au moins une racine, et la copie est défensive', () => {
    const a = racinesReservees();
    expect(a.length).toBeGreaterThan(0);
    a.push('injecte.com');
    expect(racinesReservees()).not.toContain('injecte.com');
  });
});
