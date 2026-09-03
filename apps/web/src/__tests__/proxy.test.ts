import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================================
// D-08 -- LE PROXY N'AVAIT AUCUN TEST, ET IL PORTE LA RESOLUTION DE TOUS LES
// DOMAINES PERSONNALISES.
//
// CE QUI EST PROUVE ICI :
//   * la forme non stockee (apex ou www) redirige vers la forme stockee ;
//   * la forme stockee est SERVIE, jamais redirigee -- aucune boucle ;
//   * le chemin et les parametres survivent ;
//   * un hote inconnu ne redirige nulle part -- aucun saut de locataire ;
//   * les hotes de la plateforme ne sont jamais concernes.
// ============================================================

const fetchSiteByDomainMock = vi.fn();
vi.mock('../app/sites/[slug]/themes/shared', () => ({
  fetchSiteByDomain: (...a: unknown[]) => fetchSiteByDomainMock(...a),
}));

import { proxy } from '../proxy';

const req = (host: string, pathname = '/', search = '') =>
  new NextRequest(`https://${host}${pathname}${search}`, { headers: { host } });

beforeEach(() => {
  fetchSiteByDomainMock.mockReset();
});

/** `exemple.com` est le domaine STOCKE ; `www.exemple.com` ne l'est pas. */
function stocke(canonique: string) {
  fetchSiteByDomainMock.mockImplementation(async (h: string) => (h === canonique ? 'ma-boutique' : null));
}

describe('D-08 — la forme stockée est servie, jamais redirigée', () => {
  it('apex stocké -> réécriture interne, AUCUNE redirection', async () => {
    stocke('exemple.com');
    const res = await proxy(req('exemple.com', '/'));
    expect(res.status).not.toBe(308);
    expect(res.headers.get('location')).toBeNull();
  });

  it('www stocké -> réécriture interne, AUCUNE redirection', async () => {
    stocke('www.exemple.com');
    const res = await proxy(req('www.exemple.com', '/'));
    expect(res.status).not.toBe(308);
  });
});

describe('D-08 — la forme NON stockée redirige vers la canonique', () => {
  it('www -> apex quand l’apex est stocké', async () => {
    stocke('exemple.com');
    const res = await proxy(req('www.exemple.com', '/'));
    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toBe('https://exemple.com/');
  });

  it('apex -> www quand le www est stocké', async () => {
    // Le canonique est CE QUI EST STOCKE, jamais une preference arbitraire.
    stocke('www.exemple.com');
    const res = await proxy(req('exemple.com', '/'));
    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toBe('https://www.exemple.com/');
  });

  it('le CHEMIN est conservé', async () => {
    stocke('exemple.com');
    const res = await proxy(req('www.exemple.com', '/produits/abc'));
    expect(res.headers.get('location')).toBe('https://exemple.com/produits/abc');
  });

  it('les PARAMÈTRES sont conservés', async () => {
    stocke('exemple.com');
    const res = await proxy(req('www.exemple.com', '/recherche', '?q=sac&page=2'));
    expect(res.headers.get('location')).toBe('https://exemple.com/recherche?q=sac&page=2');
  });
});

describe('D-08 — aucune boucle, aucun saut de locataire', () => {
  it('la cible d’une redirection est un hôte qui RÉSOUT — le tour suivant sert', async () => {
    stocke('exemple.com');
    const res = await proxy(req('www.exemple.com', '/'));
    const cible = new URL(res.headers.get('location')!);
    const suivant = await proxy(req(cible.host, cible.pathname));
    expect(suivant.status).not.toBe(308);
  });

  it('hôte totalement inconnu -> AUCUNE redirection', async () => {
    fetchSiteByDomainMock.mockResolvedValue(null);
    const res = await proxy(req('inconnu-total.com', '/'));
    expect(res.status).not.toBe(308);
    expect(res.headers.get('location')).toBeNull();
  });

  it('le domaine d’un AUTRE site n’est jamais une cible : seule la variante est essayée', async () => {
    // `autre.com` appartient a un autre marchand. Une requete sur
    // `boutique.exemple.com` ne doit JAMAIS y aboutir.
    fetchSiteByDomainMock.mockImplementation(async (h: string) => (h === 'autre.com' ? 'autre-site' : null));
    const res = await proxy(req('boutique.exemple.com', '/'));
    expect(res.status).not.toBe(308);
    expect(fetchSiteByDomainMock.mock.calls.map((c) => c[0])).toEqual([
      'boutique.exemple.com',
      'www.boutique.exemple.com',
    ]);
  });
});

describe('D-08 — les hôtes de la plateforme ne sont jamais redirigés', () => {
  it.each(['deribfy.com', 'www.deribfy.com', 'localhost'])('%s passe sans redirection', async (h) => {
    const res = await proxy(req(h, '/'));
    expect(res.status).not.toBe(308);
    expect(fetchSiteByDomainMock).not.toHaveBeenCalled();
  });
});
