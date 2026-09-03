// Incident reel : "Je veux gerer une boutique en ligne mode 2 pour faciliter
// le travail" echouait avec "La generation IA a produit un resultat
// invalide." Cause tracee au code : detectSector() classe ce message en
// secteur 'shop' (il contient "boutique" ET "mode", tous deux dans la regex
// du secteur shop), et getSectorPrompt('shop') exigeait alors "MUST generate
// products array with 6-10 realistic products" -- une instruction opposee,
// dans le MEME message envoye au modele, aux regles Mode 2/3 qui demandent
// products: []. Ce test verifie la correction au niveau ou elle peut etre
// prouvee sans appel reseau : la construction du prompt elle-meme, pas le
// comportement du modele (non deterministe, hors de portee d'un test
// unitaire -- une verification en conditions reelles reste necessaire
// separement).
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: {} }));

import { detectSector, getSectorPrompt } from '../route';

describe('detectSector -- confirme le declencheur reel de l\'incident', () => {
  it('classe la phrase reelle de l\'incident en secteur "shop"', () => {
    expect(detectSector('Je veux gérer une boutique en ligne mode 2 pour faciliter le travail')).toBe('shop');
  });
});

describe('getSectorPrompt -- la clause produits contradictoire est supprimee quand le mode est deja connu (Mode 2/3)', () => {
  it('Mode 2 connu : aucune instruction de generer des produits', () => {
    const prompt = getSectorPrompt('shop', 2);
    expect(prompt).not.toContain('MUST generate');
    expect(prompt).not.toContain('6-10 realistic products');
  });

  it('Mode 3 connu : aucune instruction de generer des produits (meme contradiction que Mode 2, protegee de la meme facon)', () => {
    const prompt = getSectorPrompt('shop', 3);
    expect(prompt).not.toContain('MUST generate');
  });

  it('Mode 1 connu : l\'instruction produits est preservee (legitime, aucune regle Mode 1 ne s\'y oppose)', () => {
    const prompt = getSectorPrompt('shop', 1);
    expect(prompt).toContain('MUST generate');
    expect(prompt).toContain('6-10 realistic products');
  });

  it('Mode inconnu (chemin wizard) : instruction preservee mais explicitement subordonnee aux regles de Mode', () => {
    const prompt = getSectorPrompt('shop', null);
    expect(prompt).toContain('MUST generate');
    expect(prompt).toContain('subordinate to the MODE rules above');
  });

  it('meme protection pour le secteur restaurant (memes principes, pas seulement un correctif ponctuel sur "shop")', () => {
    const mode2 = getSectorPrompt('restaurant', 2);
    const mode1 = getSectorPrompt('restaurant', 1);
    expect(mode2).not.toContain('MUST generate');
    expect(mode1).toContain('MUST generate');
  });

  it('secteurs sans regle produits (services, portfolio) restent inchanges par le parametre knownMode', () => {
    expect(getSectorPrompt('services', 2)).toBe(getSectorPrompt('services', null));
    expect(getSectorPrompt('portfolio', 1)).toBe(getSectorPrompt('portfolio', null));
  });
});
